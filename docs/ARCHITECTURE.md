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
- **Voice Push-to-Talk STT (`apps/api/services/stt_service.py`, `apps/web/src/components/VoiceButton.tsx`)**:
  - Browser `MediaRecorder` captures audio in `audio/webm;codecs=opus` and uploads to `POST /rooms/{room_id}/agent/stt`.
  - Transcribes audio via Groq Whisper Turbo (`whisper-large-v3-turbo`) with 20s timeout and untrusted transcript handling.
  - Automatically commits speech events to room timeline and triggers Pair Master agent inquiry.
- **Collaborative Freehand Drawing Canvas (`apps/web/src/components/DrawingCanvas.tsx`)**:
  - Transparent SVG overlay rendered with Steve Ruiz's `perfect-freehand` algorithm, producing smooth calligraphic strokes with pressure variation.
  - Synchronized across peers via Yjs shared array `freehand_strokes` without locking.
  - Color-coded per participant: Dev A (Emerald `#10b981`), Dev B (Sky Blue `#0284c7`).
  - "Draw" mode toggle leaves underlying Monaco editor fully functional when inactive.

### C. Database & Persistence (Supabase)
- **Sessions & Participants**: Room lifecycle and authorization tokens (JWT signed with 4-hour expiry; max 2 human participants).
- **Ownership**: Maps AST symbol names (not fragile line numbers) to human owners.
- **Events**: Append-only log with unique idempotency keys. Serves timeline UI, run output synchronization, and session replay.
### D. End-of-Session Structured Recap Engine
- **Event Aggregation**: Queries room event history (code executions, errors, ownership splits, agent conversations).
- **Pydantic Validation**: Enforces structured schema (`executive_summary`, `decisions_made`, `ownership_breakdown`, `bugs_encountered`, `action_items`).
- **Resilient Repair Chain (Rule 6)**: If the LLM generates malformed JSON, a 1-shot repair prompt fixes the syntax, guaranteeing a valid recap without crashing the room.
- **Export Formats**: Provides JSON API, Supabase DB persistence, in-app rich modal view, and Markdown export for clipboard/file saving.

### E. LiveKit WebRTC Video/Audio Call & Screen Sharing
- **Edge SFU Routing**: LiveKit Cloud Selective Forwarding Unit routes encrypted VP8/H.264 video and 48 kHz Opus audio.
- **Cryptographic JWT Tokens**: Issued by FastAPI backend (`/rooms/{room_id}/livekit/token`) signed with HS256 algorithm.
- **Floating Call Dock**: Controls for microphone mute, camera toggle, screen share, and peer video bubbles.

### F. Multi-Browser E2E Collaboration Verification (Phase P7)
- **Playwright Test Suite**: Multi-seat collaboration automated with independent browser contexts (`contextA` Dev A and `contextB` Dev B) joining the same room and validating real-time CRDT synchronization, presence, and tools.
- **Continuous Keep-Warm**: GitHub Actions workflow cron pings `/healthz` and Supabase REST every 10 minutes to eliminate cold start delays.

---
*Status: Phase P7 (E2E Multi-Browser Collaboration Testing, LiveKit WebRTC Call Integration, and Production Deployment Runbook) verified and complete. Ready for production deployment.*
