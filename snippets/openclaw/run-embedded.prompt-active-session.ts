// Copied excerpt from openclaw
// Source: openclaw/src/agents/embedded-agent-runner/run/attempt.ts
// Lines: 3420-3426
// impl Agent: see AGENTS.md — run_turn delegates to session.prompt()

      const promptActiveSession = (
        prompt: string,
        options?: Parameters<typeof activeSession.prompt>[1],
      ): Promise<void> =>
        withOwnedSessionTranscriptWrites(ownedTranscriptWriteContext, async () =>
          abortable(trackPromptSettlePromise(activeSession.prompt(prompt, options))),
        );
