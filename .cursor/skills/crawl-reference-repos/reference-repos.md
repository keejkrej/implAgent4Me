# Reference repo crawl map

**Repo list:** [repos.manifest.json](repos.manifest.json) — canonical registry (`clone_dir`, `url`, `snippet_dir`).

Sibling paths resolve as `../<clone_dir>/` from `implAgent4/`. The user clones manually before invoking the skill.

Use with ripgrep; line numbers drift — always verify with `rg -n` before writing headers.

---

## `../oh-my-pi`

| Layer | Start here | Search terms |
|-------|------------|--------------|
| Brain (pi core) | `packages/agent/src/agent-loop.ts` | `agentLoop`, `runLoop`, `executeToolCalls`, `convertToLlm` |
| Brain (stateful) | `packages/agent/src/agent.ts` | `prompt(`, `steer(`, `subscribe(` |
| Bone | `packages/agent/src/append-only-context.manager.ts` | `AppendOnlyContextManager` |
| Flesh (OMP) | `packages/coding-agent/src/session/agent-session.ts` | `AgentSession`, `prompt`, `compact` |
| Subagents | `packages/coding-agent/src/task/` | `TaskTool`, `runSubprocess`, `drive-session-to-yield` |
| Flesh | `packages/coding-agent/src/advisor/runtime.ts` | `AdvisorRuntime` |

**Already in catalog:** `snippets/pi/`, `snippets/oh-my-pi/`

**Worth next:** `agent-loop.ts` Harmony leak recovery, `AgentLifecycleManager`, IRC peer coordination, compaction in `@oh-my-pi/pi-agent-core/compaction`.

---

## `../hermes-agent`

| Layer | Start here | Search terms |
|-------|------------|--------------|
| Brain | `run_agent.py` → `AIAgent` | `run_conversation`, `chat(` |
| Brain loop | `agent/conversation_loop.py` | `while`, `interrupt`, `invoke_tool` |
| Bone (builtin memory) | `tools/memory_tool.py` | `MemoryStore`, `format_for_system_prompt`, `MEMORY.md` |
| Bone (providers) | `agent/memory_manager.py`, `agent/memory_provider.py` | `prefetch_all`, `sync_all`, `build_memory_context_block` |
| Flesh (prompt) | `agent/system_prompt.py`, `agent/prompt_builder.py` | `build_system_prompt_parts`, `build_skills_system_prompt`, `MEMORY_GUIDANCE` |
| Flesh (skills) | `agent/skill_commands.py`, `tools/skill_manager_tool.py` | `extract_user_instruction_from_skill_message`, `/skill` |
| Turn wiring | `agent/turn_context.py` | `ext_prefetch_cache`, `prefetch_all` |
| Inject site | `agent/conversation_loop.py` | `build_memory_context_block`, `current_turn_user_idx` |
| Tools | `agent/agent_runtime_helpers.py` | `invoke_tool` — agent-level tools before registry |
| Subagents | `run_agent.py` | `delegate_task`, `_dispatch_delegate_task` |
| Self-improvement | `agent/background_review.py` | `review_skills`, memory review fork |

**Already in catalog:** `snippets/hermes/` (brain + memory + skills)

**Worth next:** `background_review.py`, `tools/skill_manager_tool.py`, `plugins/memory/supermemory/`, `agent/tool_executor.py`, `agent/prompt_caching.py`.

---

## `../ai` (Vercel AI SDK)

| Layer | Start here | Search terms |
|-------|------------|--------------|
| Brain | `packages/ai/src/agent/tool-loop-agent.ts` | `ToolLoopAgent`, `generate(`, `stream(` |
| Brain (inner loop) | `packages/ai/src/generate-text/generate-text.ts` | `do {`, `stopWhen`, tool results |
| Budget | `packages/ai/src/generate-text/stop-condition.ts` | `isStepCount`, `StopCondition` |
| Streaming mirror | `packages/ai/src/generate-text/stream-text.ts` | same loop shape as generate |

**Already in catalog:** `snippets/ai/`

**Worth next:** `tool-approval` flow, `prepareStep` hook, `packages/workflow` `WorkflowAgent`.

---

## `../eve`

| Layer | Start here | Search terms |
|-------|------------|--------------|
| Brain (outer) | `packages/eve/src/harness/tool-loop.ts` | `createToolLoopHarness`, `runStep`, `handleStepResult` |
| Brain (inner) | same + `harness/types.ts` | `ToolLoopAgent`, `isStepCount(1)` |
| Session | `packages/eve/src/harness/types.ts` | `HarnessSession`, `StepFn`, `StepNext` |
| Tools | `packages/eve/src/harness/execute-tool.ts` | rehydrate execute fns at step time |

**Already in catalog:** `snippets/eve/`

**Worth next:** compaction hooks, code-mode interrupt parking, channel adapters, workflow integration.

---

## `../openclaw`

| Layer | Start here | Search terms |
|-------|------------|--------------|
| Brain | `src/agents/embedded-agent-runner/run/attempt.ts` | `runEmbeddedAttempt`, `promptActiveSession`, `activeSession.prompt` |
| Brain (subscribe) | `src/agents/embedded-agent-subscribe.ts` | `subscribeEmbeddedAgentSession` |
| Pi embed | `createAgentSession` in attempt.ts | session create, `setActiveToolsByName` |
| Flesh (prompt) | `src/agents/embedded-agent-runner/system-prompt.ts` | `buildEmbeddedSystemPrompt`, `applySystemPromptToSession` |
| Flesh (prompt) | `src/agents/embedded-agent-runner/run/attempt-system-prompt.ts` | `buildAttemptSystemPrompt` |
| Bone (memory) | `src/memory/root-memory-files.ts` | `MEMORY.md` |
| Bone (memory) | `src/plugins/memory-state.ts` | `buildMemoryPromptSection` |
| Bone (flush) | `src/auto-reply/reply/memory-flush.ts` | `shouldRunMemoryFlush` |
| Flesh (skills) | `src/skills/loading/skill-contract.ts` | `formatSkillsForPrompt` |
| Flesh (skills) | `src/skills/loading/workspace.ts` | `resolveSkillsPromptForRun`, `formatSkillsCompact` |
| Flesh (tools) | `src/agents/agent-tools.ts` | `createOpenClawCodingTools`, `MEMORY_FLUSH_ALLOWED` |
| Flesh (tools) | `src/agents/tools/common.ts`, `message-tool.ts` | `AnyAgentTool`, `createMessageTool` |
| Bootstrap | `src/agents/embedded-agent-runner/run/attempt.bootstrap-context.ts` | context file injection |

**Already in catalog:** `snippets/openclaw/`

**Worth next:** `attempt.prompt-helpers.ts` (plugin next-turn injection), `compaction-runtime-context.ts`, tool-search catalog mode, `context-engine/` plugin host.

---

## Cross-repo contrast shortcuts

When deciding whether a pattern is worth copying, check if it fills a gap in `AGENTS.md` **Design contrasts** table:

| Concern | Question to ask upstream |
|---------|--------------------------|
| Loop owner | What function owns the repeat-until-done? |
| Memory | File snapshot vs prefetch fence vs plugin block? |
| Skills | XML catalog in system prompt vs tool-loaded vs workflow rehydrate? |
| Tool surface | Single registry vs policy pipeline vs agent-level tools first? |
| Mid-run input | Queue, interrupt, abortSignal, or park/resume? |
| Step budget | Iteration count, deadline, context window, or workflow step? |

Copy the upstream code that **implements** the answer, not the docs that describe it.

---

## Grep one-liners (run from `implAgent4/`)

```bash
# Loop owners across all refs
rg -n "export (async )?function (agentLoop|run_conversation|runEmbeddedAttempt|createToolLoopHarness)" ../oh-my-pi ../hermes-agent ../openclaw ../eve 2>/dev/null
rg -n "class ToolLoopAgent" ../ai

# Memory injection
rg -n "prefetch|build_memory_context|format_for_system_prompt|buildMemoryPromptSection|MEMORY\.md" \
  ../hermes-agent/agent ../hermes-agent/tools ../openclaw/src

# Skills injection
rg -n "formatSkillsForPrompt|build_skills_system_prompt|resolveSkillsPromptForRun|available_skills" \
  ../hermes-agent/agent ../openclaw/src/skills

# Tool factories
rg -n "createOpenClawCodingTools|createMessageTool|AnyAgentTool|invoke_tool" \
  ../openclaw/src/agents ../hermes-agent/agent
```
