// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/advisor/runtime.ts
// Lines: 1-74
// impl Agent: see AGENTS.md

import type { AgentMessage } from "@oh-my-pi/pi-agent-core";
import { estimateTokens } from "@oh-my-pi/pi-agent-core/compaction";
import { logger } from "@oh-my-pi/pi-utils";
import { formatSessionHistoryMarkdown } from "../session/session-history-format";

/** Minimal slice of `Agent` the runtime drives — satisfied by pi-agent-core `Agent`. */
export interface AdvisorAgent {
	prompt(input: string): Promise<void>;
	abort(reason?: unknown): void;
	reset(): void;
	readonly state: { messages: AgentMessage[] };
}

export interface AdvisorRuntimeHost {
	/** Live primary transcript (use `agent.state.messages`). */
	snapshotMessages(): AgentMessage[];
	/** Surface one advice note to the primary (enqueues into the session YieldQueue). */
	enqueueAdvice(note: string, severity?: "nit" | "concern" | "blocker"): void;
	/**
	 * Pre-prompt context maintenance for the advisor's own append-only context.
	 * Promotes the advisor model to a larger sibling when its context nears the
	 * window (mirroring the primary's promote-first policy) and resolves `true`
	 * when the advisor should re-prime — reset and replay the current
	 * primary-bounded transcript — because promotion did not free enough room.
	 * Optional: hosts that omit it get no maintenance (context only shrinks when
	 * the primary's next compaction triggers {@link AdvisorRuntime.reset}).
	 */
	maintainContext?(incomingTokens: number): Promise<boolean>;
}

interface PendingDelta {
	text: string;
	turns: number;
}

interface CatchupWaiter {
	threshold: number;
	resolve: () => void;
	finish: () => void;
	timer?: NodeJS.Timeout;
}

export class AdvisorRuntime {
	#lastCount = 0;
	#pending: PendingDelta[] = [];
	#busy = false;
	#backlog = 0;
	#consecutiveFailures = 0;
	#latestMessages?: AgentMessage[];
	#waiters: CatchupWaiter[] = [];
	disposed = false;

	constructor(
		private readonly agent: AdvisorAgent,
		private readonly host: AdvisorRuntimeHost,
		private readonly retryDelayMs = 1000,
	) {}

	get backlog(): number {
		return this.#backlog;
	}

	onTurnEnd(messages?: AgentMessage[]): void {
		if (this.disposed) return;
		const all = messages ?? this.host.snapshotMessages();
		this.#latestMessages = all;
		const render = this.#renderDelta(all);
		if (render) {
			this.#pending.push({ text: render, turns: 1 });
			this.#backlog++;
			this.#notifyWaiters();
			void this.#drain();
		}
	}
