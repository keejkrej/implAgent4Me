// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/agent/src/agent-loop.ts
// Lines: 717-962
// impl Agent: see AGENTS.md

		// Outer loop: continues when queued follow-up messages arrive after agent would stop
		while (true) {
			let hasMoreToolCalls = true;

			// Inner loop: process tool calls and steering messages
			while (hasMoreToolCalls || pendingMessages.length > 0) {
				if (isDeadlineExceeded(config.deadline)) {
					endAgentStream(stream, newMessages, telemetry, stepCounter.count);
					return;
				}
				// Yield at the top of each iteration to prevent busy-wait when
				// the agent loop is executing tool calls back-to-back.
				await yieldIfDue();
				if (!firstTurn) {
					stream.push({ type: "turn_start" });
				} else {
					firstTurn = false;
				}

				// Process pending messages (inject before next assistant response)
				if (pendingMessages.length > 0) {
					for (const message of pendingMessages) {
						stream.push({ type: "message_start", message });
						stream.push({ type: "message_end", message });
						currentContext.messages.push(message);
						newMessages.push(message);
					}
					pendingMessages = [];
				}

				// Refresh prompt/tool context from live state before each model call
				if (config.syncContextBeforeModelCall) {
					await config.syncContextBeforeModelCall(currentContext);
				}

				// Stream assistant response
				let recovered: HarmonyRecoveredToolCall | undefined;
				let message: AssistantMessage;
				try {
					message = await streamAssistantResponse(
						currentContext,
						config,
						signal,
						stream,
						telemetry,
						invokeAgentSpan,
						stepCounter,
						streamFn,
						harmonyRetryAttempt,
					);
					harmonyRetryAttempt = 0;
					harmonyTruncateResumeCount = 0;
				} catch (err) {
					if (!(err instanceof HarmonyLeakInterruption)) throw err;
					if (err.recovered) {
						if (harmonyTruncateResumeCount >= 2) {
							await emitHarmonyAudit(config, err, "escalated", harmonyRetryAttempt);
							throw new Error(
								`GPT-5 Harmony leak recurred after truncate-and-resume recovery (${signalListLabel(err.detection.signals)}).`,
							);
						}
						harmonyTruncateResumeCount++;
						recovered = err.recovered;
						message = recovered.message;
						await emitHarmonyAudit(config, err, "truncate_resume", harmonyRetryAttempt);
					} else {
						if (harmonyRetryAttempt >= 2) {
							await emitHarmonyAudit(config, err, "escalated", harmonyRetryAttempt);
							throw new Error(
								`GPT-5 Harmony leak persisted after ${harmonyRetryAttempt} retries (${signalListLabel(err.detection.signals)}).`,
							);
						}
						await emitHarmonyAudit(config, err, "abort_retry", harmonyRetryAttempt);
						harmonyRetryAttempt++;
						continue;
					}
				}
				if (recovered) {
					message = snapshotAssistantMessage(message);
					currentContext.messages.push(message);
					stream.push({ type: "message_start", message: snapshotAssistantMessage(message) });
					stream.push({ type: "message_end", message: snapshotAssistantMessage(message) });
				}
				newMessages.push(message);

				if (message.stopReason === "error" || message.stopReason === "aborted") {
					// Create placeholder tool results for any tool calls in the aborted message
					// This maintains the tool_use/tool_result pairing that the API requires
					type ToolCallContent = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;
					const toolCalls = message.content.filter((c): c is ToolCallContent => c.type === "toolCall");
					const toolResults: ToolResultMessage[] = [];
					for (const toolCall of toolCalls) {
						const result = createAbortedToolResult(toolCall, stream, message.stopReason, message.errorMessage);
						currentContext.messages.push(result);
						newMessages.push(result);
						toolResults.push(result);
						// The placeholder result above keeps the API's tool_use/tool_result
						// pairing intact, but no execute_tool span is started for these
						// calls. Mirror the run-collector entry directly so the run
						// summary's tool counters and `coverage.toolsInvoked` reflect
						// what the user actually saw on the wire.
						recordSkippedTool(telemetry, {
							toolCallId: toolCall.id,
							toolName: toolCall.name,
							status: message.stopReason === "aborted" ? "aborted" : "error",
						});
					}
					await emitTurnEnd(stream, currentContext, message, toolResults, config, signal);

					stream.push(buildAgentEndEvent(newMessages, telemetry, stepCounter.count));
					stream.end(newMessages);
					return;
				}

				// Run tools whenever the turn carries tool_use blocks AND was not truncated.
				// `stop_reason` is provider metadata that never goes back on the wire, so it
				// does not gate continuation validity: replaying a tool_use turn with the
				// tool_results appended is accepted whether the turn ended on `tool_use` or
				// `end_turn` (adaptive/interleaved-thinking Opus routinely emits tool calls
				// under `end_turn`; verified against the live Anthropic API). The only
				// continuation hazard is a thinking block carrying a stale/invalid signature,
				// which `transformMessages` already neutralizes — it strips the signature on
				// non-`toolUse` turns and the encoder downgrades the unsigned block to text,
				// which the API accepts. So treat `stop` (end_turn/pause_turn) the same as
				// `toolUse`. `length` (max_tokens) is the one reason we must NOT run: the
				// trailing tool_use may be truncated with incomplete arguments — those calls
				// are abandoned below. (`error`/`aborted` already returned above.)
				type ToolCallContent = Extract<AssistantMessage["content"][number], { type: "toolCall" }>;
				const toolCalls = message.content.filter((c): c is ToolCallContent => c.type === "toolCall");
				const runnableStop = message.stopReason === "toolUse" || message.stopReason === "stop";
				hasMoreToolCalls = runnableStop && toolCalls.length > 0;

				const deadlinePassed = isDeadlineExceeded(config.deadline);
				if (hasMoreToolCalls && deadlinePassed) {
					hasMoreToolCalls = false;
				}

				const toolResults: ToolResultMessage[] = [];
				if (hasMoreToolCalls) {
					const executionResult = await executeToolCalls(
						currentContext,
						message,
						signal,
						stream,
						config,
						telemetry,
						invokeAgentSpan,
					);

					toolResults.push(...executionResult.toolResults);

					for (const result of toolResults) {
						currentContext.messages.push(result);
						newMessages.push(result);
					}
				} else if (toolCalls.length > 0) {
					// Turn ended on a non-runnable reason (`length` truncation) or deadline was exceeded
					// but left toolCall blocks behind. pair each with a placeholder result.
					const skipReason = deadlinePassed ? "aborted" : message.stopReason === "length" ? "length" : "skipped";
					const skipErrMsg = deadlinePassed ? "Deadline exceeded" : undefined;
					for (const toolCall of toolCalls) {
						const result = createAbortedToolResult(toolCall, stream, skipReason, skipErrMsg);
						currentContext.messages.push(result);
						newMessages.push(result);
						toolResults.push(result);
						recordSkippedTool(telemetry, {
							toolCallId: toolCall.id,
							toolName: toolCall.name,
							status: deadlinePassed ? "aborted" : "skipped",
						});
					}
					if (message.stopReason === "length" && toolResults.length > 0 && !deadlinePassed) {
						hasMoreToolCalls = true;
					}
				}

				if (toolCalls.length > 0) {
					pausedTurnContinuations = 0;
				} else if (
					!hasMoreToolCalls &&
					message.stopReason === "stop" &&
					message.stopDetails?.type === "pause_turn" &&
					pausedTurnContinuations < MAX_PAUSED_TURN_CONTINUATIONS
				) {
					// Non-terminal stop: the provider ended the response but not the turn
					// (e.g. Codex `end_turn: false` on a commentary-only progress update).
					// Re-sample with the assistant message replayed so the model keeps
					// working; the next round folds steering/asides in like any other
					// mid-work turn.
					pausedTurnContinuations++;
					hasMoreToolCalls = true;
				}

				await emitTurnEnd(stream, currentContext, message, toolResults, config, signal);

				if (isDeadlineExceeded(config.deadline)) {
					endAgentStream(stream, newMessages, telemetry, stepCounter.count);
					return;
				}
				// On external abort (user interrupt), leave the steering queue intact: the
				// session aborts then continues, delivering the queue into a fresh run.
				// Draining it here would inject the messages right before a model call that
				// instantly aborts — message lands in history, agent never responds. The
				// mid-batch interrupt poll only peeks (hasSteeringMessages), so the queue
				// still owns every message until this dequeue.
				const steering = signal?.aborted ? [] : (await config.getSteeringMessages?.()) || [];
				if (hasMoreToolCalls) {
					// Mid-work: fold any non-interrupting asides into the next turn alongside steering.
					const asides = signal?.aborted ? [] : resolveAsides(await config.getAsideMessages?.());
					pendingMessages = asides.length > 0 ? [...steering, ...asides] : steering;
				} else {
					// Stop boundary: only steering (live user input) forces another turn here. Leave
					// asides for the outer drain below so a passive aside can't trigger an extra model
					// turn ahead of a queued follow-up — the outer drain batches asides + follow-ups together.
					pendingMessages = steering;
				}
			}

			if (isDeadlineExceeded(config.deadline)) {
				endAgentStream(stream, newMessages, telemetry, stepCounter.count);
				return;
			}

			// Agent would stop here. Drain non-interrupting asides + follow-up messages.
			await config.onBeforeYield?.();

			if (isDeadlineExceeded(config.deadline)) {
				endAgentStream(stream, newMessages, telemetry, stepCounter.count);
				return;
			}
			// Skip queue drains when externally aborted (same stranding hazard as above).
			// Re-poll steering too: a steer can land between the stop-boundary dequeue
			// above and this yield point (e.g. queued while onBeforeYield ran). Without
			// this poll it would strand in the queue until the next manual prompt.
			const lateSteering = signal?.aborted ? [] : (await config.getSteeringMessages?.()) || [];
			const asideMessages = signal?.aborted ? [] : resolveAsides(await config.getAsideMessages?.());
			const followUpMessages = signal?.aborted ? [] : (await config.getFollowUpMessages?.()) || [];
			if (lateSteering.length > 0 || asideMessages.length > 0 || followUpMessages.length > 0) {
				// Set as pending so the inner loop processes them before stopping.
				pendingMessages = [...lateSteering, ...asideMessages, ...followUpMessages];
				continue;
			}

			// No more messages, exit
			break;
		}
