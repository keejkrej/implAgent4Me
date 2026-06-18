// Copied excerpt from openclaw
// Source: openclaw/src/agents/system-prompt.ts
// Lines: 286-299
// impl Agent: see AGENTS.md — memory section injected into system prompt

function buildMemorySection(params: {
  isMinimal: boolean;
  includeMemorySection?: boolean;
  availableTools: Set<string>;
  citationsMode?: MemoryCitationsMode;
}) {
  if (params.isMinimal || params.includeMemorySection === false) {
    return [];
  }
  return buildMemoryPromptSection({
    availableTools: params.availableTools,
    citationsMode: params.citationsMode,
  });
}
