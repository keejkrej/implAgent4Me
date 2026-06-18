// Copied excerpt from openclaw
// Source: openclaw/src/agents/tools/message-tool.ts
// Lines: 1160-1230
// impl Agent: see AGENTS.md — representative tool factory (schema + execute)

export function createMessageTool(options?: MessageToolOptions): AnyAgentTool {
  const loadConfigForTool = options?.getRuntimeConfig ?? getRuntimeConfig;
  // ... resolve channel context, build schema and description ...

  return {
    label: "Message",
    name: "message",
    displaySummary: "Send and manage messages across configured channels.",
    description,
    parameters: schema,
    execute: async (toolCallId, args, signal) => {
      if (signal?.aborted) {
        const err = new Error("Message send aborted");
        err.name = "AbortError";
        throw err;
      }
      // Shallow-copy so we don't mutate the original event args (used for logging/dedup).
      const params = { ...(args as Record<string, unknown>) };

      // Sanitize outbound text fields in three layers:
      //
      // 1. `stripFormattedReasoningMessage` — drops reasoning blocks
      // ... remainder dispatches runMessageAction ...
    },
  };
}
