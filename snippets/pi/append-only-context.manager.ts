// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/agent/src/append-only-context.ts
// Lines: 1-16, 158-237
// impl Agent: see AGENTS.md

/**
 * Append-only context mode — stabilizes the byte prefix sent to the LLM
 * across turns so provider prefix caches (DeepSeek, Anthropic, etc.)
 * hit at the maximum possible rate.
 *
 * Two mechanisms:
 *
 * 1. **StablePrefix** — system prompt + tool specs are computed once
 *    and frozen. Subsequent turns reuse the exact same byte sequence
 *    unless `invalidate()` is called (e.g. after MCP reconnect).
 *
 * 2. **AppendOnlyLog** — messages only grow; prior turns are never
 *    re-serialized. Combined with a stable prefix, only the user's new
 *    message delta is a cache miss each turn.
 */


// ... (StablePrefix, AppendOnlyLog classes omitted) ...

export class AppendOnlyContextManager {
	readonly prefix = new StablePrefix();
	readonly log = new AppendOnlyLog();
	/** How many normalized messages were synced into the log as of the last sync. */
	#lastSyncCount = 0;
	/** Rolling digest of synced message content — detects in-place rewrites. */
	#syncedDigest = 0;

	build(context: AgentContext, options: BuildOptions): Context {
		this.prefix.build(context, options);
		const { systemPrompt, tools } = this.prefix.toContext();
		return { systemPrompt, messages: this.log.toMessages(), tools };
	}

	/**
	 * Sync normalized (provider-level) messages into the append-only log.
	 *
	 * Detects both compaction (shorter array) and in-place rewrites
	 * (same length, changed content via a rolling digest).
	 */
	syncMessages(normalizedMessages: any[]): void {
		// Detect in-place rewrites of already-synced messages.
		if (
			this.#lastSyncCount > 0 &&
			this.#lastSyncCount <= normalizedMessages.length &&
			this.#computeDigest(normalizedMessages.slice(0, this.#lastSyncCount)) !== this.#syncedDigest
		) {
			this.log.clear();
			this.#lastSyncCount = 0;
		}

		// Compaction — array shrunk.
		if (normalizedMessages.length < this.#lastSyncCount) {
			this.log.clear();
			this.#lastSyncCount = 0;
		}

		const newMsgs = normalizedMessages.slice(this.#lastSyncCount);
		for (const msg of newMsgs) {
			this.log.append(msg);
		}

		this.#lastSyncCount = normalizedMessages.length;
		this.#syncedDigest = this.#computeDigest(normalizedMessages);
	}

	/** Reset prefix + log for a model/provider switch while mode stays active. */
	invalidateForModelChange(): void {
		this.prefix.invalidate();
		this.log.clear();
		this.#lastSyncCount = 0;
		this.#syncedDigest = 0;
	}

	/** Reset the sync cursor AND clear the log. */
	resetSyncCursor(): void {
		this.log.clear();
		this.#lastSyncCount = 0;
		this.#syncedDigest = 0;
	}

	appendMessage(message: any): void {
		this.log.append(message);
	}

	replaceTailMessage(message: any): void {
		this.log.replaceTail(message);
	}

	invalidate(): void {
		this.prefix.invalidate();
	}

	reset(context: AgentContext, options: BuildOptions): void {
		this.prefix.invalidate();
		this.log.clear();
		this.#lastSyncCount = 0;
		this.#syncedDigest = 0;
		this.prefix.build(context, options);
	}
