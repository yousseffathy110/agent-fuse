import type { AgentFuse, ToolExecution } from "../agentfuse";

/**
 * The structural subset of a Vercel AI SDK tool used by AgentFuse.
 *
 * This intentionally does not import from `ai`, allowing consumers that do
 * not use the Vercel AI SDK to keep it out of their dependency graph.
 */
export interface VercelAIToolDefinition<
  TParameters = unknown,
  TResult = unknown,
  TContext extends unknown[] = unknown[],
> {
  description?: string;
  parameters?: unknown;
  execute: (parameters: TParameters, ...context: TContext) => TResult | Promise<TResult>;
}

export interface VercelAIToolOptions {
  fuse: AgentFuse;
  targetUrl: string;
  method?: ToolExecution["method"];
  toolName?: string;
}

type ToolParameters<TTool> = TTool extends {
  execute: (parameters: infer TParameters, ...context: any[]) => unknown;
}
  ? TParameters
  : never;

type ToolContext<TTool> = TTool extends {
  execute: (parameters: any, ...context: infer TContext) => unknown;
}
  ? TContext
  : never;

type ToolResult<TTool> = TTool extends { execute: (...args: any[]) => infer TResult }
  ? Awaited<TResult>
  : never;

/**
 * Routes a Vercel AI SDK tool's model-supplied arguments through AgentFuse.
 *
 * The returned object retains all original tool metadata (including
 * `description` and `parameters`), but its `execute` function returns the
 * downstream response from the AgentFuse gateway instead of invoking the
 * original local handler.
 */
export function wrapVercelAITool<
  TTool extends VercelAIToolDefinition<any, any, any>,
>(
  toolDefinition: TTool,
  options: VercelAIToolOptions,
): Omit<TTool, "execute"> & {
  execute: (
    parameters: ToolParameters<TTool>,
    ...context: ToolContext<TTool>
  ) => Promise<ToolResult<TTool>>;
} {
  const definitionName = (toolDefinition as unknown as { name?: unknown }).name;
  const toolName =
    options.toolName ??
    (typeof definitionName === "string" ? definitionName : "vercel_ai_tool");

  return {
    ...toolDefinition,
    async execute(
      parameters: ToolParameters<TTool>,
      ..._context: ToolContext<TTool>
    ): Promise<ToolResult<TTool>> {
      const result = await options.fuse.execute<ToolResult<TTool>>({
        toolName,
        targetUrl: options.targetUrl,
        method: options.method,
        arguments: parameters,
      });

      return result.data;
    },
  } as Omit<TTool, "execute"> & {
    execute: (
      parameters: ToolParameters<TTool>,
      ...context: ToolContext<TTool>
    ) => Promise<ToolResult<TTool>>;
  };
}
