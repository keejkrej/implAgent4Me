// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/agent/src/agent-loop.ts
// Lines: 993-1034
// impl Agent: see AGENTS.md

async function streamAssistantResponse(
	context: AgentContext,
	config: AgentLoopConfig,
	signal: AbortSignal | undefined,
	stream: EventStream<AgentEvent, AgentMessage[]>,
	telemetry: AgentTelemetry | undefined,
	invokeAgentSpan: Span | undefined,
	stepCounter: StepCounter,
	streamFn?: StreamFn,
	harmonyRetryAttempt = 0,
): Promise<AssistantMessage> {
	// Apply context transform if configured (AgentMessage[] → AgentMessage[])
	let messages = context.messages;
	if (config.transformContext) {
		messages = await config.transformContext(messages, signal);
	}

	// Convert to LLM-compatible messages (AgentMessage[] → Message[])
	const llmMessages = await config.convertToLlm(messages);
	const normalizedMessages = normalizeMessagesForProvider(llmMessages, config.model);

	const ownedDialect: Dialect | undefined = config.dialect ?? resolveOwnedDialectFromEnv(Bun.env.PI_DIALECT);
	const exampleDialect = ownedDialect ?? preferredDialect(config.model.id);
	// Build LLM context — append-only mode caches system prompt + tools
	// AND keeps an append-only message log so prior-turn bytes are stable.
	let llmContext: Context;
	if (config.appendOnlyContext) {
		config.appendOnlyContext.syncMessages(normalizedMessages);
		llmContext = config.appendOnlyContext.build(context, {
			intentTracing: !!config.intentTracing,
			exampleDialect,
		});
	} else {
		llmContext = {
			systemPrompt: context.systemPrompt,
			messages: normalizedMessages,
			tools: normalizeTools(context.tools, !!config.intentTracing, exampleDialect),
		};
	}
	if (config.transformProviderContext) {
		llmContext = config.transformProviderContext(llmContext, config.model);
	}
