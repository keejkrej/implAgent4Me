# Copied excerpt from hermes-agent
# Source: hermes-agent/agent/agent_runtime_helpers.py
# Lines: 1713-1907
# impl Agent: see AGENTS.md

def invoke_tool(agent, function_name: str, function_args: dict, effective_task_id: str,
                 tool_call_id: Optional[str] = None, messages: list = None,
                 pre_tool_block_checked: bool = False,
                 skip_tool_request_middleware: bool = False,
                 tool_request_middleware_trace: Optional[List[Dict[str, Any]]] = None) -> str:
    """Invoke a single tool and return the result string. No display logic.

    Handles both agent-level tools (todo, memory, etc.) and registry-dispatched
    tools. Used by the concurrent execution path; the sequential path retains
    its own inline invocation for backward-compatible display handling.
    """
    if not isinstance(function_args, dict):
        function_args = {}

    _tool_middleware_trace = list(tool_request_middleware_trace or [])
    try:
        from hermes_cli.middleware import apply_tool_request_middleware

        if not skip_tool_request_middleware:
            _tool_request_mw = apply_tool_request_middleware(
                function_name,
                function_args,
                task_id=effective_task_id or "",
                session_id=getattr(agent, "session_id", "") or "",
                tool_call_id=tool_call_id or "",
                turn_id=getattr(agent, "_current_turn_id", "") or "",
                api_request_id=getattr(agent, "_current_api_request_id", "") or "",
            )
            function_args = _tool_request_mw.payload
            _tool_middleware_trace = _tool_request_mw.trace
    except Exception as _mw_err:
        logger.debug("tool_request middleware error: %s", _mw_err)

    # Check plugin hooks for a block directive before executing anything.
    block_message: Optional[str] = None
    if not pre_tool_block_checked:
        try:
            from hermes_cli.plugins import get_pre_tool_call_block_message
            block_message = get_pre_tool_call_block_message(
                function_name,
                function_args,
                task_id=effective_task_id or "",
                session_id=getattr(agent, "session_id", "") or "",
                tool_call_id=tool_call_id or "",
                turn_id=getattr(agent, "_current_turn_id", "") or "",
                api_request_id=getattr(agent, "_current_api_request_id", "") or "",
                middleware_trace=list(_tool_middleware_trace),
            )
        except Exception:
            pass
    if block_message is not None:
        result = json.dumps({"error": block_message}, ensure_ascii=False)
        try:
            from model_tools import _emit_post_tool_call_hook
            _emit_post_tool_call_hook(
                function_name=function_name,
                function_args=function_args,
                result=result,
                task_id=effective_task_id or "",
                session_id=getattr(agent, "session_id", "") or "",
                tool_call_id=tool_call_id or "",
                turn_id=getattr(agent, "_current_turn_id", "") or "",
                api_request_id=getattr(agent, "_current_api_request_id", "") or "",
                status="blocked",
                error_type="plugin_block",
                error_message=block_message,
                middleware_trace=list(_tool_middleware_trace),
            )
        except Exception:
            pass
        return result

    tool_start_time = time.monotonic()

    def _finish_agent_tool(result: Any, observed_args: Optional[dict] = None) -> Any:
        hook_args = observed_args if isinstance(observed_args, dict) else function_args
        try:
            from model_tools import _emit_post_tool_call_hook
            _emit_post_tool_call_hook(
                function_name=function_name,
                function_args=hook_args,
                result=result,
                task_id=effective_task_id or "",
                session_id=getattr(agent, "session_id", "") or "",
                tool_call_id=tool_call_id or "",
                turn_id=getattr(agent, "_current_turn_id", "") or "",
                api_request_id=getattr(agent, "_current_api_request_id", "") or "",
                duration_ms=int((time.monotonic() - tool_start_time) * 1000),
                middleware_trace=list(_tool_middleware_trace),
            )
        except Exception:
            pass
        return result

    if function_name == "todo":
        def _execute(next_args: dict) -> Any:
            from tools.todo_tool import todo_tool as _todo_tool
            return _finish_agent_tool(
                _todo_tool(
                    todos=next_args.get("todos"),
                    merge=next_args.get("merge", False),
                    store=agent._todo_store,
                ),
                next_args,
            )
    elif function_name == "session_search":
        def _execute(next_args: dict) -> Any:
            session_db = agent._get_session_db_for_recall()
            if not session_db:
                from hermes_state import format_session_db_unavailable
                return _finish_agent_tool(json.dumps({"success": False, "error": format_session_db_unavailable()}), next_args)
            from tools.session_search_tool import session_search as _session_search
            return _finish_agent_tool(
                _session_search(
                    query=next_args.get("query", ""),
                    role_filter=next_args.get("role_filter"),
                    limit=next_args.get("limit", 3),
                    session_id=next_args.get("session_id"),
                    around_message_id=next_args.get("around_message_id"),
                    window=next_args.get("window", 5),
                    sort=next_args.get("sort"),
                    db=session_db,
                    current_session_id=agent.session_id,
                ),
                next_args,
            )
    elif function_name == "memory":
        def _execute(next_args: dict) -> Any:
            target = next_args.get("target", "memory")
            from tools.memory_tool import memory_tool as _memory_tool
            result = _memory_tool(
                action=next_args.get("action"),
                target=target,
                content=next_args.get("content"),
                old_text=next_args.get("old_text"),
                store=agent._memory_store,
            )
            # Bridge: notify external memory provider of built-in memory writes
            if agent._memory_manager and next_args.get("action") in {"add", "replace"}:
                try:
                    agent._memory_manager.on_memory_write(
                        next_args.get("action", ""),
                        target,
                        next_args.get("content", ""),
                        metadata=agent._build_memory_write_metadata(
                            task_id=effective_task_id,
                            tool_call_id=tool_call_id,
                        ),
                    )
                except Exception:
                    pass
            return _finish_agent_tool(result, next_args)
    elif agent._memory_manager and agent._memory_manager.has_tool(function_name):
        def _execute(next_args: dict) -> Any:
            return _finish_agent_tool(agent._memory_manager.handle_tool_call(function_name, next_args), next_args)
    elif function_name == "clarify":
        def _execute(next_args: dict) -> Any:
            from tools.clarify_tool import clarify_tool as _clarify_tool
            return _finish_agent_tool(
                _clarify_tool(
                    question=next_args.get("question", ""),
                    choices=next_args.get("choices"),
                    callback=agent.clarify_callback,
                ),
                next_args,
            )
    elif function_name == "read_terminal":
        def _execute(next_args: dict) -> Any:
            from tools.read_terminal_tool import read_terminal_tool as _read_terminal_tool
            return _finish_agent_tool(
                _read_terminal_tool(
                    start_line=next_args.get("start_line"),
                    count=next_args.get("count"),
                    callback=getattr(agent, "read_terminal_callback", None),
                ),
                next_args,
            )
    elif function_name == "delegate_task":
        def _execute(next_args: dict) -> Any:
            return _finish_agent_tool(agent._dispatch_delegate_task(next_args), next_args)
    else:
        def _execute(next_args: dict) -> Any:
            return _ra().handle_function_call(
                function_name, next_args, effective_task_id,
                tool_call_id=tool_call_id,
                session_id=agent.session_id or "",
                turn_id=getattr(agent, "_current_turn_id", "") or "",
                api_request_id=getattr(agent, "_current_api_request_id", "") or "",
                enabled_tools=list(agent.valid_tool_names) if agent.valid_tool_names else None,
                skip_pre_tool_call_hook=True,
                skip_tool_request_middleware=True,
                enabled_toolsets=getattr(agent, "enabled_toolsets", None),
                disabled_toolsets=getattr(agent, "disabled_toolsets", None),
                tool_request_middleware_trace=list(_tool_middleware_trace),
            )
