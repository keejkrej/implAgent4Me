// Copied excerpt from eve
// Source: eve/packages/eve/src/harness/types.ts
// Lines: 50-74, 109-144
// impl Agent: see AGENTS.md

/**
 * Serializable session state passed between harness and runtime.
 *
 * Only contains plain data -- no resolved model instances or tool execute
 * functions. The harness resolves those at step time via injected config.
 */
export interface HarnessSession {
  readonly agent: SessionAgent;
  readonly compaction: CompactionConfig;
  readonly continuationToken: string;
  readonly history: ModelMessage[];
  readonly outputSchema?: JsonObject;
  /**
   * Stable identifier of the top user-facing session in the dispatch
   * chain. For a top-level session this field is `undefined` and
   * `sessionId` itself is the root. For any delegated subagent session,
   * `rootSessionId` carries the original root sessionId so descendant
   * dispatch sites (and observability tags) can attribute work back to
   * the user-facing session without walking the chain.
   */
  readonly rootSessionId?: string;
  readonly sessionId: string;
  readonly sandboxState?: SandboxState;
  readonly state?: SessionStateMap;
}

/**
 * Terminal result indicating the conversation is finished.
 */
export interface StepDone {
  readonly done: true;
  readonly output: unknown;
  /**
   * Marks a terminal turn that failed (e.g. a task-mode turn that could not
   * fulfil its output schema). For a delegated subagent this routes the result
   * to the parent as an error tool-result rather than an empty success.
   */
  readonly isError?: boolean;
}

/**
 * The harness's instruction to the runtime about what to do next.
 *
 * - A `StepFn` reference means "call this step immediately" (tool loop continuation).
 * - `null` means "park and wait for the next user message."
 * - `StepDone` means "the conversation is finished."
 */
export type StepNext = StepDone | StepFn | null;

/**
 * Result returned by one harness step invocation.
 */
export interface StepResult {
  readonly next: StepNext;
  readonly session: HarnessSession;
}

/**
 * A single step of AI work. Takes the current session and optional user input,
 * returns the updated session and an instruction for the runtime.
 */
export type StepFn = (session: HarnessSession, input?: StepInput) => Promise<StepResult>;
