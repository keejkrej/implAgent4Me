// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/agent/src/agent-loop.ts
// Lines: 1450-1526
// impl Agent: see AGENTS.md

async function executeToolCalls(
	currentContext: AgentContext,
	assistantMessage: AssistantMessage,
	signal: AbortSignal | undefined,
	stream: EventStream<AgentEvent, AgentMessage[]>,
	config: AgentLoopConfig,
	telemetry: AgentTelemetry | undefined,
	invokeAgentSpan: Span | undefined,
): Promise<{ toolResults: ToolResultMessage[] }> {
	const tools = currentContext.tools;
	const {
		hasSteeringMessages,
		getSteeringMessages,
		interruptMode = "immediate",
		getToolContext,
		transformToolCallArguments,
		intentTracing,
		beforeToolCall,
		afterToolCall,
	} = config;
	type ToolCallContent = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;
	const toolCalls = assistantMessage.content.filter((c): c is ToolCallContent => c.type === "toolCall");
	const emittedToolResults: ToolResultMessage[] = [];
	const toolCallInfos = toolCalls.map(call => ({ id: call.id, name: call.name }));
	const batchId = `${assistantMessage.timestamp ?? Date.now()}_${toolCalls[0]?.id ?? "batch"}`;
	const shouldInterruptImmediately = interruptMode !== "wait";
	const steeringAbortController = new AbortController();
	const toolSignal = signal
		? AbortSignal.any([signal, steeringAbortController.signal])
		: steeringAbortController.signal;
	const interruptState = { triggered: false };

	const records = toolCalls.map(toolCall => ({
		toolCall,
		// Tools emitted via OpenAI's custom-tool path (e.g. `apply_patch` on GPT-5)
		// come back under their wire-level name, which may differ from the
		// harness-internal `name`. Match on either, preferring `name` for
		// determinism if both somehow collide.
		tool:
			tools?.find(t => t.name === toolCall.name) ??
			tools?.find(t => t.customWireName !== undefined && t.customWireName === toolCall.name),
		args: toolCall.arguments as Record<string, unknown>,
		started: false,
		result: undefined as AgentToolResult<any> | undefined,
		isError: false,
		skipped: false,
		toolResultMessage: undefined as ToolResultMessage | undefined,
		resultEmitted: false,
	}));

	const checkSteering = async (): Promise<void> => {
		// `signal` (external/user abort) is checked separately from the internal
		// steeringAbortController: once the run is externally aborted it is
		// unwinding and the interrupt would be redundant.
		if (!shouldInterruptImmediately || interruptState.triggered || signal?.aborted) {
			return;
		}
		// Prefer the non-consuming peek (`hasSteeringMessages`) when available.
		// Fall back to calling `getSteeringMessages` directly when only it is
		// provided (e.g. in tests or minimal integrations without a separate
		// peek function). In that case the message is consumed here rather than
		// at the outer injection boundary, but the interrupt still fires.
		let hasMessages: boolean;
		if (hasSteeringMessages) {
			hasMessages = await hasSteeringMessages();
		} else if (getSteeringMessages) {
			const msgs = await getSteeringMessages();
			hasMessages = (msgs?.length ?? 0) > 0;
		} else {
			return;
		}
		if (hasMessages) {
			if (interruptState.triggered || signal?.aborted) return;
			interruptState.triggered = true;
			steeringAbortController.abort();
		}
	};
