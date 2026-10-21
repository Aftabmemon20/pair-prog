from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Response

from apps.api.logger import get_logger
from apps.api.services.recap import (
    generate_session_recap,
    get_session_recap,
    SessionRecap,
)

logger = get_logger("routers.recap")

router = APIRouter(prefix="/rooms/{room_id}/recap", tags=["Session Recaps"])


@router.post("", response_model=SessionRecap)
async def create_recap(room_id: str):
    """
    Synthesizes and finalizes a structured session recap for the room.
    Persists to Supabase and broadcasts to room timeline.
    """
    try:
        return await generate_session_recap(room_id)
    except Exception as e:
        logger.exception(f"Error generating recap for room {room_id}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to generate recap: {str(e)}")


@router.get("", response_model=SessionRecap)
async def get_recap(room_id: str):
    """Retrieves the latest session recap for the room."""
    recap = await get_session_recap(room_id)
    if not recap:
        # If no recap generated yet, auto-generate it
        recap = await generate_session_recap(room_id)
    return recap


@router.get("/markdown")
async def get_recap_markdown(room_id: str):
    """
    Returns the session recap formatted as ready-to-paste Markdown
    for PR descriptions, Slack, or Jira.
    """
    recap = await get_session_recap(room_id)
    if not recap:
        recap = await generate_session_recap(room_id)

    lines = [
        f"# Pairio-Lite Session Recap: Room `{recap.session_id}`",
        "",
        f"**Summary**: {recap.summary}",
        "",
        "## Key Decisions",
    ]
    for d in recap.decisions:
        lines.append(f"- {d}")

    lines.append("")
    lines.append("## Code Ownership")
    lines.append("| Symbol | Owner | Status |")
    lines.append("|---|---|---|")
    for o in recap.ownership_summary:
        lines.append(f"| `{o.symbol}` | **{o.owner}** | {o.status} |")

    if recap.bugs_identified:
        lines.append("")
        lines.append("## Bugs Identified & Resolved")
        for b in recap.bugs_identified:
            lines.append(f"- **`{b.symbol}`** ({b.error_type}): {b.error_message}")
            if b.resolution:
                lines.append(f"  - *Resolution*: {b.resolution}")

    lines.append("")
    lines.append("## Next Steps")
    for s in recap.next_steps:
        lines.append(f"- [ ] {s}")

    lines.append("")
    lines.append("---")
    lines.append("*Facilitated by Pair Master (Seat 3 AI)*")

    md_content = "\n".join(lines)
    return Response(content=md_content, media_type="text/markdown")
