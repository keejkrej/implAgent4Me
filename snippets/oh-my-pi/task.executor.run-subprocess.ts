// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/task/executor.ts
// Lines: 1684-1784
// impl Agent: see AGENTS.md

export async function runSubprocess(options: ExecutorOptions): Promise<SingleResult> {
	const {
		cwd,
		agent,
		task,
		assignment,
		index,
		id,
		worktree,
		modelOverride,
		thinkingLevel,
		outputSchema,
		enableLsp,
		signal,
		onProgress,
	} = options;
	const startTime = Date.now();

	// Check if already aborted
	if (signal?.aborted) {
		return {
			index,
			id,
			agent: agent.name,
			agentSource: agent.source,
			task,
			assignment,
			description: options.description,
			exitCode: 1,
			output: "",
			stderr: "Cancelled before start",
			truncated: false,
			durationMs: 0,
			tokens: 0,
			requests: 0,
			modelOverride,
			error: "Cancelled before start",
			aborted: true,
			abortReason: "Cancelled before start",
		};
	}

	// Set up artifact paths and write input file upfront if artifacts dir provided
	let subtaskSessionFile: string | undefined;
	if (options.artifactsDir) {
		subtaskSessionFile = path.join(options.artifactsDir, `${id}.jsonl`);
	}

	const settings = options.settings ?? Settings.isolated();
	const subagentSettings = createSubagentSettings(
		settings,
		agent.readSummarize === false ? { "read.summarize.enabled": false } : undefined,
	);
	const maxRecursionDepth = settings.get("task.maxRecursionDepth") ?? 2;
	// Tailored specialist identity for this spawn. `subagentRole` is the full
	// (trimmed) role text fed to the system-prompt preamble; `subagentDisplayName`
	// is the label-normalized form the registry/roster show, falling back to the
	// agent type name when no role was given.
	const subagentRole = options.role?.trim() || undefined;
	const subagentDisplayName = resolveSubagentDisplayName(options.role, agent.name);
	const maxRuntimeMs = Math.max(
		0,
		Math.trunc(Number(options.maxRuntimeMs ?? settings.get("task.maxRuntimeMs") ?? 0) || 0),
	);
	// TTL before an adopted idle subagent is parked by the lifecycle manager.
	// <= 0 disables parking (the session stays live until process teardown).
	const agentIdleTtlMs = Math.trunc(Number(settings.get("task.agentIdleTtlMs") ?? 420_000) || 0);
	const configuredDefaultBudget = Math.max(
		0,
		Math.trunc(Number(settings.get("task.softRequestBudget") ?? SOFT_REQUEST_BUDGET.default) || 0),
	);
	const softRequestBudget =
		configuredDefaultBudget === 0 ? 0 : (SOFT_REQUEST_BUDGET[agent.name] ?? configuredDefaultBudget);
	const parentDepth = options.taskDepth ?? 0;
	const childDepth = parentDepth + 1;
	const atMaxDepth = maxRecursionDepth >= 0 && childDepth >= maxRecursionDepth;

	// Add tools if specified
	let toolNames: string[] | undefined;
	if (agent.tools && agent.tools.length > 0) {
		toolNames = agent.tools;
		// Auto-include task tool if spawns defined but task not in tools
		if (agent.spawns !== undefined && !toolNames.includes("task") && !atMaxDepth) {
			toolNames = [...toolNames, "task"];
		}
	}

	if (atMaxDepth && toolNames?.includes("task")) {
		toolNames = toolNames.filter(name => name !== "task");
	}
	// IRC is always available; the COOP prompt section advertises it, so a restricted
	// whitelist must still carry `irc` for the subagent to actually use it.
	if (toolNames && !toolNames.includes("irc")) {
		toolNames = [...toolNames, "irc"];
	}
	if (toolNames?.includes("exec")) {
		const allowEvalPy = settings.get("eval.py") ?? true;
		const allowEvalJs = settings.get("eval.js") ?? true;
		const expanded = toolNames.filter(name => name !== "exec");
		if (allowEvalPy || allowEvalJs) expanded.push("eval");
		expanded.push("bash");
