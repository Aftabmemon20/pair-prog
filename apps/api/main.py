import time
import uuid
from contextlib import asynccontextmanager
from typing import Dict, Any

from fastapi import FastAPI, Request, Response, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware

from apps.api.config import settings
from apps.api.logger import setup_logging, get_logger, request_id_ctx
from apps.api.services.db import check_db_health
from apps.api.services.yjs_manager import yjs_manager
from apps.api.routers import rooms

setup_logging()
logger = get_logger("api.server")

start_time = time.time()


class RequestIdAndLoggingMiddleware(BaseHTTPMiddleware):
    """
    Middleware that:
    1. Extracts or creates an X-Request-ID.
    2. Stores it in the ContextVar for structured JSON logging.
    3. Measures and logs request latency and status.
    4. Attaches X-Request-ID to the outgoing response headers.
    """

    async def dispatch(self, request: Request, call_next) -> Response:
        req_id = request.headers.get("X-Request-ID") or str(uuid.uuid4())
        token = request_id_ctx.set(req_id)
        start = time.perf_counter()

        try:
            response = await call_next(request)
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            response.headers["X-Request-ID"] = req_id

            logger.info(
                f"{request.method} {request.url.path} -> {response.status_code} ({duration_ms}ms)",
                extra={
                    "extra_data": {
                        "http_method": request.method,
                        "path": request.url.path,
                        "status_code": response.status_code,
                        "duration_ms": duration_ms,
                        "client_ip": request.client.host if request.client else None,
                    }
                },
            )
            return response
        except Exception as exc:
            duration_ms = round((time.perf_counter() - start) * 1000, 2)
            logger.exception(
                f"Unhandled exception on {request.method} {request.url.path}: {exc}",
                extra={
                    "extra_data": {
                        "http_method": request.method,
                        "path": request.url.path,
                        "duration_ms": duration_ms,
                    }
                },
            )
            raise
        finally:
            request_id_ctx.reset(token)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info(
        f"Starting Pairio-Lite API v{settings.VERSION} [{settings.ENVIRONMENT}]",
        extra={"extra_data": {"cors_origins": settings.cors_origins_list}},
    )
    # Start Yjs Websocket server and periodic snapshot flush task
    await yjs_manager.start()
    yield
    # Gracefully stop Yjs server and persist final state
    await yjs_manager.stop()
    logger.info("Shutting down Pairio-Lite API")


app = FastAPI(
    title="Pairio-Lite API",
    version=settings.VERSION,
    description="Pairio-Lite Pair Master API with Yjs sync and AI facilitation",
    lifespan=lifespan,
)

# CORS middleware allowlist from env
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Request-ID"],
)

# Request ID and JSON logging middleware
app.add_middleware(RequestIdAndLoggingMiddleware)

# Include Routers
app.include_router(rooms.router)


@app.websocket("/yjs/{room_id}")
async def websocket_yjs_endpoint(websocket: WebSocket, room_id: str):
    """
    WebSocket endpoint for real-time Yjs CRDT synchronization.
    Serves Monaco edits, awareness, and remote cursors.
    """
    await websocket.accept()
    await yjs_manager.handle_connection(websocket, room_id)


@app.get("/healthz")
async def healthz() -> Dict[str, Any]:
    """
    Health check endpoint returning version, uptime, and database connectivity.
    Called by Render keep-warm ping and GitHub Actions cron.
    """
    uptime = round(time.time() - start_time, 2)
    db_ok, db_msg = await check_db_health()

    return {
        "status": "ok" if db_ok else "degraded",
        "version": settings.VERSION,
        "environment": settings.ENVIRONMENT,
        "uptime_seconds": uptime,
        "db_ok": db_ok,
        "services": {
            "supabase": db_msg,
        },
    }


@app.get("/")
async def root() -> Dict[str, str]:
    return {
        "service": "Pairio-Lite API",
        "version": settings.VERSION,
        "health": "/healthz",
    }
