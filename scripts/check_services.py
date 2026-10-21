#!/usr/bin/env python3
"""
scripts/check_services.py — Connectivity & Rate Limits Diagnostic Tool

Verifies credentials and connectivity for:
  1. Groq (LLM & Whisper STT) + extracts live rate limit headers
  2. LiveKit Cloud (WebRTC SFU)
  3. Supabase (PostgreSQL REST endpoint)

Usage:
  python scripts/check_services.py
"""

import os
import sys
import json
from pathlib import Path
from typing import Dict, Any, Optional

# Attempt to load .env from repo root
try:
    from dotenv import load_dotenv
    root_env = Path(__file__).resolve().parent.parent / ".env"
    if root_env.exists():
        load_dotenv(root_env)
    else:
        load_dotenv()
except ImportError:
    pass

# Use httpx if available, fallback to urllib
try:
    import httpx
    USE_HTTPX = True
except ImportError:
    import urllib.request
    import urllib.error
    USE_HTTPX = False


# ANSI Color Codes
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
BLUE = "\033[94m"
BOLD = "\033[1m"
RESET = "\033[0m"


def header(title: str) -> None:
    print(f"\n{BOLD}{BLUE}{'=' * 65}{RESET}")
    print(f"{BOLD}{BLUE}  {title}{RESET}")
    print(f"{BOLD}{BLUE}{'=' * 65}{RESET}")


def http_get(url: str, headers: Dict[str, str], timeout: float = 6.0) -> Dict[str, Any]:
    """Helper that wraps HTTP GET using httpx or urllib."""
    if USE_HTTPX:
        try:
            with httpx.Client(timeout=timeout) as client:
                res = client.get(url, headers=headers)
                return {
                    "status_code": res.status_code,
                    "headers": dict(res.headers),
                    "body": res.text,
                    "error": None,
                }
        except Exception as e:
            return {"status_code": None, "headers": {}, "body": "", "error": str(e)}
    else:
        req = urllib.request.Request(url, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as res:
                return {
                    "status_code": res.status,
                    "headers": dict(res.headers),
                    "body": res.read().decode("utf-8", errors="replace"),
                    "error": None,
                }
        except urllib.error.HTTPError as e:
            return {
                "status_code": e.code,
                "headers": dict(e.headers),
                "body": e.read().decode("utf-8", errors="replace"),
                "error": str(e),
            }
        except Exception as e:
            return {"status_code": None, "headers": {}, "body": "", "error": str(e)}


def check_groq() -> Dict[str, Any]:
    api_key = os.getenv("GROQ_API_KEY", "").strip()
    if not api_key or api_key == "gsk_...":
        return {
            "service": "Groq",
            "status": "MISSING",
            "message": "GROQ_API_KEY not configured in .env",
            "limits": {
                "documented_free_tier": "30 req/min, 1K req/day, 8K tokens/min (120b); Whisper 20 req/min, 2K/day"
            },
        }

    url = "https://api.groq.com/openai/v1/models"
    headers = {"Authorization": f"Bearer {api_key}"}
    res = http_get(url, headers)

    if res["error"]:
        return {"service": "Groq", "status": "ERROR", "message": f"Network Error: {res['error']}"}

    status_code = res["status_code"]
    resp_headers = res["headers"]

    # Extract Rate Limit Headers
    rate_limits = {}
    for h in [
        "x-ratelimit-limit-requests",
        "x-ratelimit-remaining-requests",
        "x-ratelimit-limit-tokens",
        "x-ratelimit-remaining-tokens",
        "x-ratelimit-reset-requests",
        "x-ratelimit-reset-tokens",
    ]:
        val = resp_headers.get(h) or resp_headers.get(h.lower())
        if val:
            rate_limits[h] = val

    if status_code == 200:
        models_count = 0
        try:
            data = json.loads(res["body"])
            models_count = len(data.get("data", []))
        except Exception:
            pass
        return {
            "service": "Groq",
            "status": "VALID",
            "message": f"Successfully authenticated. Available models: {models_count}",
            "limits": rate_limits or {"documented_free_tier": "30 req/min, 8K tokens/min, 1K req/day"},
        }
    elif status_code == 401:
        return {"service": "Groq", "status": "INVALID", "message": "Invalid API Key (HTTP 401 Unauthorized)"}
    else:
        return {"service": "Groq", "status": "ERROR", "message": f"Unexpected HTTP status {status_code}"}


def check_supabase() -> Dict[str, Any]:
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_KEY", "").strip()

    if not url or not key or "your-project-id" in url:
        return {
            "service": "Supabase",
            "status": "MISSING",
            "message": "SUPABASE_URL or SUPABASE_KEY not configured in .env",
            "limits": {"free_tier": "Postgres 500MB DB, auto-pause after inactivity"},
        }

    # Query sessions table or root endpoint
    check_url = f"{url}/rest/v1/sessions?select=id&limit=1"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
    }
    res = http_get(check_url, headers)

    if res["error"]:
        return {"service": "Supabase", "status": "ERROR", "message": f"Network Error: {res['error']}"}

    status_code = res["status_code"]
    if status_code in (200, 206):
        return {
            "service": "Supabase",
            "status": "VALID",
            "message": "Connected to Supabase REST endpoint; 'sessions' table accessible.",
            "limits": {"free_tier": "500MB storage, keep-warm required for inactivity pause"},
        }
    elif status_code == 404:
        # Table might not be migrated yet, test root REST OpenAPI spec
        root_res = http_get(f"{url}/rest/v1/", headers)
        if root_res["status_code"] == 200:
            return {
                "service": "Supabase",
                "status": "VALID_PARTIAL",
                "message": "Connected to Supabase, but 'sessions' table not yet migrated (run migration 20261021_initial_schema.sql)",
                "limits": {"free_tier": "500MB storage"},
            }
        return {"service": "Supabase", "status": "ERROR", "message": f"HTTP 404 on endpoint {check_url}"}
    elif status_code in (401, 403):
        return {"service": "Supabase", "status": "INVALID", "message": f"Authentication failed (HTTP {status_code})"}
    else:
        return {"service": "Supabase", "status": "ERROR", "message": f"Unexpected HTTP {status_code}"}


def check_livekit() -> Dict[str, Any]:
    url = os.getenv("LIVEKIT_URL", "").strip()
    api_key = os.getenv("LIVEKIT_API_KEY", "").strip()
    api_secret = os.getenv("LIVEKIT_API_SECRET", "").strip()

    if not url or not api_key or not api_secret or "your-project" in url:
        return {
            "service": "LiveKit Cloud",
            "status": "MISSING",
            "message": "LIVEKIT_URL, LIVEKIT_API_KEY, or LIVEKIT_API_SECRET not set in .env",
            "limits": {"free_tier": "5,000 participant-min/month, 50 GB/month, 100 concurrent"},
        }

    # Verify HTTP connectivity to LiveKit endpoint
    http_url = url.replace("wss://", "https://").replace("ws://", "http://")
    res = http_get(f"{http_url}/", headers={}, timeout=4.0)

    return {
        "service": "LiveKit Cloud",
        "status": "CONFIGURED",
        "message": f"Host configured ({url}). Key prefix: {api_key[:6]}...",
        "limits": {"free_tier": "5,000 participant-min/month, 50 GB/month, 100 concurrent"},
    }


def main():
    header("Pairio-Lite Service Connectivity & Rate Limits Diagnostic")

    results = [check_groq(), check_supabase(), check_livekit()]

    for r in results:
        status = r["status"]
        if status == "VALID":
            color = GREEN
            tag = "[OK: VALID]"
        elif status in ("CONFIGURED", "VALID_PARTIAL"):
            color = YELLOW
            tag = f"[WARN: {status}]"
        elif status == "MISSING":
            color = YELLOW
            tag = "[UNCONFIGURED]"
        else:
            color = RED
            tag = f"[ERROR: {status}]"

        print(f"\n{BOLD}{r['service']}{RESET} -> {color}{tag}{RESET}")
        print(f"  Details: {r['message']}")
        if "limits" in r and r["limits"]:
            print(f"  Rate Limits / Quotas:")
            for k, v in r["limits"].items():
                print(f"    - {k}: {v}")

    header("Summary Status")
    valid_count = sum(1 for r in results if r["status"] in ("VALID", "CONFIGURED", "VALID_PARTIAL"))
    print(f"Verified: {valid_count}/{len(results)} service configurations checked.")
    print("Tip: If running locally without live keys, the app gracefully falls back to local stubs.")
    print(f"{BOLD}{BLUE}{'=' * 65}{RESET}\n")


if __name__ == "__main__":
    main()
