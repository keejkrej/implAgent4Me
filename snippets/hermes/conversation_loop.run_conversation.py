# Copied excerpt from hermes-agent
# Source: agent/conversation_loop.py
# Lines: 469-650
# impl Agent: see AGENTS.md

def run_conversation(
    agent,
    user_message: str,
    system_message: str = None,
    conversation_history: List[Dict[str, Any]] = None,
    task_id: str = None,
    stream_callback: Optional[callable] = None,
    persist_user_message: Optional[str] = None,
    persist_user_timestamp: Optional[float] = None,
) -> Dict[str, Any]:
    """
    Run a complete conversation with tool calling until completion.

    Args:
        user_message (str): The user's message/question
        system_message (str): Custom system message (optional, overrides ephemeral_system_prompt if provided)
        conversation_history (List[Dict]): Previous conversation messages (optional)
        task_id (str): Unique identifier for this task to isolate VMs between concurrent tasks (optional, auto-generated if not provided)
        stream_callback: Optional callback invoked with each text delta during streaming.
            Used by the TTS pipeline to start audio generation before the full response.
            When None (default), API calls use the standard non-streaming path.
        persist_user_message: Optional clean user message to store in
            transcripts/history when user_message contains API-only
            synthetic prefixes.
        persist_user_timestamp: Optional platform event timestamp to store
            as metadata on that persisted user message.
                or queuing follow-up prefetch work.

    Returns:
        Dict: Complete conversation result with final response and message history
    """
    # ── Per-turn setup (the prologue) ──
    # All once-per-turn setup — stdio guarding, retry-counter resets, user
    # message sanitization, todo/nudge hydration, system-prompt restore-or-
    # build, crash-resilience persistence, preflight compression, the
    # ``pre_llm_call`` plugin hook, and external-memory prefetch — lives in
    # ``build_turn_context``.  It mutates ``agent`` exactly as the inline code
    # did and returns the locals the loop below reads back.  See
    # ``agent/turn_context.py``.
    _ctx = build_turn_context(
        agent,
        user_message,
        system_message,
        conversation_history,
        task_id,
        stream_callback,
        persist_user_message,
        persist_user_timestamp,
        restore_or_build_system_prompt=_restore_or_build_system_prompt,
        install_safe_stdio=_install_safe_stdio,
        sanitize_surrogates=_sanitize_surrogates,
        summarize_user_message_for_log=_summarize_user_message_for_log,
        set_session_context=set_session_context,
        set_current_write_origin=set_current_write_origin,
        ra=_ra,
    )
    user_message = _ctx.user_message
    original_user_message = _ctx.original_user_message
    messages = _ctx.messages
    conversation_history = _ctx.conversation_history
    active_system_prompt = _ctx.active_system_prompt
    effective_task_id = _ctx.effective_task_id
    turn_id = _ctx.turn_id
    current_turn_user_idx = _ctx.current_turn_user_idx
    _should_review_memory = _ctx.should_review_memory
    _plugin_user_context = _ctx.plugin_user_context
    _ext_prefetch_cache = _ctx.ext_prefetch_cache

    # Main conversation loop counters (pure locals consumed by the loop below).
    api_call_count = 0
    final_response = None
    interrupted = False
    failed = False
    codex_ack_continuations = 0
    length_continue_retries = 0
    truncated_tool_call_retries = 0
    truncated_response_parts: List[str] = []
    compression_attempts = 0
    _turn_exit_reason = "unknown"  # Diagnostic: why the loop ended

    # Optional opt-in runtime: if api_mode == codex_app_server, hand the
    # turn to the codex app-server subprocess (terminal/file ops/patching
    # all run inside Codex). Default Hermes path is bypassed entirely.
    # See agent/transports/codex_app_server_session.py for the adapter
    # and references/codex-app-server-runtime.md for the rationale.
    if agent.api_mode == "codex_app_server":
        return agent._run_codex_app_server_turn(
            user_message=user_message,
            original_user_message=original_user_message,
            messages=messages,
            effective_task_id=effective_task_id,
            should_review_memory=_should_review_memory,
        )

    while (api_call_count < agent.max_iterations and agent.iteration_budget.remaining > 0) or agent._budget_grace_call:
        # Reset per-turn checkpoint dedup so each iteration can take one snapshot
        agent._checkpoint_mgr.new_turn()

        # Check for interrupt request (e.g., user sent new message)
        if agent._interrupt_requested:
            interrupted = True
            _turn_exit_reason = "interrupted_by_user"
            if not agent.quiet_mode:
                agent._safe_print("\n⚡ Breaking out of tool loop due to interrupt...")
            break
        
        api_call_count += 1
        agent._api_call_count = api_call_count
        agent._touch_activity(f"starting API call #{api_call_count}")

        # Grace call: the budget is exhausted but we gave the model one
        # more chance.  Consume the grace flag so the loop exits after
        # this iteration regardless of outcome.
        if agent._budget_grace_call:
            agent._budget_grace_call = False
        elif not agent.iteration_budget.consume():
            _turn_exit_reason = "budget_exhausted"
            if not agent.quiet_mode:
                agent._safe_print(f"\n⚠️  Iteration budget exhausted ({agent.iteration_budget.used}/{agent.iteration_budget.max_total} iterations used)")
            break

        # Fire step_callback for gateway hooks (agent:step event)
        if agent.step_callback is not None:
            try:
                prev_tools = []
                for _idx, _m in enumerate(reversed(messages)):
                    if _m.get("role") == "assistant" and _m.get("tool_calls"):
                        _fwd_start = len(messages) - _idx
                        _results_by_id = {}
                        for _tm in messages[_fwd_start:]:
                            if _tm.get("role") != "tool":
                                break
                            _tcid = _tm.get("tool_call_id")
                            if _tcid:
                                _results_by_id[_tcid] = _tm.get("content", "")
                        prev_tools = [
                            {
                                "name": tc["function"]["name"],
                                "result": _results_by_id.get(tc.get("id")),
                                "arguments": tc["function"].get("arguments"),
                            }
                            for tc in _m["tool_calls"]
                            if isinstance(tc, dict)
                        ]
                        break
                agent.step_callback(api_call_count, prev_tools)
            except Exception as _step_err:
                logger.debug("step_callback error (iteration %s): %s", api_call_count, _step_err)

        # Track tool-calling iterations for skill nudge.
        # Counter resets whenever skill_manage is actually used.
        if (agent._skill_nudge_interval > 0
                and "skill_manage" in agent.valid_tool_names):
            agent._iters_since_skill += 1
        
        # ── Pre-API-call /steer drain ──────────────────────────────────
        # If a /steer arrived during the previous API call (while the model
        # was thinking), drain it now — before we build api_messages — so
        # the model sees the steer text on THIS iteration.  Without this,
        # steers sent during an API call only land after the NEXT tool batch,
        # which may never come if the model returns a final response.
        #
        # We scan backwards for the last tool-role message in the messages
        # list.  If found, the steer is appended there.  If not (first
        # iteration, no tools yet), the steer stays pending for the next
        # tool batch — injecting into a user message would break role
        # alternation, and there's no tool output to piggyback on.
        _pre_api_steer = agent._drain_pending_steer()
        if _pre_api_steer:
            _injected = False
            for _si in range(len(messages) - 1, -1, -1):
                _sm = messages[_si]
                if isinstance(_sm, dict) and _sm.get("role") == "tool":
                    from agent.prompt_builder import format_steer_marker
                    marker = format_steer_marker(_pre_api_steer)
                    existing = _sm.get("content", "")
                    if isinstance(existing, str):
                        _sm["content"] = existing + marker
                    else:
                        # Multimodal content blocks — append text block
                        try:
                            blocks = list(existing) if existing else []
