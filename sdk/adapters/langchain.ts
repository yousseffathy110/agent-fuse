import type { AgentFuse, ToolExecution } from "../agentfuse";

/**
 * The structural subset shared by LangChain DynamicTool and StructuredTool.
 * No LangChain code is imported at runtime.
 */
export interface LangChainToolLike<TInput = unknown, TResult = unknown> {
  name: string;
  description: string;
  schema?: unknown;
  _call?: (input: TInput, ...args: any[]) => TResult | Promise<TResult>;
  invoke?: (input: TInput, ...args: any[]) => TResult | Promise<TResult>;
}

export interface LangChainToolOptions {
  fuse: AgentFuse;
  targetUrl: string;
  method?: ToolExecution["method"];
  toolName?: string;
}

type LangChainToolInput<TTool> = TTool extends LangChainToolLike<infer TInput, any>
  ? TInput
  : never;

type LangChainToolResult<TTool> = TTool extends LangChainToolLike<any, infer TResult>
  ? Awaited<TResult>
  : never;

/**
 * Returns a proxy around a LangChain DynamicTool or StructuredTool.
 *
 * Direct `_call(...)` and `.invoke(...)` calls are sent to AgentFuse; all
 * other instance fields and methods (including `name`, `description`, and
 * `schema`) remain available from the original tool.
 */
export function wrapLangChainTool<TTool extends LangChainToolLike<any, any>>(
  langChainTool: TTool,
  options: LangChainToolOptions,
): TTool {
  const executeThroughFuse = async (
    input: LangChainToolInput<TTool>,
  ): Promise<LangChainToolResult<TTool>> => {
    const result = await options.fuse.execute<LangChainToolResult<TTool>>({
      toolName: options.toolName ?? langChainTool.name,
      targetUrl: options.targetUrl,
      method: options.method,
      arguments: input,
    });

    return result.data;
  };

  return new Proxy(langChainTool, {
    get(target, property, receiver) {
      if (property === "_call" || property === "invoke") {
        return async (input: LangChainToolInput<TTool>, ..._args: unknown[]) =>
          executeThroughFuse(input);
      }

      return Reflect.get(target, property, receiver);
    },
  }) as TTool;
}
