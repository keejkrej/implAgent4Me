// Copied excerpt from oh-my-pi
// Source: oh-my-pi/packages/coding-agent/src/session/agent-session.ts
// Lines: 7349-7412
// impl Agent: see AGENTS.md

	async compact(customInstructions?: string, options?: CompactOptions): Promise<CompactionResult> {
		if (this.#compactionAbortController) {
			throw new Error("Compaction already in progress");
		}
		this.#disconnectFromAgent();
		await this.abort();
		const compactionAbortController = new AbortController();
		this.#compactionAbortController = compactionAbortController;

		try {
			if (!this.model) {
				throw new Error("No model selected");
			}

			const compactionSettings = this.settings.getGroup("compaction");
			const pathEntries = this.sessionManager.getBranch();
			const preparation = prepareCompaction(pathEntries, compactionSettings);
			if (!preparation) {
				// Check why we can't compact
				const lastEntry = pathEntries[pathEntries.length - 1];
				if (lastEntry?.type === "compaction") {
					throw new Error("Already compacted");
				}
				throw new Error("Nothing to compact (session too small)");
			}

			let hookCompaction: CompactionResult | undefined;
			let fromExtension = false;
			let preserveData: Record<string, unknown> | undefined;

			if (this.#extensionRunner?.hasHandlers("session_before_compact")) {
				const result = (await this.#extensionRunner.emit({
					type: "session_before_compact",
					preparation,
					branchEntries: pathEntries,
					customInstructions,
					signal: compactionAbortController.signal,
				})) as SessionBeforeCompactResult | undefined;

				if (result?.cancel) {
					throw new CompactionCancelledError();
				}

				if (result?.compaction) {
					hookCompaction = result.compaction;
					fromExtension = true;
				}
			}

			const compactionPrep = await this.#prepareCompactionFromHooks(preparation, hookCompaction);

			// Strategy honored on manual /compact too. Custom instructions imply a
			// directed LLM summary; a text-only model cannot read the frames back —
			// both take the summarizer path (the latter loudly).
			const wantsSnapcompact =
				compactionPrep.kind !== "fromHook" && compactionSettings.strategy === "snapcompact" && !customInstructions;
			const snapcompactReady = wantsSnapcompact && this.model.input.includes("image");
			if (wantsSnapcompact && !snapcompactReady) {
				this.emitNotice(
					"warning",
					`snapcompact needs a vision-capable model (${this.model.id} is text-only) — using an LLM summary instead`,
					"compaction",
				);
			}
