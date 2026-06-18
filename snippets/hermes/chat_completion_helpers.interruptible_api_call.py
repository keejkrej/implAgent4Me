# Copied excerpt from hermes-agent
# Source: hermes-agent/agent/chat_completion_helpers.py
# Lines: 125-220
# impl Agent: see AGENTS.md

def interruptible_api_call(agent, api_kwargs: dict):
    """
    Run the API call in a background thread so the main conversation loop
    can detect interrupts without waiting for the full HTTP round-trip.

    Each worker thread gets its own OpenAI client instance. Interrupts only
    close that worker-local client, so retries and other requests never
    inherit a closed transport.

    Includes a stale-call detector: if no response arrives within the
    configured timeout, the connection is killed and an error raised so
    the main retry loop can try again with backoff / credential rotation /
    provider fallback.
    """
    result = {"response": None, "error": None}
    request_client_holder = {"client": None, "owner_tid": None}
    request_client_lock = threading.Lock()
    # Request-local cancellation flag. Distinct from agent._interrupt_requested
    # because that flag is cleared at run_conversation() turn boundaries, but
    # this daemon worker thread can outlive the turn (the gateway caches
    # AIAgent instances per session). Tracks whether THIS specific request was
    # cancelled by the main thread's interrupt handler, so the transport error
    # that is the expected consequence of our own force-close isn't misread as
    # a network bug and surfaced to the caller. (PR #6600 — cascading interrupt
    # hang.)
    _request_cancelled = {"value": False}

    def _set_request_client(client):
        with request_client_lock:
            request_client_holder["client"] = client
            # #29507: stamp the owning thread so a stranger-thread interrupt
            # only shuts the connection down rather than racing the worker
            # for FD ownership during ``client.close()``.
            request_client_holder["owner_tid"] = threading.get_ident()
        return client

    def _close_request_client_once(reason: str) -> None:
        # #29507: dispatch on the calling thread.
        #
        # When ``_call`` (the worker) reaches its ``finally`` it owns the
        # close and we pop + fully close as before. When a *stranger* thread
        # (the interrupt-check loop, the stale-call detector) drives the
        # close, only shut the sockets down so the worker's blocked
        # ``recv``/``send`` unwinds with an ``EPIPE`` / EOF — and let the
        # worker close ``client`` from its own thread on its way out. That
        # avoids the FD-recycling race where the kernel reassigned a
        # just-closed TLS socket FD to ``kanban.db``, and the still-live SSL
        # BIO on the worker thread then wrote a 24-byte TLS application-data
        # record into the SQLite header (#29507).
        with request_client_lock:
            request_client = request_client_holder.get("client")
            owner_tid = request_client_holder.get("owner_tid")
            stranger_thread = (
                request_client is not None
                and owner_tid is not None
                and owner_tid != threading.get_ident()
            )
            if not stranger_thread:
                # Owning thread (or no recorded owner) → pop and fully close.
                request_client_holder["client"] = None
                request_client_holder["owner_tid"] = None
        if request_client is None:
            return
        if stranger_thread:
            agent._abort_request_openai_client(request_client, reason=reason)
        else:
            agent._close_request_openai_client(request_client, reason=reason)

    def _call():
        try:
            if agent.api_mode == "codex_responses":
                request_client = _set_request_client(
                    agent._create_request_openai_client(
                        reason="codex_stream_request",
                        api_kwargs=api_kwargs,
                    )
                )
                result["response"] = agent._run_codex_stream(
                    api_kwargs,
                    client=request_client,
                    on_first_delta=getattr(agent, "_codex_on_first_delta", None),
                )
            elif agent.api_mode == "anthropic_messages":
                result["response"] = agent._anthropic_messages_create(api_kwargs)
            elif agent.api_mode == "bedrock_converse":
                # Bedrock uses boto3 directly — no OpenAI client needed.
                # normalize_converse_response produces an OpenAI-compatible
                # SimpleNamespace so the rest of the agent loop can treat
                # bedrock responses like chat_completions responses.
                from agent.bedrock_adapter import (
                    _get_bedrock_runtime_client,
                    invalidate_runtime_client,
                    is_stale_connection_error,
                    normalize_converse_response,
                )
                region = api_kwargs.pop("__bedrock_region__", "us-east-1")
