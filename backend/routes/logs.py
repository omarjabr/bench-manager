"""Per-site log viewer — list, read, and live-tail bench log files."""

from __future__ import annotations

import asyncio
import logging
import re
from pathlib import Path
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from pydantic import BaseModel
from starlette.websockets import WebSocketDisconnect

from config import get_settings
from services.discovery import scan_for_benches
from services.dispatcher import call_remote, get_server_id, is_local, proxy_websocket

logger = logging.getLogger(__name__)

router = APIRouter(
    prefix="/benches/{bench_name}/sites/{site_name}/logs",
    tags=["logs"],
)

_ALLOWED_LOG_NAMES = re.compile(
    r"^(web|worker|scheduler|frappe|error|migrate)[\w.-]*\.log$"
)

_TAIL_LINE_CAP = 5000


class LogFileInfo(BaseModel):
    """Metadata for a single log file."""

    name: str
    size: int
    modified_at: float


async def _find_bench_path(bench_name: str) -> Path:
    """Resolve a bench directory path from its folder name or raise 404."""
    root = get_settings().root_scan_dir
    summaries = await asyncio.to_thread(scan_for_benches, root)
    match = next((item for item in summaries if item.name == bench_name), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Bench not found: {bench_name}")
    return Path(match.path)


def _resolve_site_dir(bench_path: Path, site_name: str) -> Path:
    """Validate the site directory exists and return its path."""
    site_dir = bench_path / "sites" / site_name
    if not site_dir.is_dir():
        raise HTTPException(status_code=404, detail=f"Site not found: {site_name}")
    return site_dir


def _validate_log_filename(filename: str) -> None:
    """Reject log names that could allow path traversal or unexpected file reads."""
    if "/" in filename or "\\" in filename or ".." in filename:
        raise HTTPException(status_code=400, detail="Invalid log filename")
    if not _ALLOWED_LOG_NAMES.fullmatch(filename):
        raise HTTPException(
            status_code=400,
            detail=f"Log file not in allowlist: {filename}",
        )


def _list_log_files_sync(bench_path: Path) -> list[dict[str, Any]]:
    """Return metadata for each allowed log file under ``<bench>/logs/``."""
    logs_dir = bench_path / "logs"
    if not logs_dir.is_dir():
        return []
    results: list[dict[str, Any]] = []
    try:
        entries = sorted(logs_dir.iterdir())
    except (PermissionError, OSError) as exc:
        logger.debug("Could not list log directory %s: %s", logs_dir, exc)
        return []
    for entry in entries:
        if not entry.is_file():
            continue
        if not _ALLOWED_LOG_NAMES.fullmatch(entry.name):
            continue
        try:
            stat = entry.stat()
            results.append(
                {
                    "name": entry.name,
                    "size": stat.st_size,
                    "modified_at": stat.st_mtime,
                }
            )
        except (PermissionError, OSError):
            continue
    return results


def _tail_log_sync(bench_path: Path, filename: str, lines: int) -> list[str]:
    """Read the last *lines* lines from a log file."""
    log_path = bench_path / "logs" / filename
    if not log_path.is_file():
        raise FileNotFoundError(f"Log file not found: {filename}")
    try:
        text = log_path.read_text(encoding="utf-8", errors="replace")
    except (PermissionError, OSError) as exc:
        raise PermissionError(f"Cannot read {filename}: {exc}") from exc
    all_lines = text.splitlines()
    return all_lines[-lines:]


@router.get("", response_model=list[LogFileInfo])
async def list_log_files(
    bench_name: str,
    site_name: str,
    server_id: str = Depends(get_server_id),
) -> list[LogFileInfo]:
    """List log files in the bench ``logs/`` directory."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "GET",
            f"/api/benches/{bench_name}/sites/{site_name}/logs",
        )
    bench_path = await _find_bench_path(bench_name)
    _resolve_site_dir(bench_path, site_name)
    raw = await asyncio.to_thread(_list_log_files_sync, bench_path)
    return [LogFileInfo(**item) for item in raw]


@router.get("/{filename}")
async def read_log_tail(
    bench_name: str,
    site_name: str,
    filename: str,
    tail: int = Query(default=500, ge=1, le=_TAIL_LINE_CAP),
    server_id: str = Depends(get_server_id),
) -> dict[str, Any]:
    """Return the last *tail* lines from a specific log file."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "GET",
            f"/api/benches/{bench_name}/sites/{site_name}/logs/{filename}",
            params={"tail": tail},
        )
    _validate_log_filename(filename)
    bench_path = await _find_bench_path(bench_name)
    _resolve_site_dir(bench_path, site_name)
    try:
        lines = await asyncio.to_thread(_tail_log_sync, bench_path, filename, tail)
    except FileNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except PermissionError as exc:
        raise HTTPException(status_code=403, detail=str(exc)) from exc
    return {"filename": filename, "lines": lines, "count": len(lines)}


async def websocket_tail_log(
    websocket: WebSocket,
    bench_name: str,
    site_name: str,
    filename: str,
) -> None:
    """Live-tail a log file via ``tail -F`` streamed over WebSocket."""
    server_id = websocket.query_params.get("server", "local")
    if not is_local(server_id):
        await proxy_websocket(
            server_id,
            f"/ws/benches/{bench_name}/sites/{site_name}/logs/{filename}",
            websocket,
        )
        return

    _validate_log_filename(filename)
    bench_path = await _find_bench_path(bench_name)
    _resolve_site_dir(bench_path, site_name)

    log_path = bench_path / "logs" / filename
    if not log_path.is_file():
        await websocket.close(code=4004, reason=f"Log file not found: {filename}")
        return

    await websocket.accept()

    proc: asyncio.subprocess.Process | None = None
    try:
        proc = await asyncio.create_subprocess_exec(
            "tail",
            "-F",
            "-n",
            "200",
            str(log_path),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.DEVNULL,
        )
        stdout = proc.stdout
        if stdout is None:
            await websocket.close(code=4500, reason="Failed to open tail process")
            return

        async def _read_loop() -> None:
            assert stdout is not None
            while True:
                line_bytes = await stdout.readline()
                if not line_bytes:
                    break
                text = line_bytes.decode("utf-8", errors="replace").rstrip("\n\r")
                await websocket.send_text(text)

        async def _recv_loop() -> None:
            while True:
                await websocket.receive_text()

        done, pending = await asyncio.wait(
            [
                asyncio.create_task(_read_loop()),
                asyncio.create_task(_recv_loop()),
            ],
            return_when=asyncio.FIRST_COMPLETED,
        )
        for task in pending:
            task.cancel()
    except WebSocketDisconnect:
        pass
    except Exception:
        logger.exception("Log tail WebSocket error for %s/%s", bench_name, filename)
    finally:
        if proc is not None:
            try:
                proc.terminate()
                await proc.wait()
            except ProcessLookupError:
                pass
