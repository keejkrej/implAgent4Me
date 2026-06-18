---
name: crawl-reference-repos
description: >-
  After the user has cloned reference agent repos as siblings of implAgent4,
  crawl them and copy verbatim brain/bone/flesh snippets into snippets/.
  Use when the user invokes this skill, says "crawl reference repos", wants to
  refresh or extend the snippet catalog, or add a new impl from upstream.
---

# Crawl reference repos → copy core snippets

## Prerequisites (user does this — not the agent)

The user clones upstream repos **manually** as siblings of `implAgent4`. This skill does **not** clone, fetch, or install anything.

Expected layout:

```text
parent/
├── implAgent4/          ← you are here
├── oh-my-pi/
├── hermes-agent/
├── ai/
├── eve/
├── openclaw/
├── crush/
└── claude-code/
```

**On invoke:** read [repos.manifest.json](repos.manifest.json) for the repo list. Verify each `../<clone_dir>/` exists (or run `scripts/status-refs.sh`). If any are missing, list them with their `url` from the manifest and **stop** — ask the user to clone manually. Do not substitute paths or clone repos yourself.

## Registry — where things live

| File | Role | Edit when… |
|------|------|------------|
| **`repos.manifest.json`** | Canonical list of reference repos (`id`, `clone_dir`, `url`, `snippet_dir`) | Adding/removing an upstream repo |
| **`reference-repos.md`** | Per-repo crawl map (entry files, grep terms, worth-next) | Adding crawl hints for a new repo |
| **`AGENTS.md`** | Human catalog of copied snippets (tables, trait map, contrasts) | After snippets are written (agent updates this) |
| **`src/agent.rs`** | Marker `impl Agent for Foo` pointers | New impl or new marker type |

**To add a new reference repo later:**

1. Add an entry to `repos.manifest.json` (`id`, `clone_dir`, `url`, `snippet_dir`).
2. Add a section to `reference-repos.md` (brain/bone/flesh entry points + search terms).
3. Clone it manually to `../<clone_dir>/`.
4. Invoke this skill — it will crawl the new repo and extend `AGENTS.md` + `agent.rs`.

Do not duplicate the repo list in `SKILL.md` — always read the manifest.

---

implAgent4 is a **snippet catalog**, not a runnable framework. Each folder under `snippets/<name>/` is one upstream `impl Agent for Foo`. Your job is to **find, excerpt, and catalog** — not translate, wire, or refactor.

Read `AGENTS.md` first for what is already copied and the design-contrast table.

## Default pass when invoked with no extra instructions

1. Read `repos.manifest.json` and verify every `clone_dir` exists under `../` (or run `scripts/status-refs.sh`).
2. For each repo in the manifest, read **Already in catalog** vs **Worth next** in [reference-repos.md](reference-repos.md) (add a section first if the repo is new).
3. Copy **Worth next** items (and any obvious brain/bone/flesh gaps) as new snippet files under `snippets/<snippet_dir>/`.
4. Update `AGENTS.md` tables and `src/agent.rs` pointers.
5. Report what was added and what remains on the worth-copying list.

If the user names a single repo (`only hermes`) or layer (`memory snippets from openclaw`), scope to that — otherwise run the full pass above.

## What counts as "core and important"

Copy code that answers how the framework **runs**, **remembers**, **injects context**, and **defines tools**. Use three layers:

| Layer | Hunt for | Skip unless asked |
|-------|----------|-------------------|
| **Brain** | Turn loop entry, `prompt()` / `run_conversation` / `generateText` loop, tool dispatch, steer/interrupt, step budget | UI, CLI parsers, gateway routing, tests |
| **Bone** | Session/transcript persistence, memory files, compaction/flush gates, snapshot/freeze patterns | Provider API clients, auth, deployment |
| **Flesh** | System prompt assembly, skills catalog injection, tool factories + policy pipelines, event subscribe/stream bridges | Channel adapters (Slack/Discord), styling, docs site |

**Rule of thumb:** if removing it would break "user message → model → tools → repeat" or "what the model sees before each call", it is core.

## Hard constraints

1. **Verbatim copies only** — same language as upstream (TypeScript/Python). Never port snippets into Rust.
2. **Rust is waist-only** — `src/agent.rs` gets marker `impl Agent` + `unimplemented!(...)` pointers, nothing more.
3. **Headers on every snippet file** — see [Snippet file format](#snippet-file-format).
4. **Middle sections may be omitted** — use `# ... remainder ...` or `// ...` comments; record exact line range of what you kept.
5. **Do not wire snippets together** — no imports between snippet files, no package.json, no making them compile.
6. **Do not commit** unless the user explicitly asks.

## Workflow

### 1. Verify sibling layout

Read clone targets from `repos.manifest.json`, then:

```bash
.agents/skills/crawl-reference-repos/scripts/status-refs.sh
```

Or manually: for each `.repos[].clone_dir`, test `../<clone_dir>/`.

On missing repos, print each `id`, `clone_dir`, and `url` from the manifest and stop. Example:

```text
Missing reference repos (clone as siblings of implAgent4):
  langgraph → ../langgraph  https://github.com/example/langgraph.git
```

The manifest drives verification — do not hardcode a fixed repo count.

### 2. Orient in the upstream repo

For each repo, start from the **brain** and walk outward:

```text
entry function/class  →  loop body  →  LLM boundary  →  tool execute
                      →  prompt/memory/skills inject  →  subscribe/on_event
                      →  persistence/compaction/memory flush
```

Use ripgrep, not linear file reads:

```bash
# Examples — adapt per repo
rg -l "agentLoop|run_conversation|ToolLoopAgent|runEmbeddedAttempt" ../oh-my-pi ../hermes-agent ../ai ../eve ../openclaw
rg -l "memory|prefetch|skillsPrompt|buildSystemPrompt|formatSkills" <repo>
rg -l "createMessageTool|AnyAgentTool|invoke_tool" <repo>
```

Read [reference-repos.md](reference-repos.md) for per-repo entry files and search terms.

### 3. Decide excerpt boundaries

Prefer **one concern per snippet file**:

- Good: `memory.flush-gate.ts`, `skills.format-for-prompt.ts`, `run-embedded.prompt-active-session.ts`
- Bad: `attempt.ts` (entire 5000-line file)

Each excerpt should be **self-explanatory in isolation** — enough context to see inputs, outputs, and call site role. Include:

- Function/class signature through the decisive logic (gate, inject, dispatch, return)
- Call-site blocks when the wiring is the insight (e.g. where `skillsPrompt` is passed into `buildAttemptSystemPrompt`)

Omit: imports, unrelated helpers, huge switch statements (note `// ... N cases ...`).

### 4. Write the snippet file

Path: `snippets/<impl-name>/<topic>.<symbol>.<ext>`

Naming: `{domain}.{what-it-shows}.{lang}` — domain prefixes group brain/bone/flesh (`run-embedded.*`, `memory.*`, `skills.*`, `tools.*`).

### 5. Update the catalog

After adding snippets:

1. **`AGENTS.md`** — add rows to the impl's table(s); extend brain/bone/flesh sections; update design-contrast column if the new code changes a row; add "worth copying later" for near-miss files.
2. **`src/agent.rs`** — add or extend marker `impl Agent for Foo` with `unimplemented!("see snippets/...")` paths.

### 6. Sanity check

- [ ] Header has correct upstream path and line numbers
- [ ] No Rust translation of upstream logic
- [ ] File name reflects one concern
- [ ] AGENTS.md maps `Agent` trait methods to real symbols
- [ ] Not duplicating an existing snippet (grep `snippets/` for the symbol name)

## Snippet file format

**TypeScript** (`.ts`):

```typescript
// Copied excerpt from <repo-short-name>
// Source: <repo-relative-path>
// Lines: <start>-<end>   (or comma-separated ranges)
// impl Agent: see AGENTS.md — <optional note>

<verbatim upstream code, with ... for omissions>
```

**Python** (`.py`):

```python
# Copied excerpt from hermes-agent
# Source: agent/memory_manager.py
# Lines: 296-310
# impl Agent: see AGENTS.md

<verbatim upstream code>
```

Use `//` for TS headers, `#` for Python — match the snippet language.

## Mapping to `Agent` trait

Every impl must document this mapping in `AGENTS.md`:

| Trait method | What to find upstream |
|--------------|----------------------|
| `run_turn` | First user input → starts loop |
| `continue_turn` | Retry, tool results on wire, harness `{ next: runStep }` |
| `steer` | Mid-run user input queue / interrupt flag |
| `on_event` | subscribe, stream callbacks, gateway bridge |
| `budget_remaining` | deadline, `IterationBudget`, `stopWhen`, context-window flush |

If upstream has no equivalent, say so in AGENTS.md and use `unimplemented!("...")` with a note.

## Per-repo priority checklist

When crawling a repo for the first time or doing a depth pass, collect in this order:

1. **Loop entry + body** (brain)
2. **Stateful wrapper** around the loop (`Agent.prompt`, `AgentSession`, harness `StepFn`)
3. **System prompt build** — especially memory + skills injection points (flesh)
4. **Memory persist/recall** — files on disk, prefetch fence, flush/compaction (bone)
5. **Skills load + format + inject** (flesh)
6. **Tool contract + one representative factory + policy pipeline** (flesh)
7. **Event/stream bridge** to UI/gateway (flesh)
8. **Subagent spawn** if first-class (brain extension)

See [reference-repos.md](reference-repos.md) for file-level starting points per repo.

## Anti-patterns

| Do not | Do instead |
|--------|------------|
| Rewrite upstream in Rust | Copy verbatim; trait docs only in `agent.rs` |
| Copy whole files | Excerpt 30–120 lines around the decision point |
| Copy tests as snippets | Copy production code; tests only inform what to hunt |
| Merge multiple impls into one snippet folder | One folder per upstream design |
| Add build/CI/deps to make snippets compile | Keep catalog inert |
| Paraphrase upstream in comments | Copy their comments inside the excerpt |

## Adding a new upstream impl

1. Add entry to **`repos.manifest.json`**
2. Add crawl section to **`reference-repos.md`**
3. User clones to `../<clone_dir>/`
4. Create `snippets/<snippet_dir>/` and run the [priority checklist](#per-repo-priority-checklist)
5. Add `pub struct Foo;` + `impl Agent for Foo` in `src/agent.rs`
6. Add a full section to **`AGENTS.md`** (brain/bone/flesh tables + trait map + worth-copying-later)
7. Add a subgraph node to the mermaid diagram in `AGENTS.md` if it is a major framework

## When the user says "copy more from X"

1. Read the impl's **"Worth copying later"** list in `AGENTS.md`
2. Grep upstream for those paths
3. Prefer gaps in brain/bone/flesh over duplicating brain-only coverage
4. Update the worth-copying list — remove what you copied, add new neighbors you discovered
