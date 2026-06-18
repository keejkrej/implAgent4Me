// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-subscribe.ts
// Lines: 162-219
// impl Agent: see AGENTS.md — on_event / stream bridge from pi session to gateway

export function subscribeEmbeddedAgentSession(params: SubscribeEmbeddedAgentSessionParams) {
  const log = resolveEmbeddedAgentSessionLogger(params.messageChannel);
  const reasoningMode = params.reasoningMode ?? "off";
  const canShowReasoning = params.thinkingLevel !== "off";
  const toolResultFormat = params.toolResultFormat ?? "markdown";
  const useMarkdown = toolResultFormat === "markdown";
  const initialPendingToolMediaUrls = collectPendingMediaFromInternalEvents(params.internalEvents);
  const state: EmbeddedAgentSubscribeState = {
    assistantTexts: [],
    toolMetas: [],
    acceptedSessionSpawns: [],
    toolMetaById: new Map(),
    toolSummaryById: new Set(),
    itemActiveIds: new Set(),
    itemStartedCount: 0,
    itemCompletedCount: 0,
    lastToolError: undefined,
    blockReplyBreak: params.blockReplyBreak ?? "text_end",
    reasoningMode,
    includeReasoning: reasoningMode === "on" && canShowReasoning,
    shouldEmitPartialReplies: !(reasoningMode === "on" && !params.onBlockReply),
    streamReasoning:
      reasoningMode === "stream" &&
      canShowReasoning &&
      typeof params.onReasoningStream === "function",
    deltaBuffer: "",
    blockBuffer: "",
    blockState: { thinking: false, final: false, inlineCode: createInlineCodeState() },
    partialBlockState: { thinking: false, final: false, inlineCode: createInlineCodeState() },
    lastStreamedAssistant: undefined,
    lastStreamedAssistantCleaned: undefined,
    emittedAssistantUpdate: false,
    lastStreamedReasoning: undefined,
    lastBlockReplyText: undefined,
    lastDeliveredBlockReplyText: undefined,
    deferBlockReplyDelivery: typeof params.onBeforeTerminalDelivery === "function",
    deferredBlockReplies: [],
    deferredAssistantEvents: [],
    toolExecutionSinceLastBlockReply: false,
    reasoningStreamOpen: false,
    assistantMessageIndex: 0,
    lastAssistantStreamItemId: undefined,
    lastAssistantTextMessageIndex: -1,
    lastAssistantTextNormalized: undefined,
    lastAssistantTextTrimmed: undefined,
    assistantTextBaseline: 0,
    suppressBlockChunks: false,
    lastReasoningSent: undefined,
    pendingAssistantUsage: undefined,
    assistantUsageCommitted: false,
    compactionInFlight: false,
    lastCompactionTokensAfter: undefined,
    pendingCompactionRetry: 0,
    compactionRetryResolve: undefined,
    compactionRetryReject: undefined,
    compactionRetryPromise: null,
    unsubscribed: false,
    // ... remainder wires session.subscribe handlers ...
  };
