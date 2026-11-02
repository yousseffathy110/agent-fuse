import { Redis } from "@upstash/redis/cloudflare";
import { generateActionHash } from "./crypto";
import { checkCircuitBreaker } from "./circuitBreaker";

export interface Env {
  UPSTASH_REDIS_REST_URL: string;
  UPSTASH_REDIS_REST_TOKEN: string;
  AGENTFUSE_API_KEY?: string;
  ALERT_WEBHOOK_URL?: string; // Slack Webhook URL
  DISCORD_WEBHOOK_URL?: string; // Discord Webhook URL
}

interface ProxyRequestPayload {
  agent_id: string;
  tool_name: string;
  target_url: string;
  method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  headers?: Record<string, string>;
  arguments: Record<string, any>;
  idempotency_window_seconds?: number;
}

const BLOCKED_OPERATIONS = ["DROP", "TRUNCATE", "PURGE"];

interface AlertField {
  name: string;
  value: string;
  inline?: boolean;
}

// Dispatches alerts concurrently to Slack and Discord.
async function broadcastAlert(
  env: Env,
  title: string,
  colorHex: number,
  fields: AlertField[],
): Promise<void> {
  const promises: Promise<Response>[] = [];

  if (env.DISCORD_WEBHOOK_URL) {
    const discordPayload = {
      embeds: [
        {
          title: `🚨 AgentFuse: ${title}`,
          color: colorHex,
          fields,
          timestamp: new Date().toISOString(),
        },
      ],
    };
    promises.push(
      fetch(env.DISCORD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(discordPayload),
      }),
    );
  }

  if (env.ALERT_WEBHOOK_URL) {
    const slackPayload = {
      text:
        `🚨 *[AgentFuse Alert] ${title}*\n` +
        fields.map((field) => `• *${field.name}:* ${field.value}`).join("\n"),
    };
    promises.push(
      fetch(env.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(slackPayload),
      }),
    );
  }

  if (promises.length > 0) {
    await Promise.allSettled(promises);
  }
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method !== "POST") {
      return new Response(JSON.stringify({ error: "Only POST allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // 1. Enforce Authentication
    const authHeader = request.headers.get("Authorization");
    if (env.AGENTFUSE_API_KEY && authHeader !== `Bearer ${env.AGENTFUSE_API_KEY}`) {
      return new Response(
        JSON.stringify({ error: "Unauthorized: Invalid or missing API key" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    const redis = new Redis({
      url: env.UPSTASH_REDIS_REST_URL.replace(/["']/g, "").trim(),
      token: env.UPSTASH_REDIS_REST_TOKEN.replace(/["']/g, "").trim(),
    });

    let payload: ProxyRequestPayload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: "Invalid JSON" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    const { agent_id, tool_name, target_url, method, arguments: args } = payload;
    const idempotencyWindow = payload.idempotency_window_seconds || 600;

    // 2. Sliding-Window Circuit Breaker Check
    const circuit = await checkCircuitBreaker(redis, agent_id);
    if (!circuit.allowed) {
      const alertLockKey = `alert:lock:${agent_id}:circuit`;
      const isAlertLocked = await redis.get(alertLockKey);

      if (!isAlertLocked) {
        await redis.set(alertLockKey, "locked", { ex: 60 });

        ctx.waitUntil(
          broadcastAlert(
            env,
            "Runaway Loop Intercepted (Circuit Tripped)",
            15158332, // Red
            [
              { name: "Agent ID", value: `\`${agent_id}\``, inline: true },
              { name: "Tool", value: `\`${tool_name}\``, inline: true },
              {
                name: "Velocity Threshold",
                value: `Exceeded ${circuit.currentCount} calls/min`,
                inline: true,
              },
              {
                name: "Action",
                value: "Execution halted (429). Cooldown active for 60s.",
                inline: false,
              },
            ],
          ),
        );
      }

      return new Response(
        JSON.stringify({
          status: "circuit_tripped",
          error: `Agent '${agent_id}' exceeded limit (${circuit.currentCount} calls/min). Execution halted.`,
        }),
        { status: 429, headers: { "Content-Type": "application/json" } }
      );
    }

    // 3. Safety Guard for Destructive Actions
    const serializedArgs = JSON.stringify(args).toUpperCase();
    if (
      method === "DELETE" ||
      BLOCKED_OPERATIONS.some((op) => serializedArgs.includes(op))
    ) {
      ctx.waitUntil(
        broadcastAlert(
          env,
          "Destructive Operation Intercepted",
          16753920, // Orange
          [
            { name: "Agent ID", value: `\`${agent_id}\``, inline: true },
            { name: "Tool", value: `\`${tool_name}\``, inline: true },
            { name: "Method", value: `\`${method}\``, inline: true },
            { name: "Payload", value: `\`\`\`json\n${JSON.stringify(args, null, 2)}\n\`\`\``, inline: false },
          ]
        )
      );

      return new Response(
        JSON.stringify({
          status: "intercepted",
          error: "Action flagged as destructive. Operator approval required.",
          agent_id,
          payload_preview: args,
        }),
        { status: 403, headers: { "Content-Type": "application/json" } }
      );
    }

    // 4. Idempotency Cache Lookup
    const actionHash = await generateActionHash(agent_id, target_url, args);
    const idempotencyKey = `idemp:${actionHash}`;

    const cachedResponse = await redis.get(idempotencyKey);
    if (cachedResponse !== null && cachedResponse !== undefined) {
      const body =
        typeof cachedResponse === "string"
          ? cachedResponse
          : JSON.stringify(cachedResponse);

      return new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Guard-Cache": "HIT",
        },
      });
    }

    // 5. Upstream Dispatch
    try {
      const upstreamResponse = await fetch(target_url, {
        method,
        headers: {
          "Content-Type": "application/json",
          ...(payload.headers || {}),
        },
        body: method !== "GET" ? JSON.stringify(args) : undefined,
      });

      const responseBody = await upstreamResponse.text();

      if (upstreamResponse.ok) {
        await redis.set(idempotencyKey, responseBody, { ex: idempotencyWindow });
      }

      return new Response(responseBody, {
        status: upstreamResponse.status,
        headers: {
          "Content-Type": "application/json",
          "X-Agent-Guard-Cache": "MISS",
        },
      });
    } catch (err: any) {
      return new Response(
        JSON.stringify({ error: "Upstream request failed", details: err.message }),
        { status: 502, headers: { "Content-Type": "application/json" } }
      );
    }
  },
};
