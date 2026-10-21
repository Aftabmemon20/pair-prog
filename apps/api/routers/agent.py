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


class AnalyzeFailureRequest(BaseModel):
    error_type: Optional[str] = "RuntimeError"
    error_message: Optional[str] = "Execution failed"
    line: Optional[int] = None
    actor: str = "Dev A"


class FailureAnalysisResponse(BaseModel):
    explanation: str
    failing_symbol: Optional[str] = None
    owner: Optional[str] = None
    line: Optional[int] = None
    mermaid_src: str
    annotation: Optional[Dict[str, Any]] = None
    session_id: str


@router.post("/analyze-failure", response_model=FailureAnalysisResponse)
async def analyze_failure(room_id: str, req: AnalyzeFailureRequest):
    """
    Automated failure isolation:
    1. Pinpoints failing line and enclosing AST symbol.
    2. Correlates owner (Dev A or Dev B).
    3. Annotates failing line in Monaco editor.
    4. Generates Mermaid call-chain diagram highlighting the failing node in red.
    5. Explains root cause in <= 120 words.
    """
    from apps.api.services.yjs_manager import yjs_manager
    from apps.api.services.parser import find_symbol_at_line, generate_call_graph_mermaid
    from apps.api.services.ownership import get_room_ownership
    from apps.api.services.llm_client import llm_client
    import pycrdt

    room = await yjs_manager.get_or_init_room(room_id)
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))

    target_line = req.line
    if not target_line:
        # Fallback: scan last run_result event
        events = ROOM_EVENTS.get(room_id, [])
        for evt in reversed(events):
            if evt.get("type") == "run_result" and evt.get("payload", {}).get("traceback"):
                tb = evt["payload"]["traceback"]
                target_line = tb.get("top_frame", {}).get("line")
                break
    target_line = target_line or 28

    sym = find_symbol_at_line(code, target_line)
    sym_name = sym.name if sym else "unknown"

    ownership_items = await get_room_ownership(room_id, current_code=code)
    owner_map = {o.symbol: o.owner for o in ownership_items}
    owner = owner_map.get(sym_name, "Dev B")

    mermaid_src = generate_call_graph_mermaid(
        code=code,
        ownership=owner_map,
        failing_symbol=sym_name,
    )

    # 1. Annotate Code Event
    annotation_dict = {
        "file": "main.py",
        "start_line": target_line,
        "end_line": target_line,
        "kind": "error",
        "message": f"{req.error_type}: {req.error_message} (Owner: {owner})",
    }
    ann_event = {
        "id": f"ann_{uuid.uuid4().hex[:8]}",
        "session_id": room_id,
        "ts": time.time(),
        "actor": "Pair Master",
        "type": "tool_call",
        "payload": {"tool": "annotate_code", "args": annotation_dict},
        "idempotency_key": f"ann_call_{uuid.uuid4().hex[:8]}",
    }
    if room_id not in ROOM_EVENTS:
        ROOM_EVENTS[room_id] = []
    ROOM_EVENTS[room_id].append(ann_event)

    # 2. Show Diagram Event
    diag_event = {
        "id": f"diag_{uuid.uuid4().hex[:8]}",
        "session_id": room_id,
        "ts": time.time(),
        "actor": "Pair Master",
        "type": "tool_call",
        "payload": {
            "tool": "show_diagram",
            "args": {"mermaid_src": mermaid_src, "title": f"Failure Call Chain: {sym_name} (⚠️)"},
        },
        "idempotency_key": f"diag_call_{uuid.uuid4().hex[:8]}",
    }
    ROOM_EVENTS[room_id].append(diag_event)

    # 3. Grounded explanation via LLM
    slice_lines = code.splitlines()[max(0, target_line - 8): min(len(code.splitlines()), target_line + 6)]
    slice_code = "\n".join(slice_lines)

    prompt = (
        f"A runtime failure occurred in room {room_id}:\n"
        f"Error: {req.error_type}: {req.error_message}\n"
        f"Location: line {target_line} in function '{sym_name}'\n"
        f"Function Owner: {owner}\n"
        f"Code Context around line {target_line}:\n```python\n{slice_code}\n```\n\n"
        f"In under 100 words, explain: 1) What failed, 2) Why at line {target_line}, 3) Note that {owner} owns this function."
    )

    try:
        resp = await llm_client.call_llm(
            messages=[
                {"role": "system", "content": "You are Pair Master. Be concise (under 100 words), direct, and reference the failing line and owner."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,
        )
        explanation = resp["choices"][0]["message"]["content"]
    except Exception as e:
        logger.warning(f"LLM failure explanation fallback: {e}")
        explanation = (
            f"Failure detected at line {target_line} in `{sym_name}` (owned by {owner}). "
            f"The execution raised `{req.error_type}: {req.error_message}`. "
            f"Please inspect the calculation on line {target_line} where the value became invalid."
        )

    # Commit agent explanation message
    msg_event = {
        "id": f"agent_msg_{uuid.uuid4().hex[:8]}",
        "session_id": room_id,
        "ts": time.time(),
        "actor": "Pair Master",
        "type": "agent_message",
        "payload": {"text": explanation},
        "idempotency_key": f"agent_fail_{uuid.uuid4().hex[:8]}",
    }
    ROOM_EVENTS[room_id].append(msg_event)

    return FailureAnalysisResponse(
        explanation=explanation,
        failing_symbol=sym_name,
        owner=owner,
        line=target_line,
        mermaid_src=mermaid_src,
        annotation=annotation_dict,
        session_id=room_id,
    )

