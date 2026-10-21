import uuid
from typing import Dict, Any, Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from apps.api.services.rooms import (
    get_or_create_room,
    join_room_participant,
    verify_room_token,
)
from apps.api.services.yjs_manager import yjs_manager

router = APIRouter(prefix="/rooms", tags=["Rooms"])


class CreateRoomRequest(BaseModel):
    custom_id: Optional[str] = None


class CreateRoomResponse(BaseModel):
    room_id: str
    status: str
    max_humans: int = 2


class JoinRoomRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=50)
    role: Optional[str] = None # "host" or "peer"


class JoinRoomResponse(BaseModel):
    token: str
    participant_id: str
    name: str
    color: str
    role: str
    room_id: str


@router.post("", response_model=CreateRoomResponse)
async def create_room(req: Optional[CreateRoomRequest] = None):
    """
    Creates a new collaborative session.
    Room tokens are signed with JWT (4-hour expiry).
    Max 2 human participants + 1 AI agent.
    """
    room_id = (req and req.custom_id) or f"room_{uuid.uuid4().hex[:10]}"
    room = await get_or_create_room(room_id)
    # Pre-warm room in Yjs manager with seed code
    await yjs_manager.get_or_init_room(room_id)

    return CreateRoomResponse(
        room_id=room["id"],
        status=room.get("status", "active"),
        max_humans=2,
    )


@router.post("/{room_id}/join", response_model=JoinRoomResponse)
async def join_room(room_id: str, req: JoinRoomRequest):
    """
    Registers a human participant in the room.
    Enforces maximum of 2 human participants.
    Returns signed JWT room token.
    """
    success, res, err = await join_room_participant(
        room_id=room_id,
        name=req.name.strip(),
        role=req.role,
    )
    if not success:
        raise HTTPException(status_code=403, detail=err)

    return JoinRoomResponse(
        token=res["token"],
        participant_id=res["participant"]["id"],
        name=res["participant"]["name"],
        color=res["participant"]["color"],
        role=res["participant"]["role"],
        room_id=room_id,
    )


@router.get("/{room_id}")
async def get_room(room_id: str):
    """Retrieves room state and active participants."""
    room = await get_or_create_room(room_id)
    return {
        "id": room["id"],
        "status": room.get("status", "active"),
        "participants": list(room.get("participants", {}).values()),
        "max_humans": 2,
    }


@router.get("/{room_id}/code")
async def get_room_code(room_id: str):
    """Returns the live string content of the room's CRDT document."""
    room = await yjs_manager.get_or_init_room(room_id)
    import pycrdt
    text = room.ydoc.get("monaco", type=pycrdt.Text)
    return {
        "room_id": room_id,
        "length": len(str(text)),
        "code": str(text),
    }
