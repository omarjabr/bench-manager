"""FastAPI application entry point."""

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from database import create_db_and_tables
from routes import benches, operations, settings, sites, templates
from ws.manager import ConnectionManager


@asynccontextmanager
async def lifespan(_app: FastAPI):
    """Create database tables on startup."""
    create_db_and_tables()
    yield


app = FastAPI(lifespan=lifespan)
app.state.ws_manager = ConnectionManager()

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


@app.get("/health")
async def health_check() -> dict[str, str]:
    """Liveness endpoint for orchestrators and quick sanity checks."""
    return {"status": "ok"}
