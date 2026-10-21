# Known Gaps & Future Roadmap — Pairio-Lite

This document tracks known omissions, planned architectural evolutions, and stubbed interfaces.

---

## 1. Web vs. Native Pairio Discrepancies
- **ScreenCaptureKit vs. Browser getDisplayMedia**:
  - *Current Prototype*: Uses standard WebRTC `navigator.mediaDevices.getDisplayMedia` via LiveKit Cloud.
  - *Pairio Native (macOS)*: Uses Apple ScreenCaptureKit for OS-level 60fps capture, per-window sharing, and zero-latency desktop streaming.
- **OS-Level Remote Input Control**:
  - *Current Prototype*: Collaboration is scoped to shared Monaco editor CRDT, canvas drawings, and WebRTC audio.
  - *Pairio Native*: Full OS-level mouse and keyboard passthrough.
- **App Masking**:
  - *Current Prototype*: Sensitive secret redaction on outgoing LLM payloads via regex. No graphical masking of desktop windows.
  - *Pairio Native*: Private window masking at GPU/compositor layer.

## 2. Platform & Language Limits
- **Demo Language Support**:
  - *Current Prototype*: Python only (via client-side Pyodide Web Worker and server-side `ast` parsing).
  - *Future Work*: TypeScript/JavaScript via WebContainer / QuickJS; Rust/Go language servers.
- **Concurrency & Room Limits**:
  - Prototype hard-caps at 2 human participants + 1 AI agent per room.

## 3. Active Stubs
- **STUB: Voice Push-to-Talk via Groq Whisper Turbo**: LiveKit audio stream capture to server-side `/stt` endpoint is planned for Phase P5.
- **STUB: Interactive Mermaid Diagram Rendering**: The `show_diagram` tool is validated in P3; direct rendering of Mermaid charts into a visual canvas panel is slated for Phase P4.
- **STUB: "Split Work" Code Ownership Assignment**: AST parsing is functional; interactive ownership toggling and visual border coloring in Monaco are slated for Phase P4.

