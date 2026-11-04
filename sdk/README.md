# @agentfuse-ai/core

TypeScript client for the AgentFuse edge gateway. Route an agent tool call
through the gateway to apply circuit breaking, destructive-operation checks,
and idempotency caching before the request reaches its downstream API.

## Installation

```bash
npm install @agentfuse-ai/core
```

`ai` (Vercel AI SDK) and `@langchain/core` are optional peer dependencies. You
only need to install one of them when using its corresponding adapter.

## Quick start

```ts
import { AgentFuse } from "@agentfuse-ai/core";

const fuse = new AgentFuse({
  gatewayUrl: "https://agent-fuse.agentfuse.workers.dev",
  apiKey: process.env.AGENTFUSE_API_KEY!,
  agentId: "support_agent_v1",
});

const result = await fuse.execute<{ id: string; status: string }>({
  toolName: "charge_invoice",
  targetUrl: "https://api.example.com/invoices/charge",
  method: "POST",
  arguments: { customerId: "cus_123", amount: 500 },
});

console.log(result.data);
console.log("Served from cache:", result.cached);
```

## API

### `new AgentFuse(config)`

| Option | Type | Description |
| --- | --- | --- |
| `gatewayUrl` | `string` | Base URL of the AgentFuse gateway. A trailing slash is supported. |
| `apiKey` | `string` | Gateway API key, sent as a Bearer token. |
| `agentId` | `string` | Stable identifier used for circuit-breaking and idempotency scope. |

### `fuse.execute(params)`

Sends one tool invocation to the gateway and resolves with
`{ data, cached }`. `cached` is `true` only when the gateway returns the
`X-Agent-Guard-Cache: HIT` response header.

| Option | Type | Default | Description |
| --- | --- | --- | --- |
| `toolName` | `string` | — | Name shown in gateway logs and alerts. |
| `targetUrl` | `string` | — | Downstream endpoint to call. |
| `arguments` | `Record<string, unknown>` | — | JSON payload forwarded to the downstream endpoint. |
| `method` | `GET \| POST \| PUT \| PATCH \| DELETE` | `POST` | HTTP method for the downstream request. |
| `headers` | `Record<string, string>` | — | Extra headers forwarded downstream. |
| `ttlSeconds` | `number` | `600` | Idempotency-cache lifetime for a successful response. |

The client throws an `Error` when the gateway blocks an unsafe request (`403`),
trips the circuit breaker (`429`), or returns any other non-success response.

## Framework adapters

The adapters are structural: they do not import Vercel AI SDK or LangChain at
runtime and preserve the wrapped tool's metadata.

### Vercel AI SDK

`wrapVercelAITool` returns the original tool definition with its `execute`
handler replaced. Model-supplied parameters are forwarded through AgentFuse;
the original local `execute` handler is not invoked.

```ts
import { AgentFuse, wrapVercelAITool } from "@agentfuse-ai/core";
import { tool } from "ai";
import { z } from "zod";

const fuse = new AgentFuse({ gatewayUrl, apiKey, agentId: "search_agent" });

const search = wrapVercelAITool(
  tool({
    description: "Search customer records",
    parameters: z.object({ query: z.string() }),
    execute: async () => ({}), // Replaced by the adapter.
  }),
  {
    fuse,
    targetUrl: "https://api.example.com/customers/search",
    method: "POST",
    // Optional; when omitted, uses the definition name or "vercel_ai_tool".
    toolName: "search_customers",
  },
);
```

### LangChain / LangGraph

`wrapLangChainTool` returns a proxy that forwards direct `_call(...)` and
`invoke(...)` calls through AgentFuse. Other fields and methods, such as
`name`, `description`, and `schema`, remain available on the wrapped tool.

```ts
import { AgentFuse, wrapLangChainTool } from "@agentfuse-ai/core";
import { DynamicStructuredTool } from "@langchain/core/tools";
import { z } from "zod";

const fuse = new AgentFuse({ gatewayUrl, apiKey, agentId: "database_agent" });

const queryDatabase = wrapLangChainTool(
  new DynamicStructuredTool({
    name: "query_database",
    description: "Execute a read-only database query",
    schema: z.object({ query: z.string() }),
    func: async ({ query }) => query,
  }),
  {
    fuse,
    targetUrl: "https://api.example.com/database/query",
  },
);
```

## Gateway behavior

AgentFuse applies the following server-side controls:

- A sliding-window circuit breaker rejects calls after 15 requests per agent
  in one minute (`429`).
- `DELETE` requests and argument payloads containing `DROP`, `TRUNCATE`, or
  `PURGE` are rejected before forwarding (`403`).
- Successful requests with the same agent ID, target URL, and arguments are
  cached for `ttlSeconds` (600 seconds by default).
- Configured Slack-compatible and Discord webhooks receive circuit-breaker and
  destructive-operation alerts.

## License

MIT
