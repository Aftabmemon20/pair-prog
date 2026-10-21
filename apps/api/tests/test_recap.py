import pytest
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.services.recap import generate_session_recap, get_session_recap


@pytest.mark.anyio
async def test_generate_session_recap_structure():
    room_id = "test_recap_unit_room"
    # Seed ownership and a failure event
    client = TestClient(app)
    client.post(f"/rooms/{room_id}/ownership/split")

    recap = await generate_session_recap(room_id)
    assert recap.session_id == room_id
    assert len(recap.summary) > 0
    assert len(recap.decisions) >= 1
    assert len(recap.ownership_summary) >= 2
    assert len(recap.next_steps) >= 1


def test_recap_endpoints_flow():
    client = TestClient(app)
    room_id = "test_recap_endpoints_room"

    # Split ownership first
    client.post(f"/rooms/{room_id}/ownership/split")

    # 1. POST recap
    post_res = client.post(f"/rooms/{room_id}/recap")
    assert post_res.status_code == 200
    data = post_res.json()
    assert data["session_id"] == room_id
    assert "summary" in data
    assert isinstance(data["decisions"], list)
    assert isinstance(data["ownership_summary"], list)

    # 2. GET recap
    get_res = client.get(f"/rooms/{room_id}/recap")
    assert get_res.status_code == 200
    assert get_res.json()["session_id"] == room_id

    # 3. GET markdown export
    md_res = client.get(f"/rooms/{room_id}/recap/markdown")
    assert md_res.status_code == 200
    assert md_res.headers["content-type"].startswith("text/markdown")
    md_text = md_res.text
    assert "# Pairio-Lite Session Recap" in md_text
    assert "## Key Decisions" in md_text
    assert "## Code Ownership" in md_text
