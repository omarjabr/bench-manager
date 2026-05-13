"""Long-running bench operations with WebSocket log streaming."""

from __future__ import annotations

import asyncio
import json
import logging
import re
from pathlib import Path
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request, WebSocket
from pydantic import BaseModel, Field, field_validator
from starlette.websockets import WebSocketDisconnect

from config import get_settings
from routes.benches import _find_bench_path
from services.executor import (
    create_operation_id,
    run_operation,
    stream_command,
)
from services import process
from services.dispatcher import call_remote, get_server_id, is_local, proxy_websocket
from ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["operations"])

_BENCH_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")
_APP_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9_-]+$")


class OperationIdResponse(BaseModel):
    """Immediate response after starting a background bench CLI operation."""

    operation_id: str


class InitAppItem(BaseModel):
    """App to fetch with ``bench get-app`` after ``bench init``."""

    name: str = Field(
        min_length=1,
        description="Display or hint only; install-app uses the name derived from sites/apps.txt.",
    )
    repo_url: str = Field(min_length=1)
    branch: str | None = None


class InitOperationRequest(BaseModel):
    """Payload for ``POST /api/operations/init`` (New Bench Wizard)."""

    bench_name: str = Field(min_length=1)
    parent_dir: str = Field(min_length=1)
    frappe_version: Literal["version-15", "version-14", "develop"]
    site_name: str = Field(min_length=1)
    admin_password: str = Field(min_length=8)
    db_root_password: str = Field(default="")
    apps: list[InitAppItem] = Field(default_factory=list)
    python_version: str = Field(
        default="python3.11",
        min_length=1,
        description="Executable or version string for ``bench init --python``.",
    )

    @field_validator("bench_name")
    @classmethod
    def validate_bench_name(cls, value: str) -> str:
        if not _BENCH_NAME_PATTERN.fullmatch(value):
            raise ValueError(
                "bench_name may only contain letters, digits, underscores, and hyphens"
            )
        return value

    @field_validator("site_name")
    @classmethod
    def validate_site_name(cls, value: str) -> str:
        lowered = value.lower()
        if lowered != value or " " in value:
            raise ValueError("site_name must be lowercase with no spaces")
        if "." not in value:
            raise ValueError(
                "site_name must contain a dot (e.g. mysite.localhost)"
            )
        return value

    @field_validator("python_version")
    @classmethod
    def validate_python_version(cls, value: str) -> str:
        # Allow typical interpreter names and paths (no spaces or shell metacharacters).
        if not re.fullmatch(r"[a-zA-Z0-9._/+-]+", value):
            raise ValueError(
                "python_version may only contain letters, digits, and ._/+- characters"
            )
        return value


class GetAppOperationRequest(BaseModel):
    """Payload for ``POST /api/operations/get-app``."""

    bench_name: str = Field(min_length=1)
    repo_url: str = Field(min_length=1)
    branch: str | None = None

    @field_validator("repo_url")
    @classmethod
    def validate_https_repo(cls, value: str) -> str:
        if not value.startswith("https://"):
            raise ValueError("repo_url must start with https://")
        return value


class NewSiteOperationRequest(BaseModel):
    """Payload for ``POST /api/operations/new-site``."""

    bench_name: str = Field(min_length=1)
    site_name: str = Field(min_length=1)
    admin_password: str = Field(min_length=8)
    db_root_password: str = Field(min_length=8)
    apps: list[str] = Field(default_factory=list)

    @field_validator("site_name")
    @classmethod
    def validate_site_name_chars(cls, value: str) -> str:
        lowered = value.lower()
        if lowered != value or " " in value:
            raise ValueError("site_name must be lowercase with no spaces")
        if not (".localhost" in value or "." in value):
            raise ValueError(
                "site_name must end with .localhost or contain a dot (e.g. site.localhost)"
            )
        return value


class InstallAppOperationRequest(BaseModel):
    """Payload for ``POST /api/operations/install-app``."""

    bench_name: str = Field(min_length=1)
    site_name: str = Field(min_length=1)
    apps: list[str] = Field(min_length=1)

    @field_validator("apps")
    @classmethod
    def validate_app_tokens(cls, value: list[str]) -> list[str]:
        for app in value:
            if not _APP_NAME_PATTERN.fullmatch(app):
                raise ValueError(
                    f"app name {app!r} may only contain letters, digits, underscores, and hyphens"
                )
        return value

    @field_validator("site_name")
    @classmethod
    def validate_site_name_install(cls, value: str) -> str:
        lowered = value.lower()
        if lowered != value or " " in value:
            raise ValueError("site_name must be lowercase with no spaces")
        if not (".localhost" in value or "." in value):
            raise ValueError(
                "site_name must end with .localhost or contain a dot (e.g. site.localhost)"
            )
        return value


class BenchUpdateRequest(BaseModel):
    """Payload for ``POST /api/operations/bench-update``."""

    bench_name: str = Field(min_length=1)
    reset: bool = Field(default=False)
    no_backup: bool = Field(default=False)

    @field_validator("bench_name")
    @classmethod
    def validate_bench_name_update(cls, value: str) -> str:
        if not _BENCH_NAME_PATTERN.fullmatch(value):
            raise ValueError(
                "bench_name may only contain letters, digits, underscores, and hyphens"
            )
        return value


_SITE_NAME_PATTERN = re.compile(r"^[a-zA-Z0-9._-]+$")


class SiteBackupRequest(BaseModel):
    """Payload for ``POST /api/operations/site-backup``."""

    bench_name: str = Field(min_length=1)
    site_name: str = Field(min_length=1)
    with_files: bool = Field(default=False)

    @field_validator("bench_name")
    @classmethod
    def validate_bench_name_backup(cls, value: str) -> str:
        if not _BENCH_NAME_PATTERN.fullmatch(value):
            raise ValueError(
                "bench_name may only contain letters, digits, underscores, and hyphens"
            )
        return value

    @field_validator("site_name")
    @classmethod
    def validate_site_name_backup(cls, value: str) -> str:
        if not _SITE_NAME_PATTERN.fullmatch(value):
            raise ValueError("site_name contains invalid characters")
        return value


class SiteRestoreRequest(BaseModel):
    """Payload for ``POST /api/operations/site-restore``."""

    bench_name: str = Field(min_length=1)
    site_name: str = Field(min_length=1)
    backup_path: str = Field(min_length=1)
    db_root_password: str = Field(min_length=1)

    @field_validator("bench_name")
    @classmethod
    def validate_bench_name_restore(cls, value: str) -> str:
        if not _BENCH_NAME_PATTERN.fullmatch(value):
            raise ValueError(
                "bench_name may only contain letters, digits, underscores, and hyphens"
            )
        return value

    @field_validator("site_name")
    @classmethod
    def validate_site_name_restore(cls, value: str) -> str:
        if not _SITE_NAME_PATTERN.fullmatch(value):
            raise ValueError("site_name contains invalid characters")
        return value

    @field_validator("backup_path")
    @classmethod
    def validate_backup_path(cls, value: str) -> str:
        if ".." in value or value.startswith("/"):
            raise ValueError("backup_path must be a relative path without '..'")
        return value


def _resolve_parent_dir_under_scan_root(parent_dir: str) -> Path:
    """Resolve ``parent_dir`` to an absolute path confined under the configured scan root."""
    root = get_settings().root_scan_dir.resolve()
    try:
        candidate = Path(parent_dir).expanduser().resolve()
    except (OSError, RuntimeError) as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid parent_dir: {exc}",
        ) from exc
    try:
        candidate.relative_to(root)
    except ValueError as exc:
        raise HTTPException(
            status_code=400,
            detail="parent_dir must resolve under the configured root scan directory",
        ) from exc
    return candidate


def _init_failed_message(step: int, exit_code: int) -> str:
    return f"Step {step} failed with exit code {exit_code}"


def _parse_apps_txt_content(text: str) -> set[str]:
    """Return app names from non-empty, non-comment lines (``sites/apps.txt`` style)."""
    names: set[str] = set()
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        names.add(stripped)
    return names


def _read_sites_apps_txt_sync(bench_path: Path) -> set[str]:
    """Read ``sites/apps.txt`` under ``bench_path``; missing file yields an empty set."""
    path = bench_path / "sites" / "apps.txt"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        return set()
    except (PermissionError, OSError) as exc:
        logger.warning("Could not read bench app list %s: %s", path, exc)
        return set()
    return _parse_apps_txt_content(text)


async def _read_sites_apps_txt(bench_path: Path) -> set[str]:
    return await asyncio.to_thread(_read_sites_apps_txt_sync, bench_path)


def _bench_get_app_command(bench_exe: Path, repo_url: str, branch: str | None) -> list[str]:
    """Build ``bench get-app`` argv; ``--branch`` is added only when ``branch`` is non-empty."""
    cmd: list[str] = [str(bench_exe), "get-app", repo_url]
    branch_arg = (branch or "").strip()
    if branch_arg:
        cmd.extend(["--branch", branch_arg])
    return cmd


def _single_new_app_name(before: set[str], after: set[str]) -> tuple[str | None, str]:
    """
    If exactly one app name was added, return it; otherwise return ``None`` and a short reason.
    """
    added = after - before
    if len(added) == 1:
        return (next(iter(added)), "")
    if len(added) == 0:
        return (None, "no new app entry in sites/apps.txt")
    return (None, f"expected one new app, found {len(added)}: {sorted(added)}")


async def _run_init_pipeline(
    operation_id: str,
    body: InitOperationRequest,
    ws_manager: ConnectionManager,
    bench_exe: Path,
) -> None:
    """
    Sequential setup: ``bench init`` → ``bench new-site`` (stdin for sudo) → ``bench use`` →
    ``get-app`` / ``install-app`` per app (install name from ``sites/apps.txt`` diff) →
    ``bench migrate`` → detached ``bench start`` with completion log.
    """
    parent = _resolve_parent_dir_under_scan_root(body.parent_dir)
    bench_path = parent / body.bench_name

    step = 1
    init_cmd = [
        str(bench_exe),
        "init",
        body.bench_name,
        "--frappe-branch",
        body.frappe_version,
        "--python",
        body.python_version,
    ]
    code = await stream_command(operation_id, init_cmd, parent, ws_manager)
    if code is None:
        return
    if code != 0:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "error", "message": _init_failed_message(step, code)}),
        )
        return

    step = 2
    new_site_cmd = [
        str(bench_exe),
        "new-site",
        body.site_name,
        "--admin-password",
        body.admin_password,
        "--db-root-password",
        body.db_root_password,
    ]
    code = await stream_command(
        operation_id,
        new_site_cmd,
        bench_path,
        ws_manager,
        stdin_input=body.db_root_password,
    )
    if code is None:
        return
    if code != 0:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "error", "message": _init_failed_message(step, code)}),
        )
        return

    step = 3
    use_cmd = [str(bench_exe), "use", body.site_name]
    code = await stream_command(operation_id, use_cmd, bench_path, ws_manager)
    if code is None:
        return
    if code != 0:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "error", "message": _init_failed_message(step, code)}),
        )
        return

    for app in body.apps:
        step += 1
        apps_before = await _read_sites_apps_txt(bench_path)
        get_cmd = _bench_get_app_command(bench_exe, app.repo_url, app.branch)
        code = await stream_command(operation_id, get_cmd, bench_path, ws_manager)
        if code is None:
            return
        if code != 0:
            await ws_manager.send(
                operation_id,
                json.dumps({"type": "error", "message": _init_failed_message(step, code)}),
            )
            return

        apps_after = await _read_sites_apps_txt(bench_path)
        actual_app_name, diff_reason = _single_new_app_name(apps_before, apps_after)
        if actual_app_name is None:
            warn_line = (
                "Warning: could not determine the app name from sites/apps.txt after get-app "
                f"({diff_reason}; hint: {app.name}). Skipping install-app for this app."
            )
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {"type": "log", "line": warn_line, "stream": "stderr"},
                ),
            )
            continue

        step += 1
        install_cmd = [
            str(bench_exe),
            "--site",
            body.site_name,
            "install-app",
            actual_app_name,
        ]
        code = await stream_command(operation_id, install_cmd, bench_path, ws_manager)
        if code is None:
            return
        if code != 0:
            await ws_manager.send(
                operation_id,
                json.dumps({"type": "error", "message": _init_failed_message(step, code)}),
            )
            return

    step += 1
    migrate_cmd = [str(bench_exe), "--site", body.site_name, "migrate"]
    code = await stream_command(operation_id, migrate_cmd, bench_path, ws_manager)
    if code is None:
        return
    if code != 0:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "error", "message": _init_failed_message(step, code)}),
        )
        return

    await ws_manager.send(
        operation_id,
        json.dumps(
            {
                "type": "log",
                "line": "Starting bench (bench start)…",
                "stream": "stdout",
            }
        ),
    )
    try:
        await process.start_bench(bench_path)
    except RuntimeError as exc:
        await ws_manager.send(
            operation_id,
            json.dumps(
                {
                    "type": "error",
                    "message": f"Step {step + 1} failed: {exc}",
                }
            ),
        )
        return

    await ws_manager.send(
        operation_id,
        json.dumps({"type": "done", "exit_code": 0}),
    )


@router.post("/operations/init", response_model=OperationIdResponse)
async def start_bench_init(
    request: Request,
    body: InitOperationRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Start ``bench init`` (and optional follow-up commands) in the background."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/init", body=body.model_dump()
        )
    parent = _resolve_parent_dir_under_scan_root(body.parent_dir)
    target_dir = parent / body.bench_name
    if target_dir.is_dir():
        raise HTTPException(
            status_code=409,
            detail=(
                f"A directory named '{body.bench_name}' already exists in {parent}. "
                "Choose a different bench name."
            ),
        )

    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    async def _task() -> None:
        try:
            await _run_init_pipeline(operation_id, body, ws_manager, bench_exe)
        except Exception:
            logger.exception("Init pipeline failed for operation %s", operation_id)
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "error",
                        "message": "Operation failed unexpectedly on the server",
                    }
                ),
            )

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


@router.post("/operations/get-app", response_model=OperationIdResponse)
async def start_get_app(
    request: Request,
    body: GetAppOperationRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Run ``bench get-app`` inside a discovered bench directory."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/get-app", body=body.model_dump()
        )
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bench_path = await _find_bench_path(body.bench_name)
    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager
    cmd = _bench_get_app_command(bench_exe, body.repo_url, body.branch)

    async def _task() -> None:
        await run_operation(operation_id, cmd, bench_path, ws_manager)

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


@router.post("/operations/new-site", response_model=OperationIdResponse)
async def start_new_site_operation(
    request: Request,
    body: NewSiteOperationRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Run ``bench new-site`` and ``bench install-app`` commands for a bench."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/new-site", body=body.model_dump()
        )
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bench_path = await _find_bench_path(body.bench_name)
    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    async def _task() -> None:
        new_site_cmd = [
            str(bench_exe),
            "new-site",
            body.site_name,
            "--admin-password",
            body.admin_password,
            "--db-root-password",
            body.db_root_password,
        ]
        code = await stream_command(
            operation_id,
            new_site_cmd,
            bench_path,
            ws_manager,
        )
        if code is None:
            return
        if code != 0:
            await ws_manager.send(
                operation_id,
                json.dumps({"type": "done", "exit_code": code}),
            )
            return
        succeeded: list[str] = []
        failed: list[str] = []
        for app_name in body.apps:
            install_cmd = [
                str(bench_exe),
                "--site",
                body.site_name,
                "install-app",
                app_name,
            ]
            code = await stream_command(
                operation_id,
                install_cmd,
                bench_path,
                ws_manager,
            )
            if code is None:
                return
            if code != 0:
                warn = (
                    f"Warning: install-app {app_name} failed with exit code {code}. "
                    "Continuing with remaining apps."
                )
                await ws_manager.send(
                    operation_id,
                    json.dumps({"type": "log", "line": warn, "stream": "stderr"}),
                )
                failed.append(app_name)
                continue
            succeeded.append(app_name)
        migrate_cmd = [str(bench_exe), "--site", body.site_name, "migrate"]
        mig_code = await stream_command(
            operation_id,
            migrate_cmd,
            bench_path,
            ws_manager,
        )
        if mig_code is None:
            return
        summary_line = (
            f"Summary: install-app succeeded={succeeded}, failed={failed}. "
            f"Migrate exit code={mig_code}."
        )
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "log", "line": summary_line, "stream": "stdout"}),
        )
        await ws_manager.send(
            operation_id,
            json.dumps(
                {
                    "type": "done",
                    "exit_code": mig_code,
                    "install_succeeded": succeeded,
                    "install_failed": failed,
                }
            ),
        )

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


@router.post("/operations/install-app", response_model=OperationIdResponse)
async def start_install_app_on_site(
    request: Request,
    body: InstallAppOperationRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Install apps on an existing site, migrate, and restore prior bench run/stop state."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/install-app", body=body.model_dump()
        )
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bench_path = await _find_bench_path(body.bench_name)
    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    async def _task() -> None:
        succeeded: list[str] = []
        failed: list[str] = []
        for app_name in body.apps:
            install_cmd = [
                str(bench_exe),
                "--site",
                body.site_name,
                "install-app",
                app_name,
            ]
            code = await stream_command(
                operation_id,
                install_cmd,
                bench_path,
                ws_manager,
            )
            if code is None:
                return
            if code != 0:
                warn = (
                    f"Warning: install-app {app_name} failed with exit code {code}. "
                    "Continuing with remaining apps."
                )
                await ws_manager.send(
                    operation_id,
                    json.dumps({"type": "log", "line": warn, "stream": "stderr"}),
                )
                failed.append(app_name)
                continue
            succeeded.append(app_name)

        status_before, _ = process.get_bench_status(bench_path)
        started_for_migrate = False
        if status_before == "stopped":
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "log",
                        "line": (
                            "Bench is stopped — starting temporarily to run migrate..."
                        ),
                        "stream": "stdout",
                    }
                ),
            )
            try:
                await process.start_bench(bench_path)
            except RuntimeError as exc:
                await ws_manager.send(
                    operation_id,
                    json.dumps({"type": "error", "message": str(exc)}),
                )
                return
            started_for_migrate = True
            await asyncio.sleep(5)

        async def restore_bench_if_temporarily_started() -> bool:
            """Return ``False`` if stopping the bench failed (error already sent)."""
            if not started_for_migrate:
                return True
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "log",
                        "line": "Restoring bench to stopped state...",
                        "stream": "stdout",
                    }
                ),
            )
            try:
                await process.stop_bench(bench_path)
            except RuntimeError as exc:
                await ws_manager.send(
                    operation_id,
                    json.dumps({"type": "error", "message": str(exc)}),
                )
                return False
            return True

        migrate_cmd = [str(bench_exe), "--site", body.site_name, "migrate"]
        mig_code = await stream_command(
            operation_id,
            migrate_cmd,
            bench_path,
            ws_manager,
        )
        if mig_code is None:
            if not await restore_bench_if_temporarily_started():
                return
            return
        if mig_code != 0:
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "log",
                        "line": f"Migrate failed with exit code {mig_code}.",
                        "stream": "stderr",
                    }
                ),
            )
            if not await restore_bench_if_temporarily_started():
                return
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "done",
                        "exit_code": mig_code,
                        "install_succeeded": succeeded,
                        "install_failed": failed,
                    }
                ),
            )
            return
        if not await restore_bench_if_temporarily_started():
            return
        summary_line = (
            f"Summary: install-app succeeded={succeeded}, failed={failed}. "
            f"Migrate exit code={mig_code}."
        )
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "log", "line": summary_line, "stream": "stdout"}),
        )
        await ws_manager.send(
            operation_id,
            json.dumps(
                {
                    "type": "done",
                    "exit_code": 0,
                    "install_succeeded": succeeded,
                    "install_failed": failed,
                }
            ),
        )

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


@router.post("/operations/bench-update", response_model=OperationIdResponse)
async def start_bench_update(
    request: Request,
    body: BenchUpdateRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Run ``bench update`` inside a discovered bench directory."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/bench-update", body=body.model_dump()
        )
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bench_path = await _find_bench_path(body.bench_name)
    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    cmd: list[str] = [str(bench_exe), "update"]
    if body.reset:
        cmd.append("--reset")
    if body.no_backup:
        cmd.append("--no-backup")

    async def _task() -> None:
        await run_operation(operation_id, cmd, bench_path, ws_manager)

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


@router.post("/operations/site-backup", response_model=OperationIdResponse)
async def start_site_backup(
    request: Request,
    body: SiteBackupRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Run ``bench --site <site> backup`` for a discovered bench."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/site-backup", body=body.model_dump()
        )
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bench_path = await _find_bench_path(body.bench_name)
    site_dir = bench_path / "sites" / body.site_name
    if not site_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Site not found: {body.site_name}")

    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    cmd: list[str] = [str(bench_exe), "--site", body.site_name, "backup"]
    if body.with_files:
        cmd.append("--with-files")

    async def _task() -> None:
        await run_operation(operation_id, cmd, bench_path, ws_manager)

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


@router.post("/operations/site-restore", response_model=OperationIdResponse)
async def start_site_restore(
    request: Request,
    body: SiteRestoreRequest,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Run ``bench --site <site> restore`` for a discovered bench."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "POST", "/api/operations/site-restore", body=body.model_dump()
        )
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    bench_path = await _find_bench_path(body.bench_name)
    site_dir = bench_path / "sites" / body.site_name
    if not site_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Site not found: {body.site_name}")

    backup_file = bench_path / body.backup_path
    if not backup_file.is_file():
        raise HTTPException(
            status_code=404,
            detail=f"Backup file not found: {body.backup_path}",
        )

    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    cmd: list[str] = [
        str(bench_exe),
        "--site",
        body.site_name,
        "restore",
        str(backup_file),
    ]

    async def _task() -> None:
        await run_operation(
            operation_id,
            cmd,
            bench_path,
            ws_manager,
            stdin_input=body.db_root_password,
        )

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)


async def websocket_operation_logs(websocket: WebSocket, operation_id: str) -> None:
    """Subscribe to log lines for a single operation id."""
    server_id = websocket.query_params.get("server", "local")
    if not is_local(server_id):
        await proxy_websocket(
            server_id,
            f"/ws/operations/{operation_id}",
            websocket,
        )
        return

    ws_manager = websocket.app.state.ws_manager
    await ws_manager.connect(websocket, operation_id)
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        ws_manager.disconnect(operation_id)
