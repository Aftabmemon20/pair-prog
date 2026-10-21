# Architecture — Pairio-Lite "Pair Master"

## 1. High-Level Overview

Pairio-Lite is a collaborative browser-based pair programming prototype designed around a **3-seat model**:
- **Seat 1 (Dev A - Host)**: Edits code, shares screen, drives development.
- **Seat 2 (Dev B - Collaborator / Mark)**: Concurrently edits code, draws on screen, speaks via WebRTC.
- **Seat 3 (Pair Master - AI Facilitator)**: Does not write code autonomously; instead acts as a facilitator:
  - Divides code ownership (`propose_ownership`) based on function/class boundaries.
  - Automatically isolates runtime failures, extracts stack trace context, and points out the root cause with verified code evidence.
  - Generates Mermaid architectural diagrams colored by owner status (failing node highlighted in red).
  - Annotates Monaco editor lines in real-time.
  - Produces end-of-session summaries and recaps.

```
 Dev A (Host) ─┐                       ┌────────── Supabase (PostgreSQL Free)
               ├─ Next.js (App Router) │            ├─ sessions (rooms)
 Dev B (Peer) ─┘  ├─ Monaco + Yjs ──WS─┤            ├─ participants
   │  │           ├─ Pyodide Worker    │            ├─ ownership (AST-keyed)
   │  │           └─ LiveKit React     │            ├─ events (audit & timeline)
   │  │                                │            └─ recaps
   │  │                                FastAPI (Render Free)
   │  │                                 ├─ Yjs Sync (pycrdt-websocket)
   │  │                                 ├─ Pair Master (LangGraph Supervisor)
   │  │                                 ├─ /stt (Groq Whisper Turbo)
   │  │                                 └─ /healthz (health check)
   │  │
   │  └── LiveKit Cloud (WebRTC): Audio & Screen Share (TURN included)
   └───── LLM: Groq gpt-oss-120b (Primary) ──► gpt-oss-20b (Fallback on 429)
```

## 2. Key Components

### A. Web Application (`apps/web`)
- **Next.js App Router** with TypeScript and Tailwind CSS.
- **Monaco Editor** with `y-monaco` and `Yjs` for conflict-free concurrent editing without locking.
- **Pyodide Web Worker Runner (`apps/web/src/lib/pyodideRunner.ts`)**:
  - Executes Python entirely client-side inside a sandboxed Web Worker. Untrusted user code **never** runs on the server.
  - Compiles user code under filename `"main.py"` so Python runtime exceptions map 1:1 to Monaco editor line numbers.
  - Implements a **Warm Spare Worker** architecture with a hard 5-second execution timeout. If infinite loops occur, the active worker is forcefully terminated, the warm spare is instantly promoted with zero cold-start delay, and a replacement spare is spun up in the background.
  - Output Panel displays real-time terminal output, structured stack trace frames with click-to-line navigation, and AST symbol tables.
- **Perfect-Freehand + HTML5 Canvas**: Real-time collaborative drawing overlaid on code.
- **LiveKit React Components**: Audio conferencing and screen sharing via WebRTC SFU.

### B. Backend API (`apps/api`)
- **FastAPI (Python 3.12)**: Asynchronous REST, WebSocket endpoints, and health monitoring.
- **Structured JSON Logging**: Every request is tagged with a unique `request_id` (via `X-Request-ID` middleware).
- **pycrdt-websocket Server (`apps/api/services/yjs_manager.py`)**:
  - Implements `FastAPIWebsocketChannel` to bridge Starlette WebSockets to pycrdt's transport-agnostic `Channel` protocol.
  - Automatically seeds newly initialized rooms with `demo/inventory.py`.
  - Runs a background task every 10 seconds to flush dirty room snapshots to Supabase / in-memory cache.
  - Flushes immediately when the last client disconnects from a room.
- **Python AST Parser & Traceback Parser (`apps/api/services/parser.py`)**:
  - Extracts exact start and end line ranges for top-level functions, classes, and methods via Python's standard `ast` module.
  - Parses raw traceback text into structured frames (`file`, `line`, `function`, `code_line`, `error_type`, `error_message`).
- **Pair Master Agent (LangGraph `apps/api/agent/graph.py`)**:
  - Supervised StateGraph orchestrator (`build_context -> plan -> tool loop -> respond -> log`) with a hard limit of 4 tool steps per turn.
  - Untrusted data defense guardrail: source code in the editor, terminal outputs, and transcripts are tagged as untrusted data; prompt injections embedded within user code or comments are ignored.
  - Strict response brevity: <= 120 words per response to respect display limits and live pair attention.
  - Typed Pydantic tools (`apps/api/agent/tools.py`): `list_symbols`, `get_workspace_slice` (capped at 60 lines to respect ~3K token budget), `annotate_code`, `show_diagram`, `post_message`.
  - Resilient Groq Client (`apps/api/services/llm_client.py`): 20s turn timeout, exponential backoff retry, automatic fallback from `openai/gpt-oss-120b` to `openai/gpt-oss-20b` on 429/503, regex secret redaction (`sk_live_`, `gsk_`, `ey...`), and SHA256 in-memory caching.
- **Ownership & Failure Isolation Architecture (`apps/api/services/ownership.py`, `apps/api/routers/ownership.py`)**:
  - **Dynamic AST Symbol Resolution**: Code ownership is keyed by Python symbol names (`load_items`, `apply_discount`, `checkout_total`), dynamically mapped to live line ranges. If an owner-assigned symbol is deleted or renamed, it transitions to `is_orphaned: True` rather than corrupting line ranges.
  - **Visual Monaco Gutter Borders**: Functions owned by Dev A are highlighted with an emerald left gutter border (`#10b981`); Dev B functions are highlighted with a sky blue left gutter border (`#0284c7`).
  - **Interactive Call Graph (Mermaid `apps/web/src/components/MermaidDiagram.tsx`)**: Automatically builds an architectural flowchart from AST caller/callee relationships, colored by owner, with zoom, reset, and source copy controls.
  - **Automated Failure Isolation (`POST /rooms/{room_id}/agent/analyze-failure`)**: When a runtime failure occurs, Pair Master pinpoints the failing frame (`apply_discount`, line 28), correlates the owner (`Dev B`), renders line 28 with a Monaco error decoration, highlights the failing node in ruby red (`#881337`) in the Mermaid diagram, and generates a concise grounded explanation.

### C. Database & Persistence (Supabase)
- **Sessions & Participants**: Room lifecycle and authorization tokens (JWT signed with 4-hour expiry; max 2 human participants).
- **Ownership**: Maps AST symbol names (not fragile line numbers) to human owners.
- **Events**: Append-only log with unique idempotency keys. Serves timeline UI, run output synchronization, and session replay.
- **Recaps**: Structured summaries saved at session conclusion.

---
*Status: Phase P4 (Code Ownership Partitioning, Mermaid Call Graph & Failure Isolation) verified and complete.*
