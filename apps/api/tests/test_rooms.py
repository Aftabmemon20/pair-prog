import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.services.rooms import verify_room_token


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_create_and_join_room_flow(client):
    # 1. Create Room
    create_res = client.post("/rooms")
    assert create_res.status_code == 200
    room_data = create_res.json()
    room_id = room_data["room_id"]
    assert room_data["max_humans"] == 2

    # 2. Join Host (Dev A)
    join_a = client.post(f"/rooms/{room_id}/join", json={"name": "Dev A"})
    assert join_a.status_code == 200
    res_a = join_a.json()
    assert res_a["name"] == "Dev A"
    assert res_a["role"] == "host"
    token_a = res_a["token"]

    # Verify JWT payload
    payload_a = verify_room_token(token_a)
    assert payload_a is not None
    assert payload_a["room_id"] == room_id
    assert payload_a["name"] == "Dev A"

    # 3. Join Peer (Dev B)
    join_b = client.post(f"/rooms/{room_id}/join", json={"name": "Dev B"})
    assert join_b.status_code == 200
    res_b = join_b.json()
    assert res_b["name"] == "Dev B"
    assert res_b["role"] == "peer"
    assert res_b["color"] != res_a["color"] # Distinct colors!

    # 4. Attempt to join 3rd human -> Must reject with 403
    join_c = client.post(f"/rooms/{room_id}/join", json={"name": "Dev C (Intruder)"})
    assert join_c.status_code == 403
    assert "Room is full" in join_c.json()["detail"]

    # 5. Verify room seed code contains inventory.py content
    code_res = client.get(f"/rooms/{room_id}/code")
    assert code_res.status_code == 200
    code_data = code_res.json()
    assert "apply_discount" in code_data["code"]
    assert "checkout_total" in code_data["code"]
