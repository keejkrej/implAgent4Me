// Copied excerpt from Vercel AI SDK (ai)
// Source: packages/ai/src/generate-text/generate-text.ts
// Lines: 785-820, 1340-1350
// impl Agent: see AGENTS.md

      do {
        // Set up step timeout if configured
        const stepTimeoutId = setAbortTimeout({
          abortController: stepAbortController,
          label: 'Step',
          timeoutMs: stepTimeoutMs,
        });
        const stepNumber = steps.length;

        try {
          await runInTracingChannelSpan({
            type: 'step',
            event: { callId, stepNumber },
            execute: async () => {
              const accumulatedResponseMessages = [
                ...initialResponseMessages,
                ...steps.flatMap(step => step.response.messages),
              ];
              const stepInputMessages = messagesForNextStep;

              const prepareStepResult = await prepareStep?.({
                model,
                steps,
                stepNumber: steps.length,
                instructions: instructionsForNextStep,
                initialInstructions: initialPrompt.instructions,
                messages: stepInputMessages,
                initialMessages,
                responseMessages: accumulatedResponseMessages,
                runtimeContext,
                toolsContext,
                experimental_sandbox: sandbox,
              });

              const stepSandbox =
                prepareStepResult?.experimental_sandbox ?? sandbox;

// ... (per-step model call, tool execution, step result assembly) ...

      } while (
        // Continue if:
        // 1. There are client tool calls that have all been executed or denied, OR
        // 2. There are pending deferred results from provider-executed tools
        ((clientToolCalls.length > 0 &&
          clientToolOutputs.length + deniedToolApprovalResponses.length ===
            clientToolCalls.length) ||
          pendingDeferredToolCalls.size > 0) &&
        // continue until a stop condition is met:
        !(await isStopConditionMet({ stopConditions, steps }))
      );
