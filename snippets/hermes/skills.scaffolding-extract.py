# Copied excerpt from hermes-agent
# Source: agent/skill_commands.py
# Lines: 29-80
# impl Agent: see AGENTS.md — keep memory clean when /skill expands turns

# ---------------------------------------------------------------------------
# Skill-scaffolding markers and the canonical extractor.
#
# When a user invokes a /skill (or /bundle), Hermes expands the turn into a
# model-facing message that embeds the full skill body plus scaffolding. That
# expanded text is what flows into the agent loop — and into memory providers
# via MemoryManager. Providers that store or embed the raw user turn (mem0,
# openviking, hindsight, retaindb, byterover, honcho, supermemory) would
# otherwise capture the entire skill body instead of what the user actually
# asked. ``extract_user_instruction_from_skill_message`` recovers just the
# user's instruction so memory stays clean.
#
# These markers MUST stay byte-identical to the builders below
# (``_build_skill_message`` here, ``build_bundle_invocation_message`` in
# agent/skill_bundles.py). They are co-located with the single-skill builder
# on purpose, and the bundle markers are asserted against the bundle builder in
# tests/openviking_plugin/test_openviking.py::test_skill_markers_match_hermes_scaffolding.
# ---------------------------------------------------------------------------
_SKILL_INVOCATION_PREFIX = "[IMPORTANT: The user has invoked the "
_SINGLE_SKILL_MARKER = "The full skill content is loaded below.]"
_SINGLE_SKILL_INSTRUCTION = (
    "The user has provided the following instruction alongside the skill invocation: "
)
_RUNTIME_NOTE = "\n\n[Runtime note:"
_BUNDLE_MARKER = " skill bundle,"
_BUNDLE_USER_INSTRUCTION = "\nUser instruction: "
_BUNDLE_FIRST_SKILL_BLOCK = "\n\n[Loaded as part of the "


def extract_user_instruction_from_skill_message(content: Any) -> Optional[str]:
    """Recover the user's instruction from a slash-skill-expanded turn.

    Returns:
        - The original string unchanged when it is NOT skill scaffolding
          (a normal user message passes straight through).
        - The extracted user instruction when the scaffolding carried one.
        - ``None`` when the content is skill scaffolding with no user
          instruction (i.e. a bare ``/skill`` invocation). Callers that feed
          memory providers should skip the turn in that case — there is no
          user content worth storing.
    """
    if not isinstance(content, str):
        return None

    if not content.startswith(_SKILL_INVOCATION_PREFIX):
        return content

    if _BUNDLE_MARKER in content:
        return _extract_bundle_user_instruction(content)

    if _SINGLE_SKILL_MARKER in content:
        return _extract_single_skill_user_instruction(content)
