import pytest
import jwt
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.services.livekit_service import generate_livekit_token


def test_generate_livekit_token_unconfigured():
    res = generate_livekit_token(
        room_id="room_test_123",
        identity="dev_a",
        name="Developer A",
    )
    assert res["room_id"] == "room_test_123"
    assert res["identity"] == "dev_a"
    assert "token" in res
    assert res["configured"] is False

    # Verify JWT decode
    decoded = jwt.decode(res["token"], "dev-livekit-secret-key-32-bytes-long", algorithms=["HS256"])
    assert decoded["sub"] == "dev_a"
    assert decoded["video"]["room"] == "room_test_123"
    assert decoded["video"]["canPublish"] is True


def test_livekit_token_endpoint():
    client = TestClient(app)
    resp = client.post(
        "/rooms/room_xyz/livekit/token",
        json={"identity": "dev_b", "name": "Developer B"},
    )
    assert resp.status_code == 200
    data = resp.json()
    assert data["room_id"] == "room_xyz"
    assert data["identity"] == "dev_b"
    assert "token" in data
    assert "server_url" in data
