"""Application settings API."""

from typing import Optional

from fastapi import APIRouter
from pydantic import BaseModel, Field

from config import Settings, get_settings, persist_settings

router = APIRouter(tags=["settings"])


class AppRegistryItem(BaseModel):
    """A single entry in the common apps registry."""

    name: str
    repo_url: str
    default_branch: str


class SettingsResponse(BaseModel):
    """Serializable settings snapshot for clients."""

    root_scan_dir: str
    excluded_paths: list[str]
    scan_interval_seconds: int
    backend_host: str
    backend_port: int
    db_host: str
    db_user: str
    db_password: str
    app_registry: list[AppRegistryItem]


class SettingsUpdateRequest(BaseModel):
    """Payload for partial settings updates — only provided fields are changed."""

    root_scan_dir: Optional[str] = None
    excluded_paths: Optional[list[str]] = None
    scan_interval_seconds: Optional[int] = Field(default=None, ge=10, le=3600)
    backend_host: Optional[str] = None
    backend_port: Optional[int] = Field(default=None, ge=1, le=65535)
    db_host: Optional[str] = None
    db_user: Optional[str] = None
    db_password: Optional[str] = None
    app_registry: Optional[list[AppRegistryItem]] = None


def _settings_to_response(s: Settings) -> SettingsResponse:
    """Convert a ``Settings`` instance to the API response model."""
    return SettingsResponse(
        root_scan_dir=str(s.root_scan_dir),
        excluded_paths=list(s.excluded_paths),
        scan_interval_seconds=s.scan_interval_seconds,
        backend_host=s.backend_host,
        backend_port=s.backend_port,
        db_host=s.db_host,
        db_user=s.db_user,
        db_password=s.db_password,
        app_registry=[
            AppRegistryItem(**entry) for entry in s.app_registry
        ],
    )


@router.get("/settings", response_model=SettingsResponse)
async def read_settings() -> SettingsResponse:
    """Return the active settings values."""
    return _settings_to_response(get_settings())


@router.put("/settings", response_model=SettingsResponse)
async def update_settings(body: SettingsUpdateRequest) -> SettingsResponse:
    """Apply a partial update to settings and persist them to ``.env``."""
    current = get_settings()

    merged = {
        "root_scan_dir": body.root_scan_dir if body.root_scan_dir is not None else str(current.root_scan_dir),
        "excluded_paths": body.excluded_paths if body.excluded_paths is not None else list(current.excluded_paths),
        "scan_interval_seconds": body.scan_interval_seconds if body.scan_interval_seconds is not None else current.scan_interval_seconds,
        "backend_host": body.backend_host if body.backend_host is not None else current.backend_host,
        "backend_port": body.backend_port if body.backend_port is not None else current.backend_port,
        "db_host": body.db_host if body.db_host is not None else current.db_host,
        "db_user": body.db_user if body.db_user is not None else current.db_user,
        "db_password": body.db_password if body.db_password is not None else current.db_password,
        "app_registry": (
            [item.model_dump() for item in body.app_registry]
            if body.app_registry is not None
            else list(current.app_registry)
        ),
    }

    updated = Settings.model_validate(merged)
    persist_settings(updated)
    return _settings_to_response(updated)
