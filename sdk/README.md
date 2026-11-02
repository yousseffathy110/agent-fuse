# @youseffathy1/agentfuse

Edge proxy and circuit-breaking client for autonomous AI agents. Intercept destructive operations, deduplicate identical tool calls, and eliminate runaway agent loops at the Cloudflare edge.

## Installation

```bash
npm install @youseffathy1/agentfuse
```

## Quickstart

```typescript
import { AgentFuse } from "@youseffathy1/agentfuse";

const fuse = new AgentFuse({
  gatewayUrl: "https://agent-fuse.agentfuse.workers.dev",
  apiKey: process.env.AGENTFUSE_API_KEY!,
  agentId: "support_agent_v1",
});

// Wrap tool execution inside your agent loop
const result = await fuse.execute({
  toolName: "charge_invoice",
  targetUrl: "https://api.stripe.com/v1/charges",
  method: "POST",
  arguments: { customer_id: "cus_123", amount: 500 },
});

console.log(result.data);
console.log("Cached at edge:", result.cached);
```

## Framework tool adapters

AgentFuse has no runtime dependency on Vercel AI SDK or LangChain. Both are
optional peer dependencies; the adapters use their public tool shapes and keep
the original metadata intact.

```typescript
import { AgentFuse, wrapVercelAITool, wrapLangChainTool } from "@youseffathy1/agentfuse";

const protectedVercelTool = wrapVercelAITool(myVercelTool, {
  fuse,
  targetUrl: "https://api.example.com/tools/search",
});

const protectedLangChainTool = wrapLangChainTool(myLangChainTool, {
  fuse,
  targetUrl: "https://api.example.com/tools/search",
});
```

`wrapVercelAITool` replaces the definition's `execute` handler, while
`wrapLangChainTool` returns a proxy that intercepts `_call` and `invoke`.
Both route the model-supplied input through `fuse.execute` and return the
downstream response.

## Safety Features

- **Sliding-Window Circuit Breaker**: Halts runaway loops exceeding 15 calls/minute (`429`).
- **Destructive Operation Interception**: Blocks raw `DELETE` methods and SQL/database destructive keywords (`403`).
- **Idempotency Caching**: Returns cached responses for identical payloads within sub-50ms.
- **Cross-Platform Alerts**: Real-time notifications dispatched to Slack and Discord.
