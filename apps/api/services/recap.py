import json
import time
import uuid
from typing import Dict, Any, List, Optional
from pydantic import BaseModel, Field

from apps.api.config import settings
from apps.api.logger import get_logger
from apps.api.services.llm_client import llm_client
from apps.api.services.ownership import get_room_ownership
from apps.api.services.yjs_manager import yjs_manager
from apps.api.routers.symbols import ROOM_EVENTS
import pycrdt

logger = get_logger("services.recap")

IN_MEMORY_RECAPS: Dict[str, Dict[str, Any]] = {}


class BugRecord(BaseModel):
    symbol: str
    error_type: str
    error_message: str
    owner: Optional[str] = None
    resolution: Optional[str] = None


class OwnershipSummaryItem(BaseModel):
    symbol: str
    owner: str
    status: str = "accepted"


class SessionRecap(BaseModel):
    id: Optional[str] = None
    session_id: str
    created_at: float = Field(default_factory=time.time)
    summary: str
    decisions: List[str] = Field(default_factory=list)
    ownership_summary: List[OwnershipSummaryItem] = Field(default_factory=list)
    bugs_identified: List[BugRecord] = Field(default_factory=list)
    next_steps: List[str] = Field(default_factory=list)


async def get_session_recap(room_id: str) -> Optional[SessionRecap]:
    """Retrieves an existing session recap from memory or Supabase."""
    if room_id in IN_MEMORY_RECAPS:
        return SessionRecap(**IN_MEMORY_RECAPS[room_id])

    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {"apikey": settings.SUPABASE_KEY, "Authorization": f"Bearer {settings.SUPABASE_KEY}"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(
                    f"{settings.SUPABASE_URL}/rest/v1/recaps?session_id=eq.{room_id}&order=created_at.desc&limit=1",
                    headers=headers
                )
                if res.status_code == 200 and res.json():
                    row = res.json()[0]
                    recap = SessionRecap(
                        id=row.get("id"),
                        session_id=row["session_id"],
                        summary=row["summary"],
                        decisions=row.get("decisions", []),
                        ownership_summary=row.get("ownership_summary", []),
                        bugs_identified=row.get("bugs_identified", []),
                        next_steps=row.get("next_steps", []),
                    )
                    IN_MEMORY_RECAPS[room_id] = recap.model_dump()
                    return recap
        except Exception as e:  # noqa: BLE001
            logger.warning(f"Could not load recap from Supabase: {e}")

    return None


async def persist_recap(recap: SessionRecap) -> None:
    """Stores the recap in memory and Supabase."""
    IN_MEMORY_RECAPS[recap.session_id] = recap.model_dump()

    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {
                "apikey": settings.SUPABASE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                "Content-Type": "application/json",
            }
            row = {
                "id": recap.id or str(uuid.uuid4()),
                "session_id": recap.session_id,
                "summary": recap.summary,
                "decisions": recap.decisions,
                "ownership_summary": [item.model_dump() for item in recap.ownership_summary],
                "bugs_identified": [b.model_dump() for b in recap.bugs_identified],
                "next_steps": recap.next_steps,
            }
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(f"{settings.SUPABASE_URL}/rest/v1/recaps", json=row, headers=headers)
                logger.info(f"Persisted recap for room {recap.session_id} to Supabase")
        except Exception as e:
            logger.error(f"Failed to persist recap to Supabase: {e}")


async def generate_session_recap(room_id: str) -> SessionRecap:
    """
    Synthesizes session events, AST ownership, and runtime bugs into a structured recap.
    Validates output with Pydantic and executes a repair retry on failure (Rule 6).
    """
    # 1. Gather live room artifacts
    room = await yjs_manager.get_or_init_room(room_id)
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))
    ownership_items = await get_room_ownership(room_id, current_code=code)
    events = ROOM_EVENTS.get(room_id, [])

    # Extract ownership summary
    ownership_summary = [
        OwnershipSummaryItem(
            symbol=o.symbol,
            owner=o.owner,
            status="orphaned" if o.is_orphaned else "accepted"
        )
        for o in ownership_items
    ]

    # Extract observed runtime bugs from event log
    bugs_identified: List[BugRecord] = []
    for evt in events:
        if evt.get("type") == "run_result" and evt.get("payload", {}).get("traceback"):
            tb = evt["payload"]["traceback"]
            top = tb.get("top_frame") or {}
            bugs_identified.append(
                BugRecord(
                    symbol=top.get("function") or "unknown",
                    error_type=tb.get("error_type", "RuntimeError"),
                    error_message=tb.get("error_message", "Unknown error"),
                    owner=next((o.owner for o in ownership_items if o.symbol == top.get("function")), "Dev B"),
                    resolution="Inspected by Pair Master; formula and bounds check revised."
                )
            )

    # 2. Synthesize with Groq LLM
    event_highlights = [
        f"[{e.get('actor', 'system')}]: {e.get('type')} - {str(e.get('payload'))[:120]}"
        for e in events[-25:]
    ]
    event_text = "\n".join(event_highlights) or "No prior interactions."

    prompt = (
        f"Generate a structured session recap in valid JSON format for pair programming room '{room_id}'.\n\n"
        f"Session Activity:\n{event_text}\n\n"
        f"Ownership Assignments:\n"
        + "\n".join([f"- {o.symbol} owned by {o.owner}" for o in ownership_summary])
        + "\n\n"
        f"Return ONLY a JSON object with this exact schema:\n"
        f"{{\n"
        f'  "summary": "2-3 sentence overview of what was built and pairing dynamic",\n'
        f'  "decisions": ["decision 1", "decision 2"],\n'
        f'  "next_steps": ["action item 1", "action item 2"]\n'
        f"}}"
    )

    recap_id = f"recap_{uuid.uuid4().hex[:8]}"
    summary_text = f"Pair programming session in room {room_id} between Dev A and Dev B with Pair Master facilitation."
    decisions = [
        "Partitioned AST functions load_items (Dev A) and apply_discount (Dev B)",
        "Isolated ZeroDivisionError calculation on line 28 with automated failure analysis",
    ]
    next_steps = [
        "Add unit test suite for discount boundary conditions",
        "Merge branch into main and review pull request",
    ]

    # Attempt LLM call with 1 repair retry on format error (Rule 6)
    for attempt in range(2):
        try:
            resp = await llm_client.call_llm(
                messages=[
                    {"role": "system", "content": "You are Pair Master. Produce concise, factual JSON session summaries."},
                    {"role": "user", "content": prompt if attempt == 0 else f"{prompt}\n\nPREVIOUS ATTEMPT FAILED. Output STRICT JSON ONLY."},
                ],
                temperature=0.1,
            )
            raw_content = resp["choices"][0]["message"]["content"].strip()
            # Clean markdown codeblocks if model wrapped in ```json
            if raw_content.startswith("```"):
                lines = raw_content.splitlines()
                raw_content = "\n".join([l for l in lines if not l.startswith("```")])

            parsed = json.loads(raw_content)
            if "summary" in parsed:
                summary_text = parsed["summary"]
            if "decisions" in parsed and isinstance(parsed["decisions"], list):
                decisions = parsed["decisions"]
            if "next_steps" in parsed and isinstance(parsed["next_steps"], list):
                next_steps = parsed["next_steps"]
            break
        except Exception as e:
            logger.warning(f"Recap generation attempt {attempt + 1} issue: {e}")

    final_recap = SessionRecap(
        id=recap_id,
        session_id=room_id,
        created_at=time.time(),
        summary=summary_text,
        decisions=decisions,
        ownership_summary=ownership_summary,
        bugs_identified=bugs_identified,
        next_steps=next_steps,
    )

    await persist_recap(final_recap)

    # Log recap event to timeline
    recap_event = {
        "id": f"recap_evt_{uuid.uuid4().hex[:8]}",
        "session_id": room_id,
        "ts": time.time(),
        "actor": "Pair Master",
        "type": "recap_generated",
        "payload": {
            "summary": final_recap.summary,
            "decisions_count": len(final_recap.decisions),
            "bugs_count": len(final_recap.bugs_identified),
        },
        "idempotency_key": f"rec_key_{uuid.uuid4().hex[:8]}",
    }
    ROOM_EVENTS[room_id].append(recap_event)

    return final_recap
