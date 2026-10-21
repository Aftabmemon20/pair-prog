import asyncio
import time
import uuid
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from apps.api.config import settings
from apps.api.logger import get_logger
from apps.api.agent.graph import pair_master_graph
from apps.api.routers.symbols import ROOM_EVENTS

logger = get_logger("routers.agent")

router = APIRouter(prefix="/rooms/{room_id}/agent", tags=["Pair Master Agent"])


class AskAgentRequest(BaseModel):
    prompt: str = Field(..., min_length=1, max_length=1000)
    actor: str = "Dev A"


class AskAgentResponse(BaseModel):
    response: str
    tool_events: List[Dict[str, Any]] = Field(default_factory=list)
    session_id: str


@router.post("/ask", response_model=AskAgentResponse)
async def ask_pair_master(room_id: str, req: AskAgentRequest):
    """
    Submits a prompt or question to the Pair Master AI facilitator.
    Orchestrated by LangGraph state machine with typed tools and untrusted data defense.
    """
    if room_id not in ROOM_EVENTS:
        ROOM_EVENTS[room_id] = []

    # 1. Record User Message in Timeline
    user_event_id = f"user_msg_{uuid.uuid4().hex[:8]}"
    user_event = {
        "id": user_event_id,
        "session_id": room_id,
        "ts": time.time(),
        "actor": req.actor,
        "type": "user_message",
        "payload": {"text": req.prompt},
        "idempotency_key": user_event_id,
    }
    ROOM_EVENTS[room_id].append(user_event)

    # 2. Invoke LangGraph with 40s turn timeout
    initial_state = {
        "room_id": room_id,
        "user_prompt": req.prompt,
        "actor": req.actor,
        "trigger_type": "user_ask",
        "messages": [],
        "tool_call_count": 0,
        "tool_events": [],
        "final_response": None,
        "status": "starting",
    }

    try:
        final_state = await asyncio.wait_for(
            pair_master_graph.ainvoke(initial_state),
            timeout=40.0,
        )
    except asyncio.TimeoutError:
        logger.error(f"Agent turn timed out after 40 seconds in room {room_id}")
        timeout_msg = "Agent request timed out after 40 seconds. Please try a simpler question."
        timeout_event = {
            "id": f"agent_err_{uuid.uuid4().hex[:8]}",
            "session_id": room_id,
            "ts": time.time(),
            "actor": "Pair Master",
            "type": "agent_error",
            "payload": {"message": timeout_msg},
            "idempotency_key": f"err_{uuid.uuid4().hex[:8]}",
        }
        ROOM_EVENTS[room_id].append(timeout_event)
        return AskAgentResponse(
            response=timeout_msg,
            tool_events=[],
            session_id=room_id,
        )
    except Exception as e:
        logger.exception(f"Agent execution error: {e}")
        err_msg = f"I encountered an unexpected issue: {str(e)}"
        return AskAgentResponse(
            response=err_msg,
            tool_events=[],
            session_id=room_id,
        )

    return AskAgentResponse(
        response=final_state.get("final_response") or "Analysis completed.",
        tool_events=final_state.get("tool_events", []),
        session_id=room_id,
    )


@router.get("/timeline")
async def get_timeline(room_id: str, limit: int = 100):
    """Returns chronological session timeline events for the room."""
    events = ROOM_EVENTS.get(room_id, [])
    return {
        "room_id": room_id,
        "count": len(events),
        "events": events[-limit:],
    }
