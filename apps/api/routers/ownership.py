import pycrdt
from typing import Dict, Any, List, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from apps.api.logger import get_logger
from apps.api.services.yjs_manager import yjs_manager
from apps.api.services.ownership import (
    get_room_ownership,
    save_room_ownership,
    auto_split_ownership,
    OwnershipAssignment,
)
from apps.api.services.parser import generate_call_graph_mermaid, ResolvedOwnership

logger = get_logger("routers.ownership")

router = APIRouter(prefix="/rooms/{room_id}", tags=["Ownership & Diagrams"])


class AssignOwnerRequest(BaseModel):
    symbol: str
    owner: str # "Dev A" or "Dev B"
    reason: Optional[str] = None


class DiagramResponse(BaseModel):
    room_id: str
    mermaid_src: str
    failing_symbol: Optional[str] = None
    ownership: Dict[str, str] = Field(default_factory=dict)


@router.get("/ownership", response_model=List[ResolvedOwnership])
async def get_ownership(room_id: str):
    """Returns resolved ownership assignments for the room's live code."""
    room = await yjs_manager.get_or_init_room(room_id)
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))
    return await get_room_ownership(room_id, current_code=code)


@router.post("/ownership/split", response_model=List[ResolvedOwnership])
async def split_ownership(room_id: str):
    """Partitions code ownership across AST functions between Dev A and Dev B."""
    room = await yjs_manager.get_or_init_room(room_id)
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))
    return await auto_split_ownership(room_id, code=code)


@router.post("/ownership/assign", response_model=List[ResolvedOwnership])
async def assign_owner(room_id: str, req: AssignOwnerRequest):
    """Manually assigns or toggles a symbol's owner."""
    room = await yjs_manager.get_or_init_room(room_id)
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))

    existing = await get_room_ownership(room_id, current_code=code)
    raw_list = [
        {"symbol": o.symbol, "owner": o.owner, "reason": o.reason, "status": "accepted"}
        for o in existing
    ]

    found = False
    for item in raw_list:
        if item["symbol"] == req.symbol:
            item["owner"] = req.owner
            if req.reason:
                item["reason"] = req.reason
            found = True
            break

    if not found:
        raw_list.append({
            "symbol": req.symbol,
            "owner": req.owner,
            "reason": req.reason or f"Manually assigned to {req.owner}",
            "status": "accepted",
        })

    await save_room_ownership(room_id, raw_list)
    return await get_room_ownership(room_id, current_code=code)


@router.get("/diagram", response_model=DiagramResponse)
async def get_room_diagram(room_id: str, failing_symbol: Optional[str] = None):
    """
    Generates dynamic Mermaid call graph for the active code.
    Nodes are colored by Dev A / Dev B owner; failing symbol is highlighted in red.
    """
    room = await yjs_manager.get_or_init_room(room_id)
    code = str(room.ydoc.get("monaco", type=pycrdt.Text))

    ownership_items = await get_room_ownership(room_id, current_code=code)
    owner_map = {item.symbol: item.owner for item in ownership_items}

    mermaid_src = generate_call_graph_mermaid(
        code=code,
        ownership=owner_map,
        failing_symbol=failing_symbol,
    )

    return DiagramResponse(
        room_id=room_id,
        mermaid_src=mermaid_src,
        failing_symbol=failing_symbol,
        ownership=owner_map,
    )
