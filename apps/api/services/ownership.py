import time
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from apps.api.config import settings
from apps.api.logger import get_logger
from apps.api.services.parser import list_symbols, resolve_ownership, ResolvedOwnership
from apps.api.routers.symbols import ROOM_EVENTS

logger = get_logger("services.ownership")

# In-memory ownership store: room_id -> list of raw assignments
# [{ "symbol": "apply_discount", "owner": "Dev B", "reason": "...", "status": "accepted" }]
IN_MEMORY_OWNERSHIP: Dict[str, List[Dict[str, Any]]] = {}


class OwnershipAssignment(BaseModel):
    symbol: str
    owner: str # "Dev A" or "Dev B"
    reason: Optional[str] = None
    status: str = "accepted"


async def get_room_ownership(room_id: str, current_code: Optional[str] = None) -> List[ResolvedOwnership]:
    """Retrieves current ownership assignments resolved against latest code AST."""
    raw_assignments = IN_MEMORY_OWNERSHIP.get(room_id, [])

    # If Supabase is configured, try querying it
    if not raw_assignments and settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {"apikey": settings.SUPABASE_KEY, "Authorization": f"Bearer {settings.SUPABASE_KEY}"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(
                    f"{settings.SUPABASE_URL}/rest/v1/ownership?session_id=eq.{room_id}",
                    headers=headers
                )
                if res.status_code == 200:
                    raw_assignments = res.json()
                    IN_MEMORY_OWNERSHIP[room_id] = raw_assignments
        except Exception as e:
            logger.warning(f"Could not load ownership from Supabase for room {room_id}: {e}")

    code = current_code or ""
    return resolve_ownership(code, raw_assignments)


async def save_room_ownership(room_id: str, assignments: List[Dict[str, Any]]) -> None:
    """Persists ownership assignments to memory and Supabase."""
    IN_MEMORY_OWNERSHIP[room_id] = assignments

    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {
                "apikey": settings.SUPABASE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            }
            rows = [
                {
                    "session_id": room_id,
                    "symbol": a["symbol"],
                    "owner": a["owner"],
                    "reason": a.get("reason") or a.get("rationale") or "",
                    "status": a.get("status", "accepted"),
                }
                for a in assignments
            ]
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(f"{settings.SUPABASE_URL}/rest/v1/ownership", json=rows, headers=headers)
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not persist ownership to Supabase: {e}")


async def auto_split_ownership(room_id: str, code: str) -> List[ResolvedOwnership]:
    """
    Partitions Python AST symbols between Dev A (Host) and Dev B (Peer).
    Creates an ownership_split event on the room timeline.
    """
    symbols = list_symbols(code)
    func_symbols = [s for s in symbols if s.kind in ("function", "method")]

    assignments: List[Dict[str, Any]] = []

    for idx, sym in enumerate(func_symbols):
        # Alternate functions or balance logically
        owner = "Dev A" if idx % 2 == 0 else "Dev B"
        rationale = f"Partitioned for {owner} ({sym.kind} '{sym.name}')"
        assignments.append({
            "symbol": sym.name,
            "owner": owner,
            "reason": rationale,
            "status": "accepted",
        })

    await save_room_ownership(room_id, assignments)

    # Broadcast timeline event
    if room_id not in ROOM_EVENTS:
        ROOM_EVENTS[room_id] = []

    summary_text = ", ".join([f"{a['symbol']} → {a['owner']}" for a in assignments])
    split_event = {
        "id": f"split_{uuid.uuid4().hex[:8]}",
        "session_id": room_id,
        "ts": time.time(),
        "actor": "Pair Master",
        "type": "ownership_split",
        "payload": {
            "summary": f"Split work across {len(assignments)} functions: {summary_text}",
            "assignments": assignments,
        },
        "idempotency_key": f"split_evt_{uuid.uuid4().hex[:8]}",
    }
    ROOM_EVENTS[room_id].append(split_event)

    return resolve_ownership(code, assignments)
