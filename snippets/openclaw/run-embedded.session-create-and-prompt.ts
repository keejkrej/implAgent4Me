// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/run/attempt.ts
// Lines: 2475-2532
// impl Agent: see AGENTS.md — pi session create + system prompt install

      const createdSession = await createEmbeddedAgentSessionWithResourceLoader<
        Awaited<ReturnType<typeof createAgentSession>>
      >({
        createAgentSession: async (options) =>
          await createAgentSession(options as unknown as Parameters<typeof createAgentSession>[0]),
        options: {
          cwd: effectiveCwd,
          agentDir,
          authStorage: params.authStorage,
          modelRegistry: params.modelRegistry,
          model: params.model,
          thinkingLevel: mapThinkingLevel(params.thinkLevel),
          tools: sessionToolAllowlist,
          customTools: allCustomTools,
          sessionManager,
          settingsManager,
          resourceLoader,
          // ... resolveDeferredTool, withSessionWriteLock ...
        },
      });
      session = createdSession.session;
      if (!session) {
        throw new Error("Embedded agent session missing");
      }
      session.setActiveToolsByName(sessionToolAllowlist);
      const activeSession = session;
      const setActiveSessionSystemPrompt = (nextSystemPrompt: string) => {
        systemPromptText = nextSystemPrompt;
        applySystemPromptToSession(activeSession, nextSystemPrompt);
      };
      setActiveSessionSystemPrompt(systemPromptText);
      // ... message tool terminal hook, raw model run reset ...
