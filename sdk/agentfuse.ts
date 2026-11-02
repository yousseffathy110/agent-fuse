export interface AgentFuseConfig {
  gatewayUrl: string;
  apiKey: string;
  agentId: string;
}

export interface ToolExecution<TArgs = Record<string, any>> {
  toolName: string;
  targetUrl: string;
  method?: "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
  arguments: TArgs;
  headers?: Record<string, string>;
  ttlSeconds?: number;
}

export class AgentFuse {
  constructor(private config: AgentFuseConfig) {}

  async execute<TResponse = any>(params: ToolExecution): Promise<{ data: TResponse; cached: boolean }> {
    const res = await fetch(`${this.config.gatewayUrl.replace(/\/$/, "")}/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        agent_id: this.config.agentId,
        tool_name: params.toolName,
        target_url: params.targetUrl,
        method: params.method || "POST",
        arguments: params.arguments,
        headers: params.headers,
        idempotency_window_seconds: params.ttlSeconds || 600,
      }),
    });

    if (res.status === 403) {
      const body = (await res.json()) as { error?: string };
      throw new Error(
        `[AgentFuse Intercepted] Unsafe action blocked: ${body?.error || "Action flagged as destructive"}`,
      );
    }

    if (res.status === 429) {
      throw new Error(`[AgentFuse Circuit Tripped] Agent exceeded safety call limit.`);
    }

    if (!res.ok) {
      throw new Error(`[AgentFuse Error] Status: ${res.status}`);
    }

    const cached = res.headers.get("x-agent-guard-cache") === "HIT";
    const data = (await res.json()) as TResponse;
    return { data, cached };
  }
}

export { wrapLangChainTool } from "./adapters/langchain";
export type { LangChainToolLike, LangChainToolOptions } from "./adapters/langchain";
export { wrapVercelAITool } from "./adapters/vercel";
export type { VercelAIToolDefinition, VercelAIToolOptions } from "./adapters/vercel";
