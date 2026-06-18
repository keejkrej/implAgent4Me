// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/tool-schema-runtime.ts
// Lines: 50-67
// impl Agent: see AGENTS.md — provider-owned tool schema normalization

export function normalizeProviderToolSchemas<
  TSchemaType extends TSchema = TSchema,
  TResult = unknown,
>(params: ProviderToolSchemaParams<TSchemaType, TResult>): AgentTool<TSchemaType, TResult>[] {
  const provider = params.provider.trim();
  const pluginNormalized = normalizeProviderToolSchemasWithPlugin({
    provider,
    config: params.config,
    workspaceDir: params.workspaceDir,
    env: params.env,
    runtimeHandle: params.runtimeHandle,
    allowRuntimePluginLoad: params.allowRuntimePluginLoad,
    context: buildProviderToolSchemaContext(params, provider),
  });
  return Array.isArray(pluginNormalized)
    ? (pluginNormalized as AgentTool<TSchemaType, TResult>[])
    : params.tools;
}
