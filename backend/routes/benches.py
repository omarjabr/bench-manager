"""Bench discovery and process control routes."""

import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Query, WebSocket
from pydantic import BaseModel
from starlette.websockets import WebSocketDisconnect

from config import get_settings
from models.bench import BenchDetail, BenchSummary
from services.discovery import get_bench_detail, scan_for_benches
from services import process
from services.dispatcher import call_remote, get_server_id, is_local, proxy_websocket
from ws.manager import connection_manager

logger = logging.getLogger(__name__)

router = APIRouter(tags=["benches"])


def _poll_bench_rows() -> list[dict[str, object]]:
    """Run in a worker thread: discover benches and collect live status + pid per bench."""
    root = get_settings().root_scan_dir
    summaries = scan_for_benches(root)
    rows: list[dict[str, object]] = []
    for s in summaries:
        status, pid = process.get_bench_status(Path(s.path))
        rows.append({"name": s.name, "status": status, "pid": pid})
    return rows


async def websocket_bench_status(websocket: WebSocket) -> None:
    """
    Each subscriber runs a background poll loop that broadcasts status snapshots
    to every connected client every five seconds until this connection closes.
    """
    server_id = websocket.query_params.get("server", "local")
    if not is_local(server_id):
        await proxy_websocket(server_id, "/ws/benches", websocket)
        return

    client_id = str(uuid.uuid4())
    await connection_manager.connect(websocket, client_id)

    async def poll_loop() -> None:
        while True:
            try:
                rows = await asyncio.to_thread(_poll_bench_rows)
                await connection_manager.broadcast(json.dumps({"benches": rows}))
            except asyncio.CancelledError:
                raise
            except Exception:
                logger.exception("Bench status WebSocket poll failed")
            await asyncio.sleep(5)

    poll_task = asyncio.create_task(poll_loop())
    try:
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        pass
    finally:
        poll_task.cancel()
        try:
            await poll_task
        except asyncio.CancelledError:
            pass
        connection_manager.disconnect(client_id)


async def _find_bench_path(bench_name: str) -> Path:
    """Resolve a bench directory path from its folder name or raise 404."""
    root = get_settings().root_scan_dir
    summaries = await asyncio.to_thread(scan_for_benches, root)
    match = next((item for item in summaries if item.name == bench_name), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Bench not found: {bench_name}")
    return Path(match.path)


@router.get("/benches", response_model=list[BenchSummary])
async def list_benches(
    server_id: str = Depends(get_server_id),
) -> list[BenchSummary]:
    """Return all discovered benches under the configured scan root."""
    if not is_local(server_id):
        return await call_remote(server_id, "GET", "/api/benches")
    root = get_settings().root_scan_dir
    return await asyncio.to_thread(scan_for_benches, root)


@router.get("/benches/{bench_name}", response_model=BenchDetail)
async def read_bench(
    bench_name: str,
    server_id: str = Depends(get_server_id),
) -> BenchDetail:
    """Return detailed metadata for a single bench."""
    if not is_local(server_id):
        return await call_remote(server_id, "GET", f"/api/benches/{bench_name}")
    bench_path = await _find_bench_path(bench_name)
    return await asyncio.to_thread(get_bench_detail, bench_path)


@router.post("/benches/{bench_name}/start", status_code=204)
async def start_bench(
    bench_name: str,
    server_id: str = Depends(get_server_id),
) -> None:
    """Start a bench if it is not already running."""
    if not is_local(server_id):
        await call_remote(server_id, "POST", f"/api/benches/{bench_name}/start")
        return
    bench_path = await _find_bench_path(bench_name)
    status, _pid = process.get_bench_status(bench_path)
    if status == "running":
        raise HTTPException(status_code=409, detail="Bench is already running")
    try:
        await process.start_bench(bench_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/benches/{bench_name}/stop", status_code=204)
async def stop_bench(
    bench_name: str,
    server_id: str = Depends(get_server_id),
) -> None:
    """Stop a running bench."""
    if not is_local(server_id):
        await call_remote(server_id, "POST", f"/api/benches/{bench_name}/stop")
        return
    bench_path = await _find_bench_path(bench_name)
    status, _pid = process.get_bench_status(bench_path)
    if status != "running":
        raise HTTPException(status_code=409, detail="Bench is not running")
    try:
        await process.stop_bench(bench_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/benches/{bench_name}/restart", status_code=204)
async def restart_bench(
    bench_name: str,
    server_id: str = Depends(get_server_id),
) -> None:
    """Restart a bench (stop, wait, then start)."""
    if not is_local(server_id):
        await call_remote(server_id, "POST", f"/api/benches/{bench_name}/restart")
        return
    bench_path = await _find_bench_path(bench_name)
    try:
        await process.restart_bench(bench_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


class FileEntry(BaseModel):
    """A single file or directory entry for the file explorer."""

    name: str
    type: str
    size: int
    mtime: float


class FileListResponse(BaseModel):
    """Response for a directory listing request."""

    path: str
    entries: list[FileEntry]


def _list_directory(bench_path: Path, relative_path: str) -> FileListResponse:
    """List files and directories under bench_path/sites at the given relative path.

    Only allows navigation within the ``sites/`` subtree to prevent
    exposing sensitive files like database credentials.
    """
    sites_root = bench_path / "sites"
    if not sites_root.is_dir():
        return FileListResponse(path=relative_path, entries=[])

    if relative_path in ("", "."):
        target = sites_root
    else:
        target = (sites_root / relative_path).resolve()

    resolved_root = sites_root.resolve()
    if not str(target).startswith(str(resolved_root)):
        raise HTTPException(
            status_code=400,
            detail="Path traversal is not allowed.",
        )

    if not target.is_dir():
        raise HTTPException(status_code=404, detail="Directory not found.")

    entries: list[FileEntry] = []
    try:
        for item in sorted(target.iterdir(), key=lambda p: (p.is_file(), p.name.lower())):
            if item.name == "assets" and item.parent == resolved_root:
                continue
            try:
                stat = item.stat()
                entries.append(FileEntry(
                    name=item.name,
                    type="directory" if item.is_dir() else "file",
                    size=stat.st_size if item.is_file() else 0,
                    mtime=stat.st_mtime,
                ))
            except (OSError, PermissionError):
                continue
    except (OSError, PermissionError):
        raise HTTPException(status_code=403, detail="Cannot read directory.")

    return FileListResponse(path=relative_path, entries=entries)


@router.get("/benches/{bench_name}/files", response_model=FileListResponse)
async def list_bench_files(
    bench_name: str,
    path: str = Query(default="", alias="path"),
    server_id: str = Depends(get_server_id),
) -> FileListResponse:
    """List files and folders within a bench's sites directory."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "GET",
            f"/api/benches/{bench_name}/files",
            params={"path": path},
        )
    bench_path = await _find_bench_path(bench_name)
    return await asyncio.to_thread(_list_directory, bench_path, path)
