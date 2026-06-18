// Copied excerpt from openclaw
// Source: openclaw/src/auto-reply/reply/memory-flush.ts
// Lines: 136-161
// impl Agent: see AGENTS.md — when to trigger memory flush compaction run

export function shouldRunMemoryFlush(params: {
  entry?: Pick<
    SessionEntry,
    "totalTokens" | "totalTokensFresh" | "compactionCount" | "memoryFlushCompactionCount"
  >;
  /**
   * Optional token count override for flush gating. When provided, this value is
   * treated as a fresh context snapshot and used instead of the cached
   * SessionEntry.totalTokens (which may be stale/unknown).
   */
  tokenCount?: number;
  contextWindowTokens: number;
  reserveTokensFloor: number;
  softThresholdTokens: number;
}): boolean {
  const state = resolveMemoryFlushGateState(params);
  if (!state || state.totalTokens < state.threshold) {
    return false;
  }

  if (hasAlreadyFlushedForCurrentCompaction(state.entry)) {
    return false;
  }

  return true;
}
