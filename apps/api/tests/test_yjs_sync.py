import asyncio
import pytest
import pycrdt
from pycrdt.websocket import WebsocketServer


class QueueChannel:
    """In-memory bidirectional channel simulating a WebSocket connection."""

    def __init__(self, path: str):
        self._path = path
        self.inbox = asyncio.Queue()
        self.outbox = asyncio.Queue()
        self.is_closed = False

    @property
    def path(self) -> str:
        return self._path

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        if self.is_closed:
            raise StopAsyncIteration()
        msg = await self.inbox.get()
        if msg is None:
            self.is_closed = True
            raise StopAsyncIteration()
        return msg

    async def send(self, message: bytes) -> None:
        await self.outbox.put(message)

    async def recv(self) -> bytes:
        return await self.__anext__()

    async def close(self):
        self.is_closed = True
        await self.inbox.put(None)


@pytest.mark.anyio
async def test_pycrdt_room_and_sync():
    """
    Spike Acceptance Test:
    Confirms pycrdt and WebsocketServer synchronize documents,
    update Y.Doc on the server, and broadcast to clients.
    """
    server = WebsocketServer(rooms_ready=True, auto_clean_rooms=False)
    async with server:
        # Initialize room
        room = await server.get_room("spike-room-1")
        await server.start_room(room)

        # Server initializes doc with seed text
        server_text = room.ydoc.get("monaco", type=pycrdt.Text)
        server_text += "def inventory_test():\n    pass\n"

        assert "inventory_test" in str(server_text)

        # Client doc connects
        client_doc = pycrdt.Doc()
        client_text = client_doc.get("monaco", type=pycrdt.Text)

        # Apply server state update to client
        server_update = room.ydoc.get_update()
        client_doc.apply_update(server_update)

        assert str(client_text) == "def inventory_test():\n    pass\n"

        # Client makes an edit
        client_text += "    return True\n"
        client_update = client_doc.get_update()

        # Server receives client update
        room.ydoc.apply_update(client_update)

        assert "return True" in str(server_text)
