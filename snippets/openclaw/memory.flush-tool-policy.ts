// Copied excerpt from openclaw
// Source: openclaw/src/agents/agent-tools.ts
// Lines: 575-580, 1104-1135
// impl Agent: see AGENTS.md — memory-flush runs restrict tool surface

  const isMemoryFlushRun = options?.trigger === "memory";
  if (isMemoryFlushRun && !options?.memoryFlushWritePath) {
    throw new Error("memoryFlushWritePath required for memory-triggered tool runs");
  }
  const memoryFlushWritePath = isMemoryFlushRun ? options.memoryFlushWritePath : undefined;

  // ... tool assembly ...

  options?.recordToolPrepStage?.("openclaw-tools");
  const toolsForMemoryFlush: AnyAgentTool[] = isMemoryFlushRun && memoryFlushWritePath ? [] : tools;
  if (isMemoryFlushRun && memoryFlushWritePath) {
    for (const tool of tools) {
      if (!MEMORY_FLUSH_ALLOWED_TOOL_NAMES.has(tool.name)) {
        continue;
      }
      if (tool.name === "write") {
        toolsForMemoryFlush.push(
          wrapToolMemoryFlushAppendOnlyWrite(tool, {
            root: memoryFlushWriteRoot,
            relativePath: memoryFlushWritePath,
            containerWorkdir: sandbox?.containerWorkdir,
            sandbox:
              sandboxRoot && sandboxFsBridge
                ? { root: sandboxRoot, bridge: sandboxFsBridge }
                : undefined,
          }),
        );
        continue;
      }
      toolsForMemoryFlush.push(tool);
    }
  }
  const unavailableCoreToolReason =
    isMemoryFlushRun && memoryFlushWritePath
      ? "memory-triggered compaction runs expose only read and append-only write"
      : undefined;
  const toolsForMessageProvider = filterToolsByMessageProvider(
    toolsForMemoryFlush,
    options?.toolPolicyMessageProvider ?? options?.messageProvider,
  );
