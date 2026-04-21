"""FastAPI application entry point."""

from ws.manager import connection_manager
from routes import benches, database, operations, settings, sites, templates
from database import create_db_and_tables
from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI
from contextlib import asynccontextmanager
import logging

logger = logging.getLogger(__name__)

logging.basicConfig(
    level=logging.DEBUG,
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create database tables on startup."""
    create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)
app.state.ws_manager = connection_manager

app.add_api_websocket_route("/ws/benches", benches.websocket_bench_status)
app.add_api_websocket_route(
    "/ws/operations/{operation_id}",
    operations.websocket_operation_logs,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(benches.router, prefix="/api")
app.include_router(settings.router, prefix="/api")
app.include_router(templates.router, prefix="/api")
app.include_router(sites.router, prefix="/api")
app.include_router(operations.router, prefix="/api")
app.include_router(database.router, prefix="/api")


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Liveness endpoint for orchestrators and quick sanity checks."""
    return {"status": "ok"}
