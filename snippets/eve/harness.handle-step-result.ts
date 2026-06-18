// Copied excerpt from eve
// Source: eve/packages/eve/src/harness/tool-loop.ts
// Lines: 1407-1593
// impl Agent: see AGENTS.md

/**
 * Processes the step result: extracts input requests, decides whether to
 * park, continue the tool loop, or terminate.
 */
async function handleStepResult(input: {
  readonly config: ToolLoopHarnessConfig;
  readonly emit?: ToolLoopHarnessConfig["handleEvent"];
  readonly emissionState: ReturnType<typeof getHarnessEmissionState>;
  readonly promptMessages: readonly ModelMessage[];
  readonly result: HarnessStepResult;
  readonly runStep: StepFn;
  readonly session: HarnessSession;
}): Promise<StepResult> {
  const { config, emit, promptMessages, result, runStep } = input;
  let { emissionState, session } = input;

  const responseMessages = result.response.messages;
  const stepOutput = resolveAssistantStepText(responseMessages, result.text);

  const baseSession: HarnessSession = {
    ...session,
    compaction: createNextCompactionConfig(session.compaction, promptMessages, result),
  };

  if (isSandboxEnabled(config)) {
    const { getCodeModeInterrupt } = await loadCodeModeModule();
    const codeModeInterrupt = getCodeModeInterrupt(result);
    if (codeModeInterrupt !== undefined) {
      return parkOnCodeModeInterrupt({
        baseSession,
        config,
        emit,
        emissionState,
        interrupt: codeModeInterrupt,
        promptMessages,
        responseMessages,
      });
    }
  }

  const approvalRequests = extractToolApprovalInputRequests({ content: result.content ?? [] });
  const approvalRequestCallIds = new Set(approvalRequests.map((request) => request.action.callId));
  const questionRequests = extractQuestionInputRequests({
    toolCalls: result.toolCalls,
    excludedCallIds: approvalRequestCallIds,
  });
  const inputRequests: InputRequest[] = [...approvalRequests, ...questionRequests];
  const pendingRuntimeActions = ((result.toolCalls ?? []) as TypedToolCall<ToolSet>[])
    .filter((toolCall) => !isInvalidToolCall(toolCall))
    .filter((toolCall) => config.tools.get(toolCall.toolName)?.runtimeAction !== undefined)
    .map((toolCall) =>
      createRuntimeActionRequestFromToolCall({
        toolCall,
        tools: config.tools,
      }),
    );

  if (pendingRuntimeActions.length > 0) {
    // Stamp the live emission state onto the parked session so the
    // resume turn is classified as a continuation (turnId set), not a
    // fresh turn. Every other park path does this; without it the
    // parked session carries the default emission state (turnId ""),
    // because the post-preamble `setHarnessEmissionState` is dropped by
    // the later `session = pending.session` / `maybeCompact` rebinds.
    return {
      next: null,
      session: setHarnessEmissionState(
        setPendingRuntimeActionBatch({
          actions: pendingRuntimeActions,
          event: {
            sequence: emissionState.sequence,
            stepIndex: emissionState.stepIndex,
            turnId: emissionState.turnId,
          },
          responseMessages,
          session: { ...baseSession, history: [...promptMessages] },
        }),
        emissionState,
      ),
    };
  }

  // --- Park on input requests -----------------------------------------------

  if (inputRequests.length > 0) {
    let parkedSession = setPendingInputBatch({
      event: {
        sequence: emissionState.sequence,
        stepIndex: emissionState.stepIndex,
        turnId: emissionState.turnId,
      },
      requests: inputRequests,
      responseMessages,
      session: { ...baseSession, history: [...promptMessages] },
    });

    if (emit) {
      await emit(
        createInputRequestedEvent({
          requests: inputRequests,
          sequence: emissionState.sequence,
          stepIndex: emissionState.stepIndex,
          turnId: emissionState.turnId,
        }),
      );

      if (config.mode === "conversation") {
        emissionState = await emitTurnEpilogue(emit, emissionState, config.mode);
        parkedSession = setHarnessEmissionState(parkedSession, emissionState);
      }
    }

    return { next: null, session: parkedSession };
  }

  // --- Park on authorization request ------------------------------------------

  const authSignal = findAuthorizationSignalFromToolResults(result.toolResults);
  if (authSignal) {
    const { challenges } = authSignal;

    if (emit) {
      for (const ch of challenges) {
        await emit(
          createAuthorizationRequiredEvent({
            authorization: ch.challenge,
            name: ch.name,
            description: ch.challenge.instructions ?? `Authorization required for ${ch.name}`,
            webhookUrl: ch.hookUrl,
            sequence: emissionState.sequence,
            stepIndex: emissionState.stepIndex,
            turnId: emissionState.turnId,
          }),
        );
      }
    }

    return {
      next: null,
      session: setHarnessEmissionState(
        {
          ...baseSession,
          history: [...promptMessages],
          state: setPendingAuthorization(baseSession.state, { challenges }),
        },
        emissionState,
      ),
    };
  }

  // --- Continue or terminate ------------------------------------------------

  const prunedHistory = pruneToolResults(promptMessages);
  const historyWasPruned = prunedHistory !== promptMessages;

  // When pruning rewrites messages that the model already counted, the
  // exact input-token snapshot recorded by createNextCompactionConfig
  // becomes stale. Clear it so the next step falls back to the
  // estimation heuristic instead of overestimating and compacting early.
  let compaction = baseSession.compaction;
  if (historyWasPruned && compaction.lastKnownInputTokens !== undefined) {
    compaction = {
      recentWindowSize: compaction.recentWindowSize,
      threshold: compaction.threshold,
    };
  }

  const updatedHistory: ModelMessage[] = [...prunedHistory, ...responseMessages];
  let nextSession: HarnessSession = { ...baseSession, compaction, history: updatedHistory };

  // A `final_output` call is terminal even when the model emits it alongside
  // executing tools: continuing the loop would leave the no-execute call as a
  // dangling tool_use the next provider call rejects, and drop the result.
  const calledFinalOutput =
    nextSession.outputSchema !== undefined && extractFinalOutput(result) !== undefined;

  const continueLoop =
    !calledFinalOutput &&
    (responseMessages.at(-1)?.role === "tool" || hasDeferredStepInput(nextSession));
  if (continueLoop) {
    if (emit) {
      emissionState = advanceStep(emissionState);
      nextSession = setHarnessEmissionState(nextSession, emissionState);
    }

    return { next: runStep, session: nextSession };
  }
