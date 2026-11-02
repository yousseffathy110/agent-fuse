import {
  AgentFuse,
  wrapLangChainTool,
  wrapVercelAITool,
} from "./sdk/dist/agentfuse.mjs";

declare const process: {
  env: Record<string, string | undefined>;
  exitCode?: number;
};

const gatewayUrl =
  process.env.AGENTFUSE_GATEWAY_URL ?? "https://agent-fuse.agentfuse.workers.dev";
const apiKey = process.env.AGENTFUSE_API_KEY;
const targetUrl = process.env.AGENTFUSE_TEST_TARGET_URL ?? "https://httpbin.org/post";

if (!apiKey) {
  throw new Error(
    "Set AGENTFUSE_API_KEY to run this live gateway adapter smoke test.",
  );
}

const fuse = new AgentFuse({
  gatewayUrl,
  apiKey,
  agentId: `adapter_smoke_test_${Date.now()}`,
});

interface EchoResponse {
  json?: Record<string, unknown>;
}

// This has the same shape as an `ai` package tool() result. No `ai` install is
// required because the adapter uses structural typing.
const vercelTool = {
  name: "vercel_echo",
  description: "Echoes a model-supplied message.",
  parameters: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  async execute(_input: { message: string }): Promise<EchoResponse> {
    throw new Error("The local Vercel handler should not run when wrapped.");
  },
};

// This mirrors the public fields and _call/invoke behavior of a LangChain tool.
class SimulatedLangChainTool {
  name = "langchain_echo";
  description = "Echoes a LangChain tool input.";
  schema = { type: "object" };

  async _call(_input: { message: string }): Promise<EchoResponse> {
    throw new Error("The local LangChain handler should not run when wrapped.");
  }

  async invoke(input: { message: string }): Promise<EchoResponse> {
    return this._call(input);
  }
}

async function main() {
  const protectedVercelTool = wrapVercelAITool(vercelTool, {
    fuse,
    targetUrl,
    method: "POST",
  });
  const protectedLangChainTool = wrapLangChainTool(new SimulatedLangChainTool(), {
    fuse,
    targetUrl,
    method: "POST",
  });

  const [vercelResponse, langChainResponse] = await Promise.all([
    protectedVercelTool.execute({ message: "Hello from Vercel AI SDK" }),
    protectedLangChainTool.invoke({ message: "Hello from LangChain" }),
  ]);

  console.log("Vercel adapter response:", vercelResponse.json);
  console.log("LangChain adapter response:", langChainResponse.json);
  console.log("Adapter smoke test passed through:", gatewayUrl);
}

main().catch((error: unknown) => {
  console.error("Adapter smoke test failed:", error);
  process.exitCode = 1;
});
