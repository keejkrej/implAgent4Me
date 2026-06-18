// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/task/index.ts
// Lines: 456-662
// impl Agent: see AGENTS.md

export class TaskTool implements AgentTool<TaskToolSchemaInstance, TaskToolDetails, Theme> {
	readonly name = "task";
	readonly approval = "exec" as const;
	readonly formatApprovalDetails = (args: unknown): string[] => {
		const params = args as Partial<TaskParams>;
		const lines: string[] = [];
		if (typeof params.agent === "string") {
			lines.push(`Agent: ${truncateForPrompt(params.agent)}`);
		}
		if (typeof params.role === "string" && params.role.trim()) {
			lines.push(`Role: ${truncateForPrompt(params.role)}`);
		}
		if (typeof params.id === "string" && params.id.trim()) {
			lines.push(`Task: ${truncateForPrompt(params.id)}`);
		}
		if (typeof params.assignment === "string") {
			lines.push(`Assignment:\n${truncateForPrompt(params.assignment)}`);
		}
		if (typeof params.context === "string" && params.context.trim()) {
			lines.push(`Context:\n${truncateForPrompt(params.context)}`);
		}
		const tasks = Array.isArray(params.tasks) ? params.tasks : [];
		const firstTask = tasks[0];
		if (firstTask) {
			if (typeof firstTask.id === "string" && firstTask.id.trim()) {
				lines.push(`Task: ${truncateForPrompt(firstTask.id)}`);
			}
			if (typeof firstTask.role === "string" && firstTask.role.trim()) {
				lines.push(`Role: ${truncateForPrompt(firstTask.role)}`);
			}
			if (typeof firstTask.assignment === "string") {
				lines.push(`Assignment:\n${truncateForPrompt(firstTask.assignment)}`);
			}
			if (tasks.length > 1) {
				lines.push(`+${tasks.length - 1} more task${tasks.length === 2 ? "" : "s"}`);
			}
		}
		return lines;
	};
	readonly label = "Task";
	readonly summary = "Spawn subagents to complete delegated tasks";
	readonly strict = true;
	readonly loadMode = "discoverable";
	readonly renderResult = renderResult;
	// Suppress the streaming call preview once a (partial or final) result exists
	// so the task renders as ONE block that transitions in place — not a pending
	// call frame stacked above the result frame. Mirrors `taskToolRenderer`.
	readonly mergeCallAndResult = true;
	readonly #discoveredAgents: AgentDefinition[];
	readonly #blockedAgent: string | undefined;
	/**
	 * One semaphore per TaskTool instance (i.e. per session): bounds concurrent
	 * subagents across parallel `task` calls within the session. Sized from
	 * `task.maxConcurrency` at first use; later setting changes do not resize it.
	 */
	#spawnSemaphore: Semaphore | undefined;

	get parameters(): TaskToolSchemaInstance {
		const isolationEnabled = this.session.settings.get("task.isolation.mode") !== "none";
		return getTaskSchema({ isolationEnabled, batchEnabled: this.#isBatchEnabled() });
	}

	renderCall(args: unknown, options: Parameters<typeof renderTaskCall>[1], theme: Theme) {
		return renderTaskCall(repairTaskParams(args as TaskParams), options, theme);
	}

	/** Dynamic description that reflects current disabled-agent settings */
	get description(): string {
		const disabledAgents = this.session.settings.get("task.disabledAgents") as string[];
		const maxConcurrency = this.session.settings.get("task.maxConcurrency");
		const isolationMode = this.session.settings.get("task.isolation.mode");
		return renderDescription(
			this.#discoveredAgents,
			maxConcurrency,
			isolationMode !== "none",
			disabledAgents,
			this.#isBatchEnabled(),
			this.session.settings.get("async.enabled"),
			isIrcEnabled(this.session.settings, this.session.taskDepth ?? 0),
			this.session.getSessionSpawns() ?? "*",
		);
	}
	private constructor(
		private readonly session: ToolSession,
		discoveredAgents: AgentDefinition[],
	) {
		this.#blockedAgent = $env.PI_BLOCKED_AGENT;
		this.#discoveredAgents = discoveredAgents;
	}

	#isBatchEnabled(): boolean {
		return this.session.settings.get("task.batch");
	}

	#getSpawnSemaphore(): Semaphore {
		this.#spawnSemaphore ??= new Semaphore(this.session.settings.get("task.maxConcurrency"));
		return this.#spawnSemaphore;
	}

	/**
	 * Create a TaskTool instance with async agent discovery.
	 */
	static async create(session: ToolSession): Promise<TaskTool> {
		const { agents } = await discoverAgentsForCreate(session.cwd);
		return new TaskTool(session, agents);
	}

	async execute(
		toolCallId: string,
		rawParams: unknown,
		signal?: AbortSignal,
		onUpdate?: AgentToolUpdateCallback<TaskToolDetails>,
	): Promise<AgentToolResult<TaskToolDetails>> {
		const params = repairTaskParams(rawParams as TaskParams);
		const batchEnabled = this.#isBatchEnabled();
		const validationError = validateShapeParams(batchEnabled, params) ?? validateSpawnParams(params, batchEnabled);
		if (validationError) {
			return createTaskModeError(validationError);
		}

		const spawnItems = resolveSpawnItems(params);
		const selectedAgent = this.#discoveredAgents.find(agent => agent.name === params.agent);
		const asyncEnabled = this.session.settings.get("async.enabled");
		const manager = asyncEnabled ? this.session.asyncJobManager : undefined;
		const depthCapacity = canSpawnAtDepth(
			this.session.settings.get("task.maxRecursionDepth") ?? 2,
			this.session.taskDepth ?? 0,
		);
		const ircEnabled = isIrcEnabled(this.session.settings, this.session.taskDepth ?? 0);
		// Coordination only makes sense when the siblings keep running after this
		// call returns (async). In the sync fallback they have already completed,
		// so a "coordinate while they run" hint would misfire.
		const willRunAsync = !!manager && selectedAgent?.blocking !== true;
		const advisory = this.session.suppressSpawnAdvisory
			? undefined
			: composeSpawnAdvisory({
					agentName: params.agent,
					items: spawnItems,
					depthCapacity,
					ircEnabled,
					willRunAsync,
				});
		// Returns a fresh result (copied content array, copied text part) rather
		// than mutating the caller's — task results are short-lived here, but an
		// in-place edit on a shared/cached AgentToolResult would be a hidden trap.
		const withAdvisory = (result: AgentToolResult<TaskToolDetails>): AgentToolResult<TaskToolDetails> => {
			if (!advisory) return result;
			let appended = false;
			const content = result.content.map(part => {
				if (!appended && part.type === "text" && typeof part.text === "string") {
					appended = true;
					return { ...part, text: `${part.text}\n\n${advisory}` };
				}
				return part;
			});
			if (!appended) content.push({ type: "text", text: advisory });
			return { ...result, content };
		};
		if (!asyncEnabled || !manager || selectedAgent?.blocking === true) {
			// Sync fallback: async execution disabled, orphaned host that never
			// wired a job manager, or an agent definition that declares
			// `blocking: true`. The session-scoped semaphore still bounds fan-out
			// across parallel task calls.
			if (asyncEnabled && !manager) {
				logger.warn("task: no AsyncJobManager registered; falling back to sync execution");
			}
			return withAdvisory(await this.#executeSyncFanout(toolCallId, params, spawnItems, signal, onUpdate));
		}

		// Resolve agent ids up front so the immediate result can name them.
		const outputManager =
			this.session.agentOutputManager ?? new AgentOutputManager(this.session.getArtifactsDir ?? (() => null));
		const agentLabel = params.agent ?? "task";
		const agentSource = selectedAgent?.source ?? "bundled";
		const spawns: Array<{ agentId: string; item: TaskItem; progress: AgentProgress }> = [];
		for (let index = 0; index < spawnItems.length; index++) {
			const item = spawnItems[index];
			const agentId = await outputManager.allocate(item.id?.trim() || generateTaskName());
			const assignment = (item.assignment ?? "").trim();
			spawns.push({
				agentId,
				item,
				progress: {
					index,
					id: agentId,
					agent: agentLabel,
					agentSource,
					status: "pending",
					task: renderSubagentUserPrompt(assignment),
					assignment,
					description: item.description,
					recentTools: [],
					recentOutput: [],
					toolCount: 0,
					requests: 0,
					tokens: 0,
					cost: 0,
					durationMs: 0,
				},
			});
		}

		// Aggregate async state for the one tool call: every spawn's job reports
		// into the shared progress snapshot; the call stays "running" until all
		// jobs settle, then turns "failed" if any spawn failed. The single-spawn
		// case passes the job's own suggestion through (pre-batch behavior).
		const single = spawns.length === 1;
