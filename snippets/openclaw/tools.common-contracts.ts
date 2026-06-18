// Copied excerpt from openclaw
// Source: openclaw/src/agents/tools/common.ts
// Lines: 25-58
// impl Agent: see AGENTS.md — tool type contracts (name, schema, execute)

export type AgentToolWithMeta<TParameters extends TSchema, TResult> = AgentTool<
  TParameters,
  TResult
> & {
  displaySummary?: string;
  prepareBeforeToolCallParams?: (
    params: unknown,
    ctx: { toolCallId?: string; hookContext?: unknown; signal?: AbortSignal },
  ) => unknown;
  finalizeBeforeToolCallParams?: (params: unknown, preparedParams: unknown) => unknown;
};

type ErasedAgentToolExecute = {
  execute(
    this: void,
    toolCallId: string,
    params: unknown,
    signal?: AbortSignal,
    onUpdate?: AgentToolUpdateCallback,
  ): Promise<AgentToolResult<unknown>>;
};

export type AnyAgentTool = Omit<AgentTool, "execute"> &
  ErasedAgentToolExecute & {
    displaySummary?: string;
    prepareBeforeToolCallParams?: AgentToolWithMeta<
      TSchema,
      unknown
    >["prepareBeforeToolCallParams"];
    finalizeBeforeToolCallParams?: AgentToolWithMeta<
      TSchema,
      unknown
    >["finalizeBeforeToolCallParams"];
  };
