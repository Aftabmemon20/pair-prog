from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field
from typing import Optional

from apps.api.services.livekit_service import generate_livekit_token
from apps.api.logger import get_logger

logger = get_logger("routers.livekit")

router = APIRouter(prefix="/rooms", tags=["livekit"])


class LiveKitTokenRequest(BaseModel):
    identity: str = Field(..., description="Unique participant identity (e.g. dev_a or UUID)")
    name: Optional[str] = Field(None, description="Human display name")


class LiveKitTokenResponse(BaseModel):
    token: str
    server_url: str
    configured: bool
    identity: str
    room_id: str


@router.post("/{room_id}/livekit/token", response_model=LiveKitTokenResponse)
async def get_room_livekit_token(room_id: str, payload: LiveKitTokenRequest):
    """
    Issues a LiveKit WebRTC access token for a given participant in a pairing room.
    """
    if not room_id or not payload.identity:
        raise HTTPException(status_code=400, detail="room_id and identity are required")

    result = generate_livekit_token(
        room_id=room_id,
        identity=payload.identity,
        name=payload.name,
    )
    return result
