# Runbook & Operations Guide — Pairio-Lite

This runbook guides development, deployment, pre-flight checks, and emergency troubleshooting for Pairio-Lite.

---

## 1. Local Development Setup

### Prerequisites
- Python 3.12+ (`py` or `python`)
- Node.js 20+ (`node`, `npm`)
- Free service credentials (see `.env.example`)

### Quick Start
1. Copy `.env.example` to `.env` and fill in API keys:
   ```bash
   cp .env.example .env
   ```
2. Verify services:
   ```bash
   python scripts/check_services.py
   ```
3. Start Backend:
   ```bash
   cd apps/api
   pip install -r requirements.txt
   uvicorn main:app --reload --port 8000
   ```
4. Start Frontend:
   ```bash
   cd apps/web
   npm install
   npm run dev
   ```

---

## 2. Emergency Troubleshooting ("What to do when things break")

| Symptom | Probable Cause | Action |
|---|---|---|
| **`/healthz` returns 503 / DB error** | Supabase project paused due to inactivity | Open Supabase dashboard, unpause project, run keep-alive query. |
| **API cold start delay (~60s)** | Render free tier instance spun down | Keep-warm cron or ping `/healthz` 5 minutes prior to demo. |
| **Groq 429 Rate Limit** | TPM/RPM limit hit on primary model | Fallback to `gpt-oss-20b` activates automatically; check remaining quotas in `scripts/check_services.py`. |
| **WebRTC Media not connecting** | LiveKit credentials invalid or exhausted quota | Confirm `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` in `.env`. Web editor & agent continue functioning even if media is offline. |
| **Monaco CRDT sync fails** | WebSocket disconnect | Client auto-reconnects with exponential backoff and resyncs from Supabase snapshot. |

---

## 3. Demo Pre-Flight Protocol (10 Minutes Prior to Demo)
1. Run `python scripts/check_services.py` to confirm all 3 services respond green.
2. Curl `https://<api-domain>/healthz` to ensure Render is warm.
3. Open two clean browser profiles (e.g. Chrome + Chrome Incognito / Firefox).
4. Create test room `/r/demo-preflight`, type two lines, verify live cursors.
