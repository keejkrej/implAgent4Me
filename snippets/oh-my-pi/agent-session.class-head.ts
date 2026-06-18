// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/session/agent-session.ts
// Lines: 1049-1069
// impl Agent: see AGENTS.md

export class AgentSession {
	readonly agent: Agent;
	readonly sessionManager: SessionManager;
	readonly settings: Settings;
	readonly yieldQueue: YieldQueue;
	fileSnapshotStore?: InMemorySnapshotStore;
	#autoApprove: boolean;

	#powerAssertion: MacOSPowerAssertion | undefined;

	readonly configWarnings: string[] = [];

	#scopedModels: Array<{ model: Model; thinkingLevel?: ThinkingLevel }>;
	/** Effective, metadata-clamped thinking level applied to the agent (never `auto`). */
	#thinkingLevel: ThinkingLevel | undefined;
	/** True when the user configured `auto`; the effective level is resolved per turn. */
	#autoThinking: boolean = false;
	/** The level `auto` last resolved to (for UI); undefined until a turn is classified. */
	#autoResolvedLevel: Effort | undefined;
	#promptTemplates: PromptTemplate[];
	#slashCommands: FileSlashCommand[];
