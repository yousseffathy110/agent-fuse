import { AgentFuse } from "./sdk/dist/agentfuse.mjs";

const fuse = new AgentFuse({
  gatewayUrl: "https://agent-fuse.agentfuse.workers.dev",
  apiKey: "af_live_9f83b2a1c0d4e5",
  agentId: `burst_bot_${Date.now()}`,
});

async function main() {
  console.log("Firing 20 concurrent requests against compiled SDK...\n");
  const requests = Array.from({ length: 20 }, (_, i) => i + 1);

  await Promise.all(
    requests.map(async (num) => {
      try {
        const res = await fuse.execute({
          toolName: "ping_service",
          targetUrl: "https://httpbin.org/post",
          method: "POST",
          arguments: { burst_id: num, ts: Date.now() },
        });
        console.log(`Call ${num}: 200 OK (cached: ${res.cached})`);
      } catch (err: any) {
        console.log(`Call ${num}: 429 Intercepted -> ${err.message}`);
      }
    })
  );
}

main().catch(console.error);
