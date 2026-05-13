"""FastAPI application entry point."""

from ws.manager import connection_manager
from routes import benches, database, logs, operations, servers, settings, site_config, site_database, sites, system_check, templates
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
    """Create database tables on startup; tear down SSH tunnels on shutdown."""
    from services.remote import tunnel_registry

    create_db_and_tables()
    yield
    await tunnel_registry.disconnect_all()


app = FastAPI(lifespan=lifespan)
app.state.ws_manager = connection_manager

app.add_api_websocket_route("/ws/benches", benches.websocket_bench_status)
app.add_api_websocket_route(
    "/ws/operations/{operation_id}",
    operations.websocket_operation_logs,
)

app.add_api_websocket_route(
    "/ws/benches/{bench_name}/sites/{site_name}/logs/{filename}",
    logs.websocket_tail_log,
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
app.include_router(site_database.router, prefix="/api")
app.include_router(logs.router, prefix="/api")
app.include_router(site_config.router, prefix="/api")
app.include_router(servers.router, prefix="/api")
app.include_router(system_check.router, prefix="/api")


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Liveness endpoint for orchestrators and quick sanity checks."""
    return {"status": "ok"}
