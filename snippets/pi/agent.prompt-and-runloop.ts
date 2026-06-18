// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/agent/src/agent.ts
// Lines: 879-1095
// impl Agent: see AGENTS.md

	/** Send a prompt with an AgentMessage */
	async prompt(message: AgentMessage | AgentMessage[], options?: AgentPromptOptions): Promise<void>;
	async prompt(input: string, options?: AgentPromptOptions): Promise<void>;
	async prompt(input: string, images?: ImageContent[], options?: AgentPromptOptions): Promise<void>;
	async prompt(
		input: string | AgentMessage | AgentMessage[],
		imagesOrOptions?: ImageContent[] | AgentPromptOptions,
		options?: AgentPromptOptions,
	) {
		if (this.#state.isStreaming) {
			throw new AgentBusyError();
		}

		const model = this.#state.model;
		if (!model) throw new Error("No model configured");

		let msgs: AgentMessage[];
		let promptOptions: AgentPromptOptions | undefined;
		let images: ImageContent[] | undefined;

		if (Array.isArray(input)) {
			msgs = input;
			promptOptions = imagesOrOptions as AgentPromptOptions | undefined;
		} else if (typeof input === "string") {
			if (Array.isArray(imagesOrOptions)) {
				images = imagesOrOptions;
				promptOptions = options;
			} else {
				promptOptions = imagesOrOptions;
			}
			const content: Array<TextContent | ImageContent> = [{ type: "text", text: input }];
			if (images && images.length > 0) {
				content.push(...images);
			}
			msgs = [
				{
					role: "user",
					content,
					timestamp: Date.now(),
				},
			];
		} else {
			msgs = [input];
			promptOptions = imagesOrOptions as AgentPromptOptions | undefined;
		}

		await this.#runLoop(msgs, promptOptions);
	}

	/**
	 * Continue from current context (used for retries and resuming queued messages).
	 */
	async continue() {
		if (this.#state.isStreaming) {
			throw new AgentBusyError();
		}

		const messages = this.#state.messages;
		if (messages.length === 0) {
			throw new Error("No messages to continue from");
		}
		if (messages[messages.length - 1].role === "assistant") {
			const queuedSteering = this.#dequeueSteeringMessages();
			if (queuedSteering.length > 0) {
				await this.#runLoop(queuedSteering, { skipInitialSteeringPoll: true });
				return;
			}

			const queuedFollowUp = this.#dequeueFollowUpMessages();
			if (queuedFollowUp.length > 0) {
				await this.#runLoop(queuedFollowUp);
				return;
			}

			throw new Error("Cannot continue from message role: assistant");
		}

		await this.#runLoop(undefined);
	}

	/**
	 * Run the agent loop.
	 * If messages are provided, starts a new conversation turn with those messages.
	 * Otherwise, continues from existing context.
	 */
	async #runLoop(messages?: AgentMessage[], options?: AgentPromptOptions & { skipInitialSteeringPoll?: boolean }) {
		const model = this.#state.model;
		if (!model) throw new Error("No model configured");

		let skipInitialSteeringPoll = options?.skipInitialSteeringPoll === true;
		using _ = new EventLoopKeepalive();
		const { promise, resolve } = Promise.withResolvers<void>();
		this.#runningPrompt = promise;
		this.#resolveRunningPrompt = resolve;

		this.#abortController = new AbortController();
		this.#state.isStreaming = true;
		this.#state.streamMessage = null;
		this.#state.error = undefined;

		// Clear Cursor tool result buffer at start of each run
		this.#cursorToolResultBuffer = [];

		const reasoning = this.#state.thinkingLevel;

		const context: AgentContext = {
			systemPrompt: this.#state.systemPrompt,
			messages: this.#state.messages.slice(),
			tools: this.#state.tools,
		};

		const cursorOnToolResult =
			this.#cursorExecHandlers || this.#cursorOnToolResult
				? async (message: ToolResultMessage) => {
						let finalMessage = message;
						if (this.#cursorOnToolResult) {
							try {
								const updated = await this.#cursorOnToolResult(message);
								if (updated) {
									finalMessage = updated;
								}
							} catch {}
						}
						// Buffer tool result with current text length for correct ordering later.
						// Cursor executes tools server-side during streaming, so the assistant message
						// already incorporates results. We buffer here and emit in correct order
						// when the assistant message ends.
						const textLength = this.#getAssistantTextLength(this.#state.streamMessage);
						this.#cursorToolResultBuffer.push({ toolResult: finalMessage, textLengthAtCall: textLength });
						return finalMessage;
					}
				: undefined;

		const getToolChoice = () => {
			const queuedToolChoice = this.#getToolChoice?.();
			if (queuedToolChoice !== undefined) {
				return refreshToolChoiceForActiveTools(queuedToolChoice, this.#state.tools);
			}
			return refreshToolChoiceForActiveTools(options?.toolChoice, this.#state.tools);
		};

		const config: AgentLoopConfig = {
			model,
			reasoning,
			disableReasoning: this.#state.disableReasoning,
			temperature: this.#temperature,
			topP: this.#topP,
			topK: this.#topK,
			minP: this.#minP,
			presencePenalty: this.#presencePenalty,
			repetitionPenalty: this.#repetitionPenalty,
			serviceTier: this.#serviceTier,
			hideThinkingSummary: this.#hideThinkingSummary,
			interruptMode: this.#interruptMode,
			sessionId: this.#sessionId,
			deadline: this.#deadline,
			promptCacheKey: this.#promptCacheKey,
			metadata: this.#metadataResolver ? undefined : this.#metadata,
			metadataResolver: this.#metadataResolver,
			providerSessionState: this.#providerSessionState,
			thinkingBudgets: this.#thinkingBudgets,
			maxRetryDelayMs: this.#maxRetryDelayMs,
			kimiApiFormat: this.#kimiApiFormat,
			preferWebsockets: this.#preferWebsockets,
			convertToLlm: this.#convertToLlm,
			transformProviderContext: this.#transformProviderContext,
			transformContext: this.#transformContext,
			onPayload: this.#onPayload,
			onResponse: this.#onResponse,
			onSseEvent: this.#onSseEvent,
			getApiKey: this.getApiKey,
			getToolContext: this.#getToolContext,
			syncContextBeforeModelCall: async context => {
				if (this.#listeners.size > 0) {
					await Bun.sleep(0);
				}
				context.systemPrompt = this.#state.systemPrompt;
				context.tools = this.#state.tools;
			},
			cursorExecHandlers: this.#cursorExecHandlers,
			cursorOnToolResult,
			transformToolCallArguments: this.#transformToolCallArguments,
			intentTracing: this.#intentTracing,
			dialect: this.#dialect,
			abortOnFabricatedToolResult: this.#abortOnFabricatedToolResult,
			appendOnlyContext: this.#appendOnlyContext,
			beforeToolCall: this.beforeToolCall ? (ctx, signal) => this.beforeToolCall?.(ctx, signal) : undefined,
			afterToolCall: this.afterToolCall ? (ctx, signal) => this.afterToolCall?.(ctx, signal) : undefined,
			transformAssistantMessage: this.transformAssistantMessage
				? (message, signal) => this.transformAssistantMessage?.(message, signal)
				: undefined,
			onAssistantMessageEvent: this.#onAssistantMessageEvent,
			onHarmonyLeak: this.#onHarmonyLeak,
			onTurnEnd: (messages, signal) => this.#onTurnEnd?.(messages, signal),
			getToolChoice,
			getReasoning: () => this.#state.thinkingLevel,
			getDisableReasoning: () => this.#state.disableReasoning,
			getSteeringMessages: async () => {
				if (skipInitialSteeringPoll) {
					skipInitialSteeringPoll = false;
					return [];
				}
				return this.#dequeueSteeringMessages();
			},
			hasSteeringMessages: () => this.#steeringQueue.length > 0,
			getFollowUpMessages: async () => this.#dequeueFollowUpMessages(),
			getAsideMessages: async () => (await this.#asideMessageProvider?.()) ?? [],
			onBeforeYield: () => this.#onBeforeYield?.(),
			telemetry: this.#telemetry,
		};

		let partial: AgentMessage | null = null;

		try {
			const stream = messages
				? agentLoop(messages, context, config, this.#abortController.signal, this.streamFn)
				: agentLoopContinue(context, config, this.#abortController.signal, this.streamFn);
