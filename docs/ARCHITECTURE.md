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
- **Pyodide Web Worker**: In-browser sandboxed Python runtime. Untrusted user code **never** executes on the backend server.
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
- **Pair Master Agent (LangGraph)**: Supervised state machine with typed Pydantic tools (`list_symbols`, `get_workspace_slice`, `propose_ownership`, `annotate_code`, `show_diagram`, `post_message`).

### C. Database & Persistence (Supabase)
- **Sessions & Participants**: Room lifecycle and authorization tokens (JWT signed with 4-hour expiry; max 2 human participants).
- **Ownership**: Maps AST symbol names (not fragile line numbers) to human owners.
- **Events**: Append-only log with unique idempotency keys. Serves timeline UI and enables session replay.
- **Recaps**: Structured summaries saved at session conclusion.

---
*Status: Phase P1 (Rooms + Collaborative Editor) verified and complete.*
