"""Site config editor — read/write allowlisted keys from ``site_config.json``."""

from __future__ import annotations

import asyncio
import json
import logging
import tempfile
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from config import get_settings
from services.discovery import scan_for_benches
from services.dispatcher import call_remote, get_server_id, is_local

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/benches/{bench_name}/sites/{site_name}/config",
    tags=["site-config"],
)

EDITABLE_KEYS: set[str] = {
    "developer_mode",
    "maintenance_mode",
    "allow_tests",
    "server_script_enabled",
    "host_name",
    "encryption_key",
    "mail_server",
    "mail_port",
    "mail_login",
    "mail_password",
    "use_tls",
    "auto_email_id",
    "scheduler_enabled",
    "pause_scheduler",
    "allow_cors",
    "ignore_csrf",
}

EDITABLE_NESTED_KEYS: dict[str, set[str]] = {
    "limits": {"space_usage", "emails", "users"},
}

READONLY_KEYS: set[str] = {
    "db_name",
    "db_password",
    "db_host",
    "db_port",
    "db_type",
}


class SiteConfigResponse(BaseModel):
    """Split view of a site's configuration."""

    editable: dict[str, Any]
    readonly: dict[str, Any]


class SiteConfigUpdateBody(BaseModel):
    """Payload for updating editable config keys."""

    values: dict[str, Any]


async def _find_bench_path(bench_name: str) -> Path:
    root = get_settings().root_scan_dir
    summaries = await asyncio.to_thread(scan_for_benches, root)
    match = next((item for item in summaries if item.name == bench_name), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Bench not found: {bench_name}")
    return Path(match.path)


def _resolve_site_dir(bench_path: Path, site_name: str) -> Path:
    site_dir = bench_path / "sites" / site_name
    if not site_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Site not found: {site_name}")
    return site_dir


def _read_site_config_sync(site_dir: Path) -> dict[str, Any]:
    config_path = site_dir / "site_config.json"
    try:
        return json.loads(config_path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]
    except (FileNotFoundError, PermissionError, json.JSONDecodeError) as exc:
        logger.debug("Could not read site_config.json at %s: %s", config_path, exc)
        return {}


def _split_config(full_config: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    """Separate the config into editable and read-only sections."""
    editable: dict[str, Any] = {}
    readonly: dict[str, Any] = {}

    for key, value in full_config.items():
        if key in EDITABLE_KEYS:
            editable[key] = value
        elif key in READONLY_KEYS:
            readonly[key] = value
        elif key in EDITABLE_NESTED_KEYS:
            if isinstance(value, dict):
                nested_editable: dict[str, Any] = {}
                nested_readonly: dict[str, Any] = {}
                allowed = EDITABLE_NESTED_KEYS[key]
                for nk, nv in value.items():
                    if nk in allowed:
                        nested_editable[nk] = nv
                    else:
                        nested_readonly[nk] = nv
                if nested_editable:
                    editable.setdefault(key, {}).update(nested_editable)
                if nested_readonly:
                    readonly.setdefault(key, {}).update(nested_readonly)
            else:
                readonly[key] = value
        else:
            readonly[key] = value

    return editable, readonly


def _validate_update_keys(values: dict[str, Any]) -> None:
    """Ensure the update payload only contains allowlisted keys."""
    for key, value in values.items():
        if key in EDITABLE_KEYS:
            continue
        if key in EDITABLE_NESTED_KEYS:
            if not isinstance(value, dict):
                raise HTTPException(
                    status_code=400,
                    detail=f"Key '{key}' must be an object",
                )
            allowed = EDITABLE_NESTED_KEYS[key]
            for nk in value:
                if nk not in allowed:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Key '{key}.{nk}' is not editable",
                    )
            continue
        raise HTTPException(
            status_code=400,
            detail=f"Key '{key}' is not editable",
        )


def _merge_and_write_config_sync(site_dir: Path, updates: dict[str, Any]) -> dict[str, Any]:
    """Merge updates into the existing config and write atomically."""
    config_path = site_dir / "site_config.json"
    try:
        full_config: dict[str, Any] = json.loads(
            config_path.read_text(encoding="utf-8")
        )
    except (FileNotFoundError, json.JSONDecodeError):
        full_config = {}

    for key, value in updates.items():
        if key in EDITABLE_NESTED_KEYS and isinstance(value, dict):
            existing = full_config.get(key, {})
            if not isinstance(existing, dict):
                existing = {}
            existing.update(value)
            full_config[key] = existing
        else:
            full_config[key] = value

    content = json.dumps(full_config, indent=1, sort_keys=True) + "\n"
    fd = tempfile.NamedTemporaryFile(
        mode="w",
        encoding="utf-8",
        dir=str(site_dir),
        suffix=".tmp",
        delete=False,
    )
    try:
        fd.write(content)
        fd.flush()
        fd.close()
        Path(fd.name).replace(config_path)
    except BaseException:
        Path(fd.name).unlink(missing_ok=True)
        raise

    return full_config


@router.get("", response_model=SiteConfigResponse)
async def get_site_config(
    bench_name: str,
    site_name: str,
    server_id: str = Depends(get_server_id),
) -> SiteConfigResponse:
    """Read site_config.json, split into editable and read-only sections."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "GET",
            f"/api/benches/{bench_name}/sites/{site_name}/config",
        )
    bench_path = await _find_bench_path(bench_name)
    site_dir = _resolve_site_dir(bench_path, site_name)
    full_config = await asyncio.to_thread(_read_site_config_sync, site_dir)
    editable, readonly = _split_config(full_config)
    return SiteConfigResponse(editable=editable, readonly=readonly)


@router.put("", response_model=SiteConfigResponse)
async def update_site_config(
    bench_name: str,
    site_name: str,
    body: SiteConfigUpdateBody,
    server_id: str = Depends(get_server_id),
) -> SiteConfigResponse:
    """Merge editable updates into site_config.json (atomic write)."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "PUT",
            f"/api/benches/{bench_name}/sites/{site_name}/config",
            body=body.model_dump(),
        )
    _validate_update_keys(body.values)
    bench_path = await _find_bench_path(bench_name)
    site_dir = _resolve_site_dir(bench_path, site_name)
    try:
        full_config = await asyncio.to_thread(
            _merge_and_write_config_sync, site_dir, body.values
        )
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    except OSError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    editable, readonly = _split_config(full_config)
    return SiteConfigResponse(editable=editable, readonly=readonly)
