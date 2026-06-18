// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/task/executor.ts
// Lines: 76-92, 1391-1477
// impl Agent: see AGENTS.md

/**
 * Soft per-agent request budgets (assistant requests per run). When a subagent
 * crosses its budget it receives ONE steering notice asking it to wrap up; at
 * 1.5x the budget the run is aborted gracefully so partial output is salvaged.
 * The `default` key applies to agents without an explicit entry and can be
 * overridden via the `task.softRequestBudget` setting (0 disables the guard).
 */
export const SOFT_REQUEST_BUDGET: Record<string, number> = {
	explore: 40,
	quick_task: 40,
	default: 90,
};

/** Steering notice injected once when a subagent crosses its soft request budget. */
export function buildBudgetNotice(requests: number): string {
	return `[budget notice] You have used ${requests} requests in this run. Wrap up now: finish the current step and yield your final report.`;
}

/**
 * Drive one assignment through a live session: send the prompt, wait for idle,
 * remind the agent to `yield` (up to {@link MAX_YIELD_RETRIES} times), then
 * classify the terminal assistant state.
 */
async function driveSessionToYield(
	session: AgentSession,
	monitor: SubagentRunMonitor,
	task: string,
): Promise<DriveOutcome> {
	const abortSignal = monitor.abortSignal;
	let exitCode = 0;
	let error: string | undefined;
	let aborted = false;
	let abortReasonText: string | undefined;
	const checkAbort = () => {
		if (abortSignal.aborted) {
			aborted = monitor.isAbortedRun();
			if (aborted) {
				abortReasonText ??= monitor.resolveAbortReasonText();
			}
			exitCode = 1;
			throw new ToolAbortError();
		}
	};
	const awaitAbortable = async <T>(promise: Promise<T>): Promise<T> => {
		checkAbort();
		const { promise: abortPromise, reject } = Promise.withResolvers<never>();
		const onAbort = () => {
			try {
				checkAbort();
			} catch (err) {
				reject(err);
			}
		};
		abortSignal.addEventListener("abort", onAbort, { once: true });
		try {
			return await Promise.race([promise, abortPromise]);
		} finally {
			abortSignal.removeEventListener("abort", onAbort);
		}
	};

	try {
		await awaitAbortable(session.prompt(task, { attribution: "agent" }));
		await awaitAbortable(session.waitForIdle());

		const reminderToolChoice = buildNamedToolChoice("yield", session.model);

		let retryCount = 0;
		while (!monitor.yieldCalled() && retryCount < MAX_YIELD_RETRIES && !abortSignal.aborted) {
			// Skip reminders when the model returned a terminal error (e.g.
			// rate-limit cap hit, auth failure). Re-prompting would just
			// hit the same wall, multiplying the failure noise without
			// any chance of producing a yield.
			const lastBeforeReminder = session.getLastAssistantMessage();
			if (lastBeforeReminder?.stopReason === "error") break;
			try {
				retryCount++;
				const reminder = prompt.render(submitReminderTemplate, {
					retryCount,
					maxRetries: MAX_YIELD_RETRIES,
				});

				const isFinalRetry = retryCount >= MAX_YIELD_RETRIES;
				await awaitAbortable(
					session.prompt(reminder, {
						attribution: "agent",
						synthetic: true,
						...(isFinalRetry && reminderToolChoice ? { toolChoice: reminderToolChoice } : {}),
					}),
				);
				await awaitAbortable(session.waitForIdle());
			} catch (err) {
				if (abortSignal.aborted || err instanceof ToolAbortError) {
					// Benign control-flow exit — user cancel (^C) or compaction aborting
					// pending operations both surface here as ToolAbortError. The outer
					// catch and finally already mark the run aborted; logging at ERROR
					// would spam operator dashboards with non-failures.
					logger.debug("Subagent prompt aborted");
				} else {
					logger.error("Subagent prompt failed", {
						error: err instanceof Error ? err.message : String(err),
					});
				}
			}
		}
