import asyncio
import base64
from pathlib import Path
from typing import Optional, Set
import pycrdt
from pycrdt.websocket import WebsocketServer
from fastapi import WebSocket, WebSocketDisconnect

from apps.api.config import settings
from apps.api.logger import get_logger
from apps.api.services.rooms import get_or_create_room, persist_room_snapshot

logger = get_logger("services.yjs")

# Path to seed code file
DEMO_SEED_PATH = Path(__file__).resolve().parent.parent.parent.parent / "demo" / "inventory.py"


class FastAPIWebsocketChannel:
    """Adapts a FastAPI WebSocket into a pycrdt Channel."""

    def __init__(self, websocket: WebSocket, path: str):
        self._websocket = websocket
        self._path = path

    @property
    def path(self) -> str:
        return self._path

    def __aiter__(self):
        return self

    async def __anext__(self) -> bytes:
        return await self.recv()

    async def send(self, message: bytes) -> None:
        await self._websocket.send_bytes(message)

    async def recv(self) -> bytes:
        try:
            return await self._websocket.receive_bytes()
        except (WebSocketDisconnect, RuntimeError):
            raise StopAsyncIteration()


class YjsServerManager:
    """Manages pycrdt WebsocketServer lifecycle, persistence, and seed documents."""

    def __init__(self):
        self.server = WebsocketServer(rooms_ready=True, auto_clean_rooms=False)
        self._server_task: Optional[asyncio.Task] = None
        self._flush_task: Optional[asyncio.Task] = None
        self._active_rooms: Set[str] = set()

    async def start(self):
        """Starts the WebsocketServer as background task and the periodic 10s persistence task."""
        # If server was previously stopped or task group is inactive, create fresh instance
        if self.server.started.is_set() or (self.server._task_group is not None and not self.server._task_group.cancel_scope._active):
            self.server = WebsocketServer(rooms_ready=True, auto_clean_rooms=False)

        self._server_task = asyncio.create_task(self.server.start())
        await self.server.started.wait()
        self._flush_task = asyncio.create_task(self._periodic_flush_loop())
        logger.info("YjsServerManager started with 10s persistence loop")

    async def stop(self):
        """Cancels background loops, flushes all rooms, and stops the server."""
        if self._flush_task:
            self._flush_task.cancel()
            try:
                await self._flush_task
            except asyncio.CancelledError:
                pass
        # Perform final flush
        await self.flush_all_rooms()
        await self.server.stop()
        if self._server_task:
            try:
                await self._server_task
            except asyncio.CancelledError:
                pass
        logger.info("YjsServerManager stopped")

    async def get_or_init_room(self, room_id: str):
        """Initializes a room, restoring from DB snapshot or seeding with demo/inventory.py."""
        if not self.server.started.is_set() or self.server._task_group is None or not self.server._task_group.cancel_scope._active:
            await self.start()

        room = await self.server.get_room(room_id)
        if not room.started.is_set():
            await self.server.start_room(room)

        self._active_rooms.add(room_id)

        # Inspect if text is empty
        monaco_text = room.ydoc.get("monaco", type=pycrdt.Text)
        if len(str(monaco_text)) == 0:
            room_record = await get_or_create_room(room_id)
            saved_snap = room_record.get("doc_snapshot")
            if saved_snap:
                try:
                    update_bytes = base64.b64decode(saved_snap.encode("ascii"))
                    room.ydoc.apply_update(update_bytes)
                    logger.info(f"Restored room {room_id} document from Supabase snapshot")
                except Exception as e:
                    logger.error(f"Failed to restore snapshot for {room_id}: {e}")
            else:
                # Seed with demo/inventory.py
                try:
                    if DEMO_SEED_PATH.exists():
                        seed_content = DEMO_SEED_PATH.read_text(encoding="utf-8")
                        monaco_text += seed_content
                        logger.info(f"Seeded room {room_id} with demo/inventory.py ({len(seed_content)} chars)")
                except Exception as e:
                    logger.error(f"Failed to load demo seed file: {e}")

        return room

    async def handle_connection(self, websocket: WebSocket, room_id: str):
        """Serves a client connection for a specific room."""
        room = await self.get_or_init_room(room_id)
        channel = FastAPIWebsocketChannel(websocket, room_id)

        try:
            logger.info(f"Serving Yjs client for room {room_id} (active clients: {len(room.clients) + 1})")
            await self.server.serve(channel)
        finally:
            logger.info(f"Client disconnected from room {room_id} (remaining clients: {len(room.clients)})")
            # If last client left, flush immediately
            if len(room.clients) == 0:
                await self.flush_room(room_id)

    async def flush_room(self, room_id: str):
        """Flushes document snapshot to Supabase and cache."""
        try:
            if not self.server.rooms or room_id not in self.server.rooms:
                return
            room = self.server.rooms[room_id]
            snapshot = room.ydoc.get_update()
            await persist_room_snapshot(room_id, snapshot)
        except Exception as e:
            logger.error(f"Error persisting snapshot for room {room_id}: {e}")

    async def flush_all_rooms(self):
        """Flushes all currently tracked rooms."""
        for room_id in list(self._active_rooms):
            await self.flush_room(room_id)

    async def _periodic_flush_loop(self):
        """Runs every 10 seconds to persist active document snapshots."""
        while True:
            try:
                await asyncio.sleep(10.0)
                await self.flush_all_rooms()
            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Exception in periodic flush loop: {e}")


yjs_manager = YjsServerManager()
