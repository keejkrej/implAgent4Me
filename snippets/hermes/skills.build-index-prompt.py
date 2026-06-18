# Copied excerpt from hermes-agent
# Source: agent/prompt_builder.py
# Lines: 1202-1226, 1431-1458
# impl Agent: see AGENTS.md — skills catalog injected into stable prompt tier

def build_skills_system_prompt(
    available_tools: "set[str] | None" = None,
    available_toolsets: "set[str] | None" = None,
    compact_categories: "frozenset[str] | None" = None,
) -> str:
    """Build a compact skill index for the system prompt.

    Two-layer cache:
      1. In-process LRU dict keyed by (skills_dir, tools, toolsets, hidden)
      2. Disk snapshot (``.skills_prompt_snapshot.json``) validated by
         mtime/size manifest — survives process restarts

    Falls back to a full filesystem scan when both layers miss.

    External skill directories (``skills.external_dirs`` in config.yaml) are
    scanned alongside the local ``~/.hermes/skills/`` directory.  External dirs
    are read-only — they appear in the index but new skills are always created
    in the local dir.  Local skills take precedence when names collide.

    ``compact_categories`` (e.g. from the coding posture — see
    agent/coding_context.py) demotes whole categories to a names-only line in
    the rendered index. Nothing is ever hidden: every skill name stays
    visible and loadable via ``skill_view`` / ``skills_list``; only the
    descriptions are dropped, and a footer note explains the demotion.
    """
    # ... scan skills_dir, build index_lines ...

        result = (
            "## Skills (mandatory)\n"
            "Before replying, scan the skills below. If a skill matches or is even partially relevant "
            "to your task, you MUST load it with skill_view(name) and follow its instructions. "
            "Err on the side of loading — it is always better to have context you don't need "
            "than to miss critical steps, pitfalls, or established workflows. "
            # ... additional guidance ...
            "\n"
            "<available_skills>\n"
            + "\n".join(index_lines) + "\n"
            "</available_skills>\n"
            "\n"
            "Only proceed without loading a skill if genuinely none are relevant to the task."
            + hidden_note
        )

    return result
