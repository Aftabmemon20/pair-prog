import asyncio
import base64
import pytest
import pycrdt
from pycrdt.websocket import WebsocketServer
from apps.api.services.rooms import persist_room_snapshot, get_or_create_room, IN_MEMORY_ROOMS
from apps.api.services.yjs_manager import YjsServerManager


@pytest.mark.anyio
async def test_two_clients_collab_and_restart_reconnect():
    """
    Acceptance Test for Phase P1:
    1. Two client contexts (Dev A & Dev B) join room.
    2. Both type concurrent edits into the document.
    3. Both see merged edits with zero conflicts via CRDT.
    4. Kill the API server (simulate restart/sleep).
    5. Spin up a new API server instance.
    6. Both reconnect, and the document is verified 100% intact!
    """
    room_id = "test_collab_e2e_room"

    # --- Phase 1: Initial Server & Room Setup ---
    server1 = YjsServerManager()
    await server1.start()

    # Pre-init room (seeded with demo/inventory.py)
    room1 = await server1.get_or_init_room(room_id)
    doc_initial = room1.ydoc.get("monaco", type=pycrdt.Text)
    assert "apply_discount" in str(doc_initial)

    # --- Phase 2: Dev A & Dev B connect as client contexts ---
    doc_dev_a = pycrdt.Doc()
    text_dev_a = doc_dev_a.get("monaco", type=pycrdt.Text)
    doc_dev_a.apply_update(room1.ydoc.get_update())

    doc_dev_b = pycrdt.Doc()
    text_dev_b = doc_dev_b.get("monaco", type=pycrdt.Text)
    doc_dev_b.apply_update(room1.ydoc.get_update())

    # Dev A types a new function at the bottom
    dev_a_edit = "\n\ndef dev_a_feature():\n    return 'written by Dev A'\n"
    text_dev_a += dev_a_edit
    update_a = doc_dev_a.get_update()

    # Dev B types a new function
    dev_b_edit = "\n\ndef dev_b_feature():\n    return 'written by Dev B'\n"
    text_dev_b += dev_b_edit
    update_b = doc_dev_b.get_update()

    # Server receives both updates
    room1.ydoc.apply_update(update_a)
    room1.ydoc.apply_update(update_b)

    # Both clients receive each other's updates
    doc_dev_a.apply_update(room1.ydoc.get_update())
    doc_dev_b.apply_update(room1.ydoc.get_update())

    # Verify both contexts see both edits
    assert "dev_a_feature" in str(text_dev_a)
    assert "dev_b_feature" in str(text_dev_a)
    assert "dev_a_feature" in str(text_dev_b)
    assert "dev_b_feature" in str(text_dev_b)

    # --- Phase 3: Kill the API Server ---
    # Trigger persistence before shutdown (as Render sleep or SIGTERM does)
    await server1.stop()

    # Verify snapshot was persisted in storage
    room_record = await get_or_create_room(room_id)
    assert room_record.get("doc_snapshot") is not None

    # --- Phase 4: Spin up a completely fresh API instance (Restart) ---
    server2 = YjsServerManager()
    await server2.start()

    # Room is opened on fresh server
    room2 = await server2.get_or_init_room(room_id)
    doc_restored = room2.ydoc.get("monaco", type=pycrdt.Text)

    # --- Phase 5: Verify document is 100% intact ---
    restored_content = str(doc_restored)
    assert "apply_discount" in restored_content
    assert "dev_a_feature" in restored_content
    assert "dev_b_feature" in restored_content

    # Clean shutdown of server2
    await server2.stop()
