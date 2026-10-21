import time
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from apps.api.config import settings
from apps.api.logger import get_logger
from apps.api.services.parser import list_symbols, parse_traceback, SymbolInfo, StructuredTraceback
from apps.api.services.yjs_manager import yjs_manager

logger = get_logger("routers.symbols")

router = APIRouter(prefix="/rooms/{room_id}", tags=["Symbols & Execution"])

# In-memory store for room events (replicated to Supabase if configured)
ROOM_EVENTS: Dict[str, List[Dict[str, Any]]] = {}


class ParseTracebackRequest(BaseModel):
    traceback: str


class RunEventRequest(BaseModel):
    actor: str
    stdout: str = ""
    stderr: str = ""
    exit_code: int = 0
    execution_time_ms: float = 0.0
    traceback: Optional[StructuredTraceback] = None
    idempotency_key: str = Field(default_factory=lambda: f"run_{uuid.uuid4().hex}")


@router.get("/symbols", response_model=List[SymbolInfo])
async def get_symbols(room_id: str):
    """
    Extracts all functions, classes, and methods with exact line ranges
    directly from the live synchronized Yjs document.
    """
    room = await yjs_manager.get_or_init_room(room_id)
    import pycrdt
    code_text = str(room.ydoc.get("monaco", type=pycrdt.Text))
    return list_symbols(code_text)


@router.post("/parse-traceback", response_model=StructuredTraceback)
async def api_parse_traceback(room_id: str, req: ParseTracebackRequest):
    """Parses raw Python stderr/traceback into structured frames and error metadata."""
    return parse_traceback(req.traceback)


@router.post("/run-event")
async def record_run_event(room_id: str, event: RunEventRequest):
    """
    Broadcasts and records a code execution result in the room's append-only event stream.
    Includes stdout, stderr, execution time, and parsed traceback.
    """
    event_dict = {
        "id": event.idempotency_key,
        "session_id": room_id,
        "ts": time.time(),
        "actor": event.actor,
        "type": "run_result",
        "payload": {
            "stdout": event.stdout,
            "stderr": event.stderr,
            "exit_code": event.exit_code,
            "execution_time_ms": event.execution_time_ms,
            "traceback": event.traceback.model_dump() if event.traceback else None,
        },
        "idempotency_key": event.idempotency_key,
    }

    if room_id not in ROOM_EVENTS:
        ROOM_EVENTS[room_id] = []

    # Check idempotency
    existing = next((e for e in ROOM_EVENTS[room_id] if e["idempotency_key"] == event.idempotency_key), None)
    if not existing:
        ROOM_EVENTS[room_id].append(event_dict)

    # Persist to Supabase if configured
    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {
                "apikey": settings.SUPABASE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=ignore-duplicates",
            }
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(f"{settings.SUPABASE_URL}/rest/v1/events", json=event_dict, headers=headers)
        except Exception as e:
            logger.warning(f"Failed to persist event to Supabase: {e}")

    return {"status": "recorded", "event_id": event.idempotency_key}


@router.get("/events")
async def get_room_events(room_id: str, limit: int = 50):
    """Fetches chronological audit events for timeline and output synchronization."""
    events = ROOM_EVENTS.get(room_id, [])
    return events[-limit:]
