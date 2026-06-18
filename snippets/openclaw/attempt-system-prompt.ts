// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/run/attempt-system-prompt.ts
// Lines: 39-59
// impl Agent: see AGENTS.md — provider transform wrapper around embedded prompt

export function buildAttemptSystemPrompt(
  params: BuildAttemptSystemPromptParams,
): AttemptSystemPrompt {
  const baseSystemPrompt = buildEmbeddedSystemPrompt(params.embeddedSystemPrompt);
  const systemPrompt = params.isRawModelRun
    ? ""
    : params.transformProviderSystemPrompt({
        provider: params.providerTransform.provider,
        config: params.providerTransform.config,
        workspaceDir: params.providerTransform.workspaceDir,
        context: {
          ...params.providerTransform.context,
          systemPrompt: baseSystemPrompt,
        },
      });

  return {
    baseSystemPrompt,
    systemPrompt,
  };
}
