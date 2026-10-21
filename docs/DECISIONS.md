# Architectural Decisions Log (ADR) — Pairio-Lite

This document tracks all significant architectural decisions, stack selections, and deviations from defaults.

---

## ADR-001: Strict 3-Seat Collaboration Model
- **Context**: Pairio is built for remote engineering collaboration between pairs. Pair Master introduces an AI agent as a structured facilitator on the "third seat".
- **Decision**: Restrict room capacity to at most 2 human participants + 1 AI agent.
- **Consequences**: Avoids complex multi-party scaling in the prototype, maximizes focus on pair dynamics and AI facilitation clarity.

## ADR-002: In-Browser Sandboxed Python Execution (Pyodide Worker)
- **Context**: Allowing users to execute arbitrary code requires compute and carries severe security risks if hosted server-side.
- **Decision**: Run Python execution exclusively in a client-side Web Worker using Pyodide with a hard 5-second execution timeout. Untrusted user code is NEVER executed on the server.
- **Consequences**: Zero server security footprint for code execution; server compute costs remain near zero. Worker can be terminated and recreated if an infinite loop occurs.

## ADR-003: Symbol-Keyed Code Ownership
- **Context**: Line-based code ownership attribution breaks immediately as soon as a user adds or removes lines above an owned block.
- **Decision**: Key code ownership by AST symbol name (`module.function_name` / `ClassName.method_name`), resolved dynamically against Python AST ranges.
- **Consequences**: Edits to other functions don't invalidate ownership. If a symbol is renamed or deleted, it transitions to "orphaned" status with a visible warning.

## ADR-004: Event-Driven Agent Invocation & Token Budgeting
- **Context**: Groq free tier imposes limits (30 req/min, 8K tokens/min). Continuous keystroke streaming to LLMs would instantly trigger HTTP 429 rate limits.
- **Decision**: Trigger the agent solely on 3 explicit events: (1) Pyodide runtime error, (2) explicit user question / voice push-to-talk, (3) "Split work" button. Input tokens are strictly capped at ~3,000 tokens per call.
- **Consequences**: Predictable token consumption well within free-tier quotas; responsiveness is fast and cost is near zero.

## ADR-005: Dual LLM Strategy with Fallback Chain
- **Context**: Free-tier rate limits or transient errors could stall the live collaboration demo.
- **Decision**: Use Groq `openai/gpt-oss-120b` as primary; automatically fallback to `openai/gpt-oss-20b` on 429/503; maintain a labeled in-memory hash cache for identical error/code states.
- **Consequences**: High demo resilience. Fallbacks and cached states are always explicitly labeled in the UI.

## ADR-006: Stateless Backend with Supabase as Single Source of Truth
- **Context**: Render free-tier instances sleep after 15 minutes of inactivity and disk storage is ephemeral.
- **Decision**: No critical state is stored on API container disk or non-persisted RAM. Yjs snapshots and room events are flushed to Supabase Postgres.
- **Consequences**: API instances can restart anytime without data loss; clients automatically reconnect and resync. Keep-warm cron pings `/healthz` periodically.

## ADR-007: pycrdt-websocket Integration Inside FastAPI (Spike Completed)
- **Context**: Phase P1 required a 1-hour spike to confirm whether `pycrdt-websocket` works cleanly inside FastAPI before considering a Node.js `y-websocket` fallback.
- **Decision**: Maintain single-service Python architecture by using `pycrdt-websocket` with a custom `FastAPIWebsocketChannel` adapter.
- **Findings & Resolution**:
  - The spike confirmed that `pycrdt.websocket.WebsocketServer` successfully synchronizes documents with browser Yjs clients.
  - Crucial finding: `WebsocketServer.start()` must be scheduled as a background asyncio task (`asyncio.create_task`), followed by awaiting `server.started.wait()`, rather than called as a blocking coroutine.
  - No secondary Node.js service is needed, avoiding extra deployment overhead on Render free tier.
