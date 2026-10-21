import base64
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Dict, Any, Optional, List, Tuple
import jwt
from pydantic import BaseModel, Field

from apps.api.config import settings
from apps.api.logger import get_logger

logger = get_logger("services.rooms")

# Available colors for participants
PARTICIPANT_COLORS = [
    {"name": "Emerald", "hex": "#10b981"},  # Dev A
    {"name": "Sky Blue", "hex": "#0284c7"}, # Dev B
]

# In-memory session fallback for local dev / when Supabase is unconfigured or offline
# Schema: room_id -> { "id": room_id, "status": "active", "created_at": ..., "participants": {}, "snapshot": bytes }
IN_MEMORY_ROOMS: Dict[str, Dict[str, Any]] = {}


class Participant(BaseModel):
    id: str
    name: str
    color: str
    role: str # "host" or "peer"
    joined_at: float
    last_seen_at: float


class Room(BaseModel):
    id: str
    status: str = "active"
    created_at: float = Field(default_factory=time.time)
    participants: Dict[str, Participant] = Field(default_factory=dict)
    doc_snapshot: Optional[str] = None # Base64 encoded Yjs update


def create_room_token(room_id: str, participant_id: str, name: str, color: str, role: str) -> str:
    """Creates a signed JWT room token valid for 4 hours."""
    now = int(time.time())
    payload = {
        "sub": participant_id,
        "room_id": room_id,
        "name": name,
        "color": color,
        "role": role,
        "iat": now,
        "exp": now + (4 * 3600), # 4 hours expiry
    }
    return jwt.encode(payload, settings.JWT_SECRET, algorithm="HS256")


def verify_room_token(token: str) -> Optional[Dict[str, Any]]:
    """Verifies a signed room token."""
    try:
        payload = jwt.decode(token, settings.JWT_SECRET, algorithms=["HS256"])
        return payload
    except jwt.PyJWTError as e:
        logger.warning(f"Invalid room token: {e}")
        return None


async def get_or_create_room(room_id: str) -> Dict[str, Any]:
    """Retrieves room from memory/DB or creates it."""
    if room_id in IN_MEMORY_ROOMS:
        return IN_MEMORY_ROOMS[room_id]

    # Try fetching from Supabase if configured
    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {"apikey": settings.SUPABASE_KEY, "Authorization": f"Bearer {settings.SUPABASE_KEY}"}
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.get(f"{settings.SUPABASE_URL}/rest/v1/sessions?id=eq.{room_id}", headers=headers)
                if res.status_code == 200 and res.json():
                    row = res.json()[0]
                    room_data = {
                        "id": row["id"],
                        "status": row.get("status", "active"),
                        "created_at": time.time(),
                        "participants": {},
                        "doc_snapshot": row.get("doc_snapshot"),
                    }
                    IN_MEMORY_ROOMS[room_id] = room_data
                    return room_data
        except Exception as e:
            logger.warning(f"Could not load room from Supabase: {e}")

    # Fallback initialize
    new_room = {
        "id": room_id,
        "status": "active",
        "created_at": time.time(),
        "participants": {},
        "doc_snapshot": None,
    }
    IN_MEMORY_ROOMS[room_id] = new_room
    return new_room


async def persist_room_snapshot(room_id: str, snapshot_bytes: bytes) -> bool:
    """Saves Yjs binary snapshot (base64 encoded) to DB and cache."""
    b64_snap = base64.b64encode(snapshot_bytes).decode("ascii")
    room = await get_or_create_room(room_id)
    room["doc_snapshot"] = b64_snap

    if settings.SUPABASE_URL and settings.SUPABASE_KEY:
        try:
            import httpx
            headers = {
                "apikey": settings.SUPABASE_KEY,
                "Authorization": f"Bearer {settings.SUPABASE_KEY}",
                "Content-Type": "application/json",
                "Prefer": "resolution=merge-duplicates",
            }
            payload = {
                "id": room_id,
                "doc_snapshot": b64_snap,
                "updated_at": datetime.now(timezone.utc).isoformat(),
            }
            async with httpx.AsyncClient(timeout=3.0) as client:
                res = await client.post(f"{settings.SUPABASE_URL}/rest/v1/sessions", json=payload, headers=headers)
                if res.status_code in (200, 201, 204):
                    logger.info(f"Persisted snapshot for room {room_id} to Supabase")
                    return True
        except Exception as e:
            logger.error(f"Failed to persist snapshot to Supabase: {e}")

    return True


async def join_room_participant(room_id: str, name: str, role: Optional[str] = None) -> Tuple[bool, Dict[str, Any], str]:
    """
    Attempts to join a user to a room.
    Enforces maximum of 2 human participants.
    Returns: (success, result_dict_or_empty, error_message)
    """
    room = await get_or_create_room(room_id)
    participants = room.get("participants", {})

    # Check if participant with same name is reconnecting
    existing_p = next((p for p in participants.values() if p["name"].lower() == name.lower()), None)
    if existing_p:
        token = create_room_token(
            room_id=room_id,
            participant_id=existing_p["id"],
            name=existing_p["name"],
            color=existing_p["color"],
            role=existing_p["role"],
        )
        existing_p["last_seen_at"] = time.time()
        return True, {
            "token": token,
            "participant": existing_p,
            "room_id": room_id,
        }, ""

    # Check capacity limit: max 2 humans
    if len(participants) >= 2:
        return False, {}, "Room is full. Maximum 2 human developers allowed per session."

    participant_id = f"user_{uuid.uuid4().hex[:8]}"
    color_choice = PARTICIPANT_COLORS[len(participants) % len(PARTICIPANT_COLORS)]
    assigned_role = role or ("host" if len(participants) == 0 else "peer")

    participant_data = {
        "id": participant_id,
        "name": name,
        "color": color_choice["hex"],
        "color_name": color_choice["name"],
        "role": assigned_role,
        "joined_at": time.time(),
        "last_seen_at": time.time(),
    }
    participants[participant_id] = participant_data

    token = create_room_token(
        room_id=room_id,
        participant_id=participant_id,
        name=name,
        color=color_choice["hex"],
        role=assigned_role,
    )

    return True, {
        "token": token,
        "participant": participant_data,
        "room_id": room_id,
    }, ""
