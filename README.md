# AgentFuse ⚡

[![npm version](https://img.shields.io/npm/v/@youseffathy1/agentfuse.svg?color=6366f1)](https://www.npmjs.com/package/@youseffathy1/agentfuse)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-Ready-3178C6.svg)](https://www.typescriptlang.org/)

**AgentFuse** is an edge-native reverse proxy, circuit breaker, and idempotency firewall for autonomous AI agents. Built on **Cloudflare Workers** and **Upstash Redis**, it helps protect external APIs and database endpoints from runaway loops, duplicate tool executions, and destructive operations.

## Key capabilities

- 🛑 **Sliding-window circuit breaker**: halts agents that exceed the configured safety threshold with `429 Too Many Requests`.
- 🛡️ **Destructive action interception**: rejects `DELETE` requests and payloads containing `DROP`, `TRUNCATE`, or `PURGE` before they reach a downstream service with `403 Forbidden`.
- ⚡ **Edge idempotency cache**: hashes the agent ID, target URL, and tool arguments to return a previously successful response for repeated calls.
- 📣 **Out-of-band alerts**: sends circuit-breaker and destructive-operation alerts to configured Discord and Slack-compatible webhooks.

## Architecture flow

```text
[ Autonomous AI Agent ]
         │
         ▼  (HTTPS / SDK call)
[ AgentFuse Edge Proxy (Cloudflare Worker) ]
         │
         ├─► [ Upstash Redis: Check sliding-window rate limit ] ── (Tripped? 429)
         ├─► [ Payload inspector: Filter destructive actions ]  ── (Detected? 403)
         ├─► [ Edge cache: Check idempotency hash ]             ── (Hit? 200 cached)
         │
         ▼  (Forward request)
[ Target downstream API (Stripe, GitHub, DB, etc.) ]
```

## SDK quickstart

Install the official client package:

```bash
npm install @youseffathy1/agentfuse
```

```ts
import { AgentFuse } from "@youseffathy1/agentfuse";

const fuse = new AgentFuse({
  gatewayUrl: "https://agent-fuse.agentfuse.workers.dev",
  apiKey: process.env.AGENTFUSE_API_KEY!,
  agentId: "support_agent_prod",
});

try {
  const response = await fuse.execute({
    toolName: "fetch_customer_data",
    targetUrl: "https://api.example.com/customers/lookup",
    method: "POST",
    arguments: { customerId: "cust_98234" },
  });

  console.log("Data:", response.data);
  console.log("Served from edge cache:", response.cached);
} catch (error: unknown) {
  console.error("Execution blocked by AgentFuse:", error);
}
```

### Framework adapters

Install the framework packages you use in your application. AgentFuse keeps
`ai` and `@langchain/core` as optional peer dependencies, so projects that do
not use them do not install either package.

#### Vercel AI SDK (`ai`)

Wrap any tool definition without altering its schema or parameters:

```ts
import { wrapVercelAITool, AgentFuse } from "@youseffathy1/agentfuse";
import { tool } from "ai";
import { z } from "zod";

const fuse = new AgentFuse({
  gatewayUrl: "https://agent-fuse.agentfuse.workers.dev",
  apiKey: process.env.AGENTFUSE_API_KEY!,
  agentId: "customer_search_agent",
});

export const searchCustomer = wrapVercelAITool(
  tool({
    description: "Look up customer records by account ID",
    parameters: z.object({ accountId: z.string() }),
    execute: async ({ accountId }) => {
      // This local handler is bypassed; AgentFuse forwards to targetUrl.
      return { accountId, status: "active" };
    },
  }),
  {
    fuse,
    targetUrl: "https://api.example.com/customers/query",
  },
);
```

#### LangChain / LangGraph

Wrap structured tools to intercept `_call` and `invoke`:

```ts
import { wrapLangChainTool, AgentFuse } from "@youseffathy1/agentfuse";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const fuse = new AgentFuse({
  gatewayUrl: "https://agent-fuse.agentfuse.workers.dev",
  apiKey: process.env.AGENTFUSE_API_KEY!,
  agentId: "database_agent",
});

const rawTool = new DynamicStructuredTool({
  name: "query_database",
  description: "Execute read-only SQL queries",
  schema: z.object({ query: z.string() }),
  func: async ({ query }) => `Query executed: ${query}`,
});

export const safeDbTool = wrapLangChainTool(rawTool, {
  fuse,
  targetUrl: "https://api.example.com/db/query",
});
```

## Self-hosting the edge worker

### 1. Clone and install

```bash
git clone https://github.com/yousseffathy110/agent-fuse.git
cd agent-fuse
npm install
```

### 2. Configure local secrets

Create `.dev.vars` for local testing. This file is ignored by Git and must not be committed.

```ini
UPSTASH_REDIS_REST_URL="https://your-upstash-url.upstash.io"
UPSTASH_REDIS_REST_TOKEN="your-upstash-token"
AGENTFUSE_API_KEY="af_live_your_secret_key"
DISCORD_WEBHOOK_URL="https://discord.com/api/webhooks/..."
ALERT_WEBHOOK_URL="https://hooks.slack.com/services/..."
```

### 3. Deploy to Cloudflare Workers

Set your production secrets, then deploy:

```bash
npx wrangler secret put UPSTASH_REDIS_REST_URL
npx wrangler secret put UPSTASH_REDIS_REST_TOKEN
npx wrangler secret put AGENTFUSE_API_KEY
npx wrangler secret put DISCORD_WEBHOOK_URL
npx wrangler secret put ALERT_WEBHOOK_URL
npx wrangler deploy
```

The worker name and deployment configuration are defined in [`wrangler.toml`](./wrangler.toml).

## License

MIT © [Yousef Fathy](https://github.com/yousseffathy110)
