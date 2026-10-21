import time
from typing import Dict, Any, Optional
import jwt

from apps.api.config import settings
from apps.api.logger import get_logger

logger = get_logger("services.livekit")


def generate_livekit_token(
    room_id: str,
    identity: str,
    name: Optional[str] = None,
    ttl_seconds: int = 6 * 3600,
) -> Dict[str, Any]:
    """
    Generates a LiveKit-compatible WebRTC Access Token (JWT HS256)
    granting room join, audio/video publishing, and subscription permissions.
    """
    api_key = settings.LIVEKIT_API_KEY.strip()
    api_secret = settings.LIVEKIT_API_SECRET.strip()
    server_url = settings.LIVEKIT_URL.strip()

    is_configured = bool(api_key and api_secret and not api_key.startswith("API..."))

    if not is_configured:
        logger.info(f"LiveKit credentials not configured. Generating local preview token for room '{room_id}'")
        # Generate a development preview token signed with dev secret
        now = int(time.time())
        dev_payload = {
            "iss": "dev_key",
            "sub": identity,
            "name": name or identity,
            "nbf": now,
            "exp": now + ttl_seconds,
            "video": {
                "room": room_id,
                "roomJoin": True,
                "canPublish": True,
                "canSubscribe": True,
                "canPublishData": True,
            },
            "_mock": True,
        }
        token = jwt.encode(dev_payload, "dev-livekit-secret-key-32-bytes-long", algorithm="HS256")
        return {
            "token": token,
            "server_url": server_url or "wss://your-project.livekit.cloud",
            "configured": False,
            "identity": identity,
            "room_id": room_id,
        }

    now = int(time.time())
    payload = {
        "iss": api_key,
        "sub": identity,
        "name": name or identity,
        "nbf": now,
        "exp": now + ttl_seconds,
        "video": {
            "room": room_id,
            "roomJoin": True,
            "canPublish": True,
            "canSubscribe": True,
            "canPublishData": True,
        },
    }

    token = jwt.encode(payload, api_secret, algorithm="HS256")
    logger.info(f"Generated LiveKit token for user '{identity}' in room '{room_id}'")

    return {
        "token": token,
        "server_url": server_url,
        "configured": True,
        "identity": identity,
        "room_id": room_id,
    }
