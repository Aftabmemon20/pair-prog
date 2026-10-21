import io
import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.services.stt_service import transcribe_audio


@pytest.mark.anyio
async def test_transcribe_audio_empty_bytes():
    text = await transcribe_audio(b"")
    assert text == ""


@pytest.mark.anyio
async def test_transcribe_audio_mocked_groq():
    fake_audio = b"RIFF....WAVEfmt ...."
    with patch("httpx.AsyncClient.post") as mock_post:
        mock_resp = MagicMock()
        mock_resp.status_code = 200
        mock_resp.json.return_value = {"text": "Why did the test fail at line 28?"}
        mock_post.return_value = mock_resp

        with patch("apps.api.config.settings.GROQ_API_KEY", "mock_groq_key"):
            text = await transcribe_audio(fake_audio, "test.webm")
            assert "line 28" in text


def test_stt_endpoint_flow():
    client = TestClient(app)
    room_id = "test_stt_room"

    fake_file = io.BytesIO(b"fake audio chunk data")
    files = {"file": ("test.webm", fake_file, "audio/webm")}
    data = {"actor": "Dev A", "ask_agent": "true"}

    with patch("apps.api.services.stt_service.transcribe_audio", return_value="What functions are in main.py?"):
        res = client.post(f"/rooms/{room_id}/agent/stt", files=files, data=data)
        assert res.status_code == 200
        body = res.json()
        assert body["transcript"] == "What functions are in main.py?"
        assert body["actor"] == "Dev A"
        assert body["response"] is not None

        # Verify speech_transcript in timeline
        timeline_res = client.get(f"/rooms/{room_id}/agent/timeline")
        assert timeline_res.status_code == 200
        events = timeline_res.json()["events"]
        assert any(e["type"] == "speech_transcript" for e in events)
