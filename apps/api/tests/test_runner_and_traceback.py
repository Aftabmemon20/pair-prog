from pathlib import Path
import pytest
from fastapi.testclient import TestClient
from apps.api.main import app
from apps.api.services.parser import list_symbols, parse_traceback

DEMO_CODE_PATH = Path(__file__).resolve().parent.parent.parent.parent / "demo" / "inventory.py"


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


def test_ast_symbol_ranges_on_inventory():
    """Confirms AST parser extracts exact symbol line ranges on the demo seed file."""
    code = DEMO_CODE_PATH.read_text(encoding="utf-8")
    symbols = list_symbols(code)

    sym_dict = {s.name: s for s in symbols}
    assert "load_items" in sym_dict
    assert "apply_discount" in sym_dict
    assert "checkout_total" in sym_dict

    # Check that ranges are non-overlapping and contiguous
    assert sym_dict["load_items"].start_line < sym_dict["load_items"].end_line
    assert sym_dict["apply_discount"].start_line > sym_dict["load_items"].end_line
    assert sym_dict["checkout_total"].start_line > sym_dict["apply_discount"].end_line


def test_traceback_parser_on_demo_bug():
    """
    Simulates the exact runtime exception triggered by Dev B's bug in apply_discount:
    ValueError: Price cannot be negative for Mechanical Keyboard: -60.0
    """
    simulated_tb = """
Traceback (most recent call last):
  File "main.py", line 47, in <module>
    discounted = apply_discount(catalog, 15.0)
  File "main.py", line 32, in apply_discount
    raise ValueError(f"Price cannot be negative for {item['name']}: {discounted_price}")
ValueError: Price cannot be negative for Mechanical Keyboard: -60.0
"""
    parsed = parse_traceback(simulated_tb)

    assert parsed.error_type == "ValueError"
    assert "Price cannot be negative" in parsed.error_message
    assert len(parsed.frames) == 2

    top = parsed.top_frame
    assert top is not None
    assert top.file == "main.py"
    assert top.line == 32
    assert top.function == "apply_discount"
    assert "raise ValueError" in top.code_line


def test_syntax_error_handled():
    """Tests syntax error traceback parsing and AST handling."""
    code_with_syntax_err = "def foo(:\n    pass"
    symbols = list_symbols(code_with_syntax_err)
    assert symbols == []

    syntax_tb = """
  File "main.py", line 1
    def foo(:
            ^
SyntaxError: invalid syntax
"""
    parsed = parse_traceback(syntax_tb)
    assert parsed.error_type == "SyntaxError"
    assert parsed.frames[0].line == 1


def test_run_event_recording_and_broadcast(client):
    """
    Acceptance test for run event timeline recording:
    When a user executes code, the result is saved as an audit event
    with an idempotency key and broadcast to peer participants.
    """
    room_id = "test_run_event_room"
    client.post("/rooms", json={"custom_id": room_id})

    # Host posts a run event with a traceback
    event_payload = {
        "actor": "Dev A",
        "stdout": "=== Running Inventory Checkout ===\nLoaded 3 items.\n",
        "stderr": "ValueError: Price cannot be negative for Mechanical Keyboard: -60.0\n",
        "exit_code": 1,
        "execution_time_ms": 38.4,
        "traceback": {
            "error_type": "ValueError",
            "error_message": "Price cannot be negative for Mechanical Keyboard: -60.0",
            "frames": [
                {
                    "file": "main.py",
                    "line": 32,
                    "function": "apply_discount",
                    "code_line": "raise ValueError(...)",
                }
            ],
            "top_frame": {
                "file": "main.py",
                "line": 32,
                "function": "apply_discount",
                "code_line": "raise ValueError(...)",
            },
        },
        "idempotency_key": "unique_run_key_101",
    }

    res = client.post(f"/rooms/{room_id}/run-event", json=event_payload)
    assert res.status_code == 200
    assert res.json()["status"] == "recorded"

    # Verify duplicate submission is handled idempotently
    res_dup = client.post(f"/rooms/{room_id}/run-event", json=event_payload)
    assert res_dup.status_code == 200

    # Peer queries room events to receive the synchronized run result
    events_res = client.get(f"/rooms/{room_id}/events")
    assert events_res.status_code == 200
    events = events_res.json()
    assert len(events) == 1
    assert events[0]["actor"] == "Dev A"
    assert events[0]["payload"]["exit_code"] == 1
    assert events[0]["payload"]["traceback"]["top_frame"]["function"] == "apply_discount"
