"""Application settings API."""

from fastapi import APIRouter
from pydantic import BaseModel, Field

from config import Settings, get_settings, persist_settings

router = APIRouter(tags=["settings"])


class SettingsResponse(BaseModel):
    """Serializable settings snapshot for clients."""

    root_scan_dir: str
    excluded_paths: list[str]
    scan_interval_seconds: int
    backend_host: str
    backend_port: int


class SettingsUpdateRequest(BaseModel):
    """Payload for replacing persisted settings."""

    root_scan_dir: str
    excluded_paths: list[str]
    scan_interval_seconds: int = Field(ge=1)
    backend_host: str
    backend_port: int = Field(ge=1, le=65535)


@router.get("/settings", response_model=SettingsResponse)
async def read_settings() -> SettingsResponse:
    """Return the active settings values."""
    current = get_settings()
    return SettingsResponse(
        root_scan_dir=str(current.root_scan_dir),
        excluded_paths=list(current.excluded_paths),
        scan_interval_seconds=current.scan_interval_seconds,
        backend_host=current.backend_host,
        backend_port=current.backend_port,
    )


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdateRequest) -> SettingsResponse:
    """Replace settings and persist them to ``.env``."""
    updated = Settings.model_validate(
        {
            "root_scan_dir": body.root_scan_dir,
            "excluded_paths": body.excluded_paths,
            "scan_interval_seconds": body.scan_interval_seconds,
            "backend_host": body.backend_host,
            "backend_port": body.backend_port,
        }
    )
    persist_settings(updated)
    reloaded = get_settings()
    return SettingsResponse(
        root_scan_dir=str(reloaded.root_scan_dir),
        excluded_paths=list(reloaded.excluded_paths),
        scan_interval_seconds=reloaded.scan_interval_seconds,
        backend_host=reloaded.backend_host,
        backend_port=reloaded.backend_port,
    )
