// Copied excerpt from eve
// Source: eve/packages/eve/src/harness/tool-loop.ts
// Lines: 376-420
// impl Agent: see AGENTS.md

export function createToolLoopHarness(config: ToolLoopHarnessConfig): StepFn {
  const emit = config.handleEvent;
  const telemetryConfig = getInstrumentationConfig();
  if (telemetryConfig !== undefined) {
    ensureOtelIntegration();
  }
  const tracer = telemetryConfig !== undefined ? trace.getTracer("eve") : undefined;
  const agentName = config.runtimeIdentity?.agentName;

  async function runStep(
    initialSession: Readonly<Parameters<StepFn>[0]>,
    input?: StepInput,
  ): Promise<StepResult> {
    // --- Turn span lifecycle ------------------------------------------------

    // First step of a turn: open a new parent span. Continuation steps
    // restore the parent from session state via resolveStepOtelContext.
    let turnSpan: Span | undefined;
    if (tracer && hasStepInput(input)) {
      const functionId = telemetryConfig?.functionId ?? agentName;
      const attributes: Record<string, string> = {
        "eve.version": eveVersion,
        "eve.environment": environment,
        "eve.session.id": initialSession.sessionId,
      };
      if (functionId) {
        attributes["ai.telemetry.functionId"] = functionId;
      }
      turnSpan = tracer.startSpan("ai.eve.turn", { attributes });
    }

    // Run the step body inside the turn span's (or restored parent's)
    // OTel context so AI SDK spans nest as children.
    const parentContext = resolveStepOtelContext(tracer, turnSpan, initialSession);
    const executeStep = () => executeStepBody(initialSession, input, turnSpan);

    try {
      if (parentContext) {
        return await otelContext.with(parentContext, executeStep);
      }
      return await executeStep();
    } finally {
      turnSpan?.end();
    }
  }
