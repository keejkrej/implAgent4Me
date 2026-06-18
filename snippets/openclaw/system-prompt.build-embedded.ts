// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/system-prompt.ts
// Lines: 22-91, 137-139
// impl Agent: see AGENTS.md — system prompt facade over configured sections

export function buildEmbeddedSystemPrompt(params: {
  config?: OpenClawConfig;
  agentId?: string;
  workspaceDir: string;
  defaultThinkLevel?: ThinkLevel;
  reasoningLevel?: ReasoningLevel;
  extraSystemPrompt?: string;
  ownerNumbers?: string[];
  ownerDisplay?: "raw" | "hash";
  ownerDisplaySecret?: string;
  reasoningTagHint: boolean;
  heartbeatPrompt?: string;
  skillsPrompt?: string;
  docsPath?: string;
  sourcePath?: string;
  ttsHint?: string;
  reactionGuidance?: {
    level: "minimal" | "extensive";
    channel: string;
  };
  workspaceNotes?: string[];
  promptMode?: PromptMode;
  silentReplyPromptMode?: SilentReplyPromptMode;
  sourceReplyDeliveryMode?: SourceReplyDeliveryMode;
  subagentDelegationMode?: SubagentDelegationMode;
  acpEnabled?: boolean;
  promptSurface?: AgentPromptSurfaceKind;
  nativeCommandNames?: string[];
  nativeCommandGuidanceLines?: string[];
  runtimeInfo: {
    agentId?: string;
    sessionKey?: string;
    sessionId?: string;
    host: string;
    os: string;
    arch: string;
    node: string;
    model: string;
    provider?: string;
    capabilities?: string[];
    channel?: string;
    chatType?: ChatType;
    channelActions?: string[];
    activeProcessSessions?: ActiveProcessSessionReference[];
  };
  messageToolHints?: string[];
  toolSchemaDirectoryPrompt?: string;
  sandboxInfo?: EmbeddedSandboxInfo;
  capabilityToolNames?: string[];
  tools: AgentTool[];
  modelAliasLines?: string[];
  userTimezone: string;
  userTime?: string;
  userTimeFormat?: ResolvedTimeFormat;
  contextFiles?: EmbeddedContextFile[];
  bootstrapMode?: BootstrapMode;
  bootstrapTruncationNotice?: string;
  includeMemorySection?: boolean;
  memoryCitationsMode?: MemoryCitationsMode;
  promptContribution?: ProviderSystemPromptContribution;
}): string {
  return buildConfiguredAgentSystemPrompt({
  // ... forwards all params to buildConfiguredAgentSystemPrompt ...
  });
}

export function applySystemPromptToSession(session: AgentSession, systemPrompt: string) {
  session.setBaseSystemPrompt(systemPrompt.trim());
}
