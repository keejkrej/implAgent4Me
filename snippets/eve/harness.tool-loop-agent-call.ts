// Copied excerpt from eve
// Source: eve/packages/eve/src/harness/tool-loop.ts
// Lines: 545-798
// impl Agent: see AGENTS.md

    // --- Execute via ToolLoopAgent ------------------------------------------

    /*
     * The `onError` override suppresses the AI SDK's default
     * `console.error(error)` handler inside `streamText`. Errors are
     * handled by the harness catch block and emitted as stream events.
     */
    // Hydrate `eve-sandbox:` ref FileParts into inline bytes for the
    // model call only. The result is transient — `messages` itself
    // remains ref-only so it can flow into `session.history` without
    // bloating every future step boundary.
    const hydratedMessages = await hydrateSandboxAttachments(messages);

    // AI SDK rejects role:"system" in `messages` — route system entries
    // from durable history to `instructions` instead.
    const systemMessages: SystemModelMessage[] = [];
    const nonSystemMessages: ModelMessage[] = [];
    for (const entry of hydratedMessages) {
      if (entry.role === "system") {
        systemMessages.push(entry);
      } else {
        nonSystemMessages.push(entry);
      }
    }
    if (ctx !== undefined) {
      systemMessages.push(...buildDynamicInstructionMessages(ctx));
      const skillAnnouncement = ctx.get(PendingSkillAnnouncementKey);
      if (skillAnnouncement !== undefined && skillAnnouncement.length > 0) {
        systemMessages.push({ role: "system", content: skillAnnouncement });
      }
    }

    const modelMessages = nonSystemMessages;

    const prepareModelCallInput = (extraSystemNote?: string) => {
      const extraSystemEntry: SystemModelMessage[] = extraSystemNote
        ? [{ role: "system" as const, content: extraSystemNote }]
        : [];
      const baseSystemEntry: SystemModelMessage[] = session.agent.system
        ? [{ role: "system" as const, content: session.agent.system }]
        : [];
      const rawInstructions =
        systemMessages.length > 0 || extraSystemEntry.length > 0
          ? [...extraSystemEntry, ...baseSystemEntry, ...systemMessages]
          : undefined;
      const instructions =
        rawInstructions !== undefined && marker
          ? applySystemCacheBreakpoint(rawInstructions, marker)
          : (rawInstructions ?? session.agent.system ?? undefined);

      return {
        instructions,
        telemetryRuntimeContext: buildTelemetryRuntimeContext({
          eveVersion,
          authored: telemetryConfig,
          emissionState,
          environment,
          modelInput: {
            instructions,
            messages: modelMessages,
          },
          session,
        }),
      };
    };

    /**
     * Assembles the effective toolset and ToolLoopAgent for one attempt
     * of this step, then runs the model call.
     *
     * Re-invoked by both recovery stages. The unsupported-provider-tool
     * retry passes `disabledProviderTools` to drop the offending tool and
     * `extraSystemNote` to tell the model why a capability was removed.
     * The empty-response reissue passes `retryReason` to label the retried
     * call's telemetry.
     */
    const runOneModelCall = async (opts: {
      disabledProviderTools?: ReadonlySet<string>;
      extraSystemNote?: string;
      preparedInput?: ReturnType<typeof prepareModelCallInput>;
      retryReason?: "empty-response";
      suppressStepStartedEmission?: boolean;
      trailingUserNote?: string;
    }): Promise<HarnessStepResult> => {
      const { instructions, telemetryRuntimeContext = {} } =
        opts.preparedInput ?? prepareModelCallInput(opts.extraSystemNote);
      // Label the reissued call's telemetry; without this a retry is only
      // visible as a second LLM span under one step.
      if (opts.retryReason) {
        telemetryRuntimeContext["eve.retry.reason"] = opts.retryReason;
      }
      // Trailing rather than an extraSystemNote prepend: keeps the provider's
      // cached prompt prefix valid, and handleStepResult rebuilds history
      // from the step's prompt messages, so the note exists only on this
      // call's wire request.
      const callMessages = opts.trailingUserNote
        ? [...modelMessages, { role: "user" as const, content: opts.trailingUserNote }]
        : modelMessages;

      const sandboxSurfaces = selectSandboxSurfaces(config);
      const flatTools = await buildToolSetWithProviderTools({
        approvedTools,
        capabilities: config.capabilities,
        disabledProviderTools: opts.disabledProviderTools,
        modelReference: session.agent.modelReference,
        tools: config.tools,
      });

      if (ctx !== undefined) {
        const dynamicTools = buildDynamicTools(ctx);
        const dynamicToolSet = buildToolSetFromDefinitions({
          approvedTools,
          capabilities: config.capabilities,
          disabledProviderTools: opts.disabledProviderTools,
          tools: dynamicTools,
        });
        for (const [name, toolDefinition] of Object.entries(dynamicToolSet)) {
          flatTools[name] ??= toolDefinition;
        }
      }

      if (session.outputSchema !== undefined) {
        flatTools[FINAL_OUTPUT_TOOL_NAME] = buildFinalOutputTool(session.outputSchema);
      }

      const modelTools =
        sandboxSurfaces.length > 0
          ? (
              await applySandboxToolSet({
                harnessTools: config.tools,
                lifecycle:
                  emit !== undefined
                    ? createCodeModeLifecycle({
                        emit,
                        emissionState,
                        tools: config.tools,
                      })
                    : undefined,
                tools: flatTools,
                surfaces: sandboxSurfaces,
              })
            ).modelTools
          : flatTools;

      const effectiveTools = marker ? applyLastToolCacheBreakpoint(modelTools, marker) : modelTools;

      // Pin gateway routing to the provider that owns any
      // provider-specific tool in this step's toolset. Converts a
      // transient primary outage into a retryable 503 instead of
      // routing to an incompatible fallback provider. Skipped on the
      // recovery retry because the offending tool was dropped — any
      // provider can serve the request now.
      const gatewayPinProvider = resolveGatewayPinForStep({
        cachePath,
        modelReference: session.agent.modelReference,
        tools: effectiveTools,
      });

      const hooks = buildStepHooks({
        cachePath,
        emit,
        emissionState,
        emitStepStarted: opts.suppressStepStartedEmission !== true,
        gatewayPinProvider,
        marker,
        session,
      });

      const agentSettings = {
        headers: attributionHeaders,
        instructions,
        model,
        onToolExecutionEnd: logToolExecutionError,
        // Replaces the AI SDK's default `console.error`; the harness still
        // emits stream events, this just keeps the raw error from being silent.
        onError(event: { error: unknown }) {
          // Recognized configuration failures (gateway auth, missing API key)
          // skip the raw inspector dump — its stack points at the harness, not
          // the fix, and the terminal-failure path logs the one-line summary
          // and emits the structured step.failed. Unrecognized errors keep
          // the full dump so they stay loud.
          if (summarizeKnownModelCallConfigError(event.error) !== null) return;
          logError(log, "tool-loop stream error", event.error);
        },
        onStepFinish: hooks.onStepFinish,
        prepareStep: hooks.prepareStep,
        runtimeContext: telemetryRuntimeContext,
        stopWhen: isStepCount(1),
        telemetry: enrichTelemetry(telemetryConfig, agentName, telemetryRuntimeContext),
        tools: effectiveTools,
      };
      const agent = new ToolLoopAgent(agentSettings);

      const executeModelCall = async (): Promise<HarnessStepResult> => {
        if (emit) {
          const streamResult = await agent.stream({ messages: callMessages });
          const {
            handledInlineToolResultCallIds,
            inlineAuthorizationResults,
            inlineToolResultParts,
          } = await emitStreamContent(emit, emissionState, streamResult.fullStream);
          const stepResult = await hooks.stepResult;
          if (isEmptyModelResponse(stepResult)) {
            throw new EmptyModelResponseError();
          }
          await emitStepActions(emit, emissionState, stepResult, {
            excludedActionToolNames: new Set([
              ASK_QUESTION_TOOL_NAME,
              CODE_MODE_TOOL_NAME,
              FINAL_OUTPUT_TOOL_NAME,
            ]),
            handledInlineToolResultCallIds,
            tools: config.tools,
          });
          if (inlineToolResultParts.length > 0 || inlineAuthorizationResults.length > 0) {
            const existingToolResults = stepResult.toolResults as TypedToolResult<ToolSet>[];
            const toolResultsByCallId = new Map(
              existingToolResults.map((toolResult) => [toolResult.toolCallId, toolResult]),
            );
            for (const toolResult of inlineAuthorizationResults) {
              toolResultsByCallId.set(toolResult.toolCallId, toolResult);
            }
            /*
             * AI SDK `StepResult` is a class whose `content`,
             * `toolCalls`, `toolResults`, and `text` are prototype
             * getters. Each field is read explicitly here rather than via
             * spread so the returned plain object carries the values —
             * spread would copy only own enumerable properties and the
             * downstream `extractQuestionInputRequests` would crash on
             * `toolCalls === undefined`.
             */
            return {
              content: stepResult.content,
              finishReason: stepResult.finishReason,
              response: {
                ...stepResult.response,
                ...(inlineToolResultParts.length > 0
                  ? {
                      messages: [
                        { role: "tool" as const, content: [...inlineToolResultParts] },
                        ...stepResult.response.messages,
                      ],
                    }
                  : {}),
              },
              text: stepResult.text,
              toolCalls: stepResult.toolCalls,
              toolResults: [...toolResultsByCallId.values()],
              usage: stepResult.usage,
            };
          }
          return stepResult;
        }
        await agent.generate({ messages: callMessages });
