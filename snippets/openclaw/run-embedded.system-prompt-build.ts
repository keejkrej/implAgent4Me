// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/run/attempt.ts
// Lines: 1998-2045
// impl Agent: see AGENTS.md — system prompt assembly (skills + memory + bootstrap context)

    const attemptSystemPrompt = buildAttemptSystemPrompt({
      isRawModelRun,
      transformProviderSystemPrompt: (transformParams) =>
        transformProviderSystemPrompt({
          ...transformParams,
          runtimeHandle: getProviderRuntimeHandle(),
        }),
      embeddedSystemPrompt: {
        config: params.config,
        agentId: sessionAgentId,
        workspaceDir: effectiveWorkspace,
        defaultThinkLevel: params.thinkLevel,
        reasoningLevel: params.reasoningLevel ?? "off",
        extraSystemPrompt: params.extraSystemPrompt,
        ownerNumbers: params.ownerNumbers,
        reasoningTagHint,
        heartbeatPrompt,
        skillsPrompt: effectiveSkillsPrompt,
        docsPath: openClawReferences.docsPath ?? undefined,
        sourcePath: openClawReferences.sourcePath ?? undefined,
        workspaceNotes: workspaceNotes?.length ? workspaceNotes : undefined,
        reactionGuidance,
        promptMode: effectivePromptMode,
        sourceReplyDeliveryMode: params.sourceReplyDeliveryMode,
        silentReplyPromptMode: params.silentReplyPromptMode,
        acpEnabled: isAcpRuntimeSpawnAvailable({
          config: params.config,
          sandboxed: sandboxInfo?.enabled === true,
        }),
        promptSurface,
        nativeCommandGuidanceLines: listRegisteredPluginAgentPromptGuidance({
          surface: promptSurface,
        }),
        runtimeInfo,
        messageToolHints,
        toolSchemaDirectoryPrompt,
        sandboxInfo,
        capabilityToolNames: [...capabilityToolNames].toSorted(),
        tools: effectiveTools,
        userTimezone,
        userTime,
        userTimeFormat,
        contextFiles,
        bootstrapMode,
        bootstrapTruncationNotice,
        includeMemorySection: !activeContextEngine || activeContextEngine.info.id === "legacy",
        promptContribution,
      },
      // ... providerTransform ...
    });
