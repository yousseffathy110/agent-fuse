# @agentfuse/sdk

Edge proxy and circuit-breaking client for autonomous AI agents. Intercept destructive operations, deduplicate identical tool calls, and eliminate runaway agent loops at the Cloudflare edge.

## Installation

```bash
npm install @agentfuse/sdk
```

## Quickstart

```typescript
import { AgentFuse } from "@agentfuse/sdk";

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

## Safety Features

- **Sliding-Window Circuit Breaker**: Halts runaway loops exceeding 15 calls/minute (`429`).
- **Destructive Operation Interception**: Blocks raw `DELETE` methods and SQL/database destructive keywords (`403`).
- **Idempotency Caching**: Returns cached responses for identical payloads within sub-50ms.
- **Cross-Platform Alerts**: Real-time notifications dispatched to Slack and Discord.
