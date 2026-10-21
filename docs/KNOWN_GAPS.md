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

## 3. Active Stubs & Current Phase
- **Recap Feature**: Fully implemented in Phase P6 (Pydantic schema, Rule 6 repair retry, Supabase persistence, Markdown export, and frontend modal).
- **Phase P7 Scope**: End-to-end multi-seat validation tests (Playwright two-browser contexts) and final live demo script testing (`demo/inventory.py` and `demo/SCRIPT.md`).



