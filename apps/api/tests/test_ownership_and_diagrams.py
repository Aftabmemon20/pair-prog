import pytest
from starlette.testclient import TestClient

from apps.api.main import app
from apps.api.services.parser import (
    find_symbol_at_line,
    resolve_ownership,
    generate_call_graph_mermaid,
)

SAMPLE_CODE = """def load_items():
    return [{"price": 100}]

def apply_discount(items, pct):
    return [i['price'] * (1 - pct / 100) for i in items]

def checkout_total(items):
    return sum(items)

if __name__ == "__main__":
    items = load_items()
    d = apply_discount(items, 10)
    total = checkout_total(d)
"""


def test_find_symbol_at_line():
    sym1 = find_symbol_at_line(SAMPLE_CODE, 1)
    assert sym1 is not None
    assert sym1.name == "load_items"

    sym2 = find_symbol_at_line(SAMPLE_CODE, 5)
    assert sym2 is not None
    assert sym2.name == "apply_discount"

    sym3 = find_symbol_at_line(SAMPLE_CODE, 8)
    assert sym3 is not None
    assert sym3.name == "checkout_total"

    # Line outside any function
    sym_none = find_symbol_at_line(SAMPLE_CODE, 12)
    assert sym_none is None


def test_resolve_ownership_and_orphaning():
    assignments = [
        {"symbol": "load_items", "owner": "Dev A", "reason": "Data ingestion"},
        {"symbol": "apply_discount", "owner": "Dev B", "reason": "Pricing logic"},
        {"symbol": "deleted_function", "owner": "Dev A", "reason": "Legacy code"},
    ]

    resolved = resolve_ownership(SAMPLE_CODE, assignments)
    assert len(resolved) == 3

    # load_items
    r0 = next(r for r in resolved if r.symbol == "load_items")
    assert r0.owner == "Dev A"
    assert r0.is_orphaned is False
    assert r0.start_line == 1
    assert r0.color == "#10b981"

    # apply_discount
    r1 = next(r for r in resolved if r.symbol == "apply_discount")
    assert r1.owner == "Dev B"
    assert r1.is_orphaned is False
    assert r1.start_line == 4
    assert r1.color == "#0284c7"

    # deleted_function (orphaned)
    r2 = next(r for r in resolved if r.symbol == "deleted_function")
    assert r2.is_orphaned is True
    assert r2.start_line is None


def test_generate_call_graph_mermaid():
    ownership = {"load_items": "Dev A", "apply_discount": "Dev B", "checkout_total": "Dev A"}
    mermaid = generate_call_graph_mermaid(SAMPLE_CODE, ownership=ownership, failing_symbol="apply_discount")

    assert "flowchart TD" in mermaid
    assert "load_items" in mermaid
    assert "apply_discount" in mermaid
    assert "checkout_total" in mermaid
    # Failing symbol ruby red style
    assert "style apply_discount fill:#881337" in mermaid
    assert "FAILING" in mermaid
    # Dev A green style
    assert "style load_items fill:#064e3b" in mermaid
    # Dev B blue style
    assert "style checkout_total fill:#064e3b" in mermaid


def test_ownership_endpoints_flow():
    client = TestClient(app)
    room_id = "test_p4_room_flow"

    # 1. Trigger automatic ownership split
    res_split = client.post(f"/rooms/{room_id}/ownership/split")
    assert res_split.status_code == 200
    split_items = res_split.json()
    assert len(split_items) >= 2
    assert any(item["owner"] == "Dev A" for item in split_items)
    assert any(item["owner"] == "Dev B" for item in split_items)

    # 2. Get ownership
    res_get = client.get(f"/rooms/{room_id}/ownership")
    assert res_get.status_code == 200
    assert len(res_get.json()) == len(split_items)

    # 3. Manually reassign owner
    first_sym = split_items[0]["symbol"]
    target_owner = "Dev B" if split_items[0]["owner"] == "Dev A" else "Dev A"
    res_assign = client.post(
        f"/rooms/{room_id}/ownership/assign",
        json={"symbol": first_sym, "owner": target_owner, "reason": "Testing manual reassignment"},
    )
    assert res_assign.status_code == 200
    updated_items = res_assign.json()
    reassigned = next(item for item in updated_items if item["symbol"] == first_sym)
    assert reassigned["owner"] == target_owner

    # 4. Fetch dynamic diagram
    res_diag = client.get(f"/rooms/{room_id}/diagram?failing_symbol={first_sym}")
    assert res_diag.status_code == 200
    diag_data = res_diag.json()
    assert "flowchart TD" in diag_data["mermaid_src"]
    assert first_sym in diag_data["mermaid_src"]
    assert diag_data["failing_symbol"] == first_sym


def test_automated_failure_isolation_endpoint():
    client = TestClient(app)
    room_id = "test_p4_failure_room"

    # Ensure room has code
    client.post(f"/rooms/{room_id}/ownership/split")

    # Analyze failure at line 28 (apply_discount in inventory.py)
    res = client.post(
        f"/rooms/{room_id}/agent/analyze-failure",
        json={
            "error_type": "ZeroDivisionError",
            "error_message": "division by zero",
            "line": 28,
            "actor": "Dev A",
        },
    )
    assert res.status_code == 200
    data = res.json()
    assert data["failing_symbol"] == "apply_discount"
    assert data["line"] == 28
    assert "flowchart TD" in data["mermaid_src"]
    assert "apply_discount" in data["mermaid_src"]
    assert data["annotation"]["start_line"] == 28
    assert data["annotation"]["kind"] == "error"
    assert len(data["explanation"]) > 0

    # Verify timeline recorded tool calls and agent message
    timeline_res = client.get(f"/rooms/{room_id}/agent/timeline")
    assert timeline_res.status_code == 200
    events = timeline_res.json()["events"]
    event_types = [e["type"] for e in events]
    assert "tool_call" in event_types
    assert "agent_message" in event_types
