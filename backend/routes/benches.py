"""Bench discovery and process control routes."""

import asyncio
import json
import logging
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, WebSocket
from starlette.websockets import WebSocketDisconnect

from config import get_settings
from models.bench import BenchDetail, BenchSummary
from services.discovery import get_bench_detail, scan_for_benches
from services import process
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
async def list_benches() -> list[BenchSummary]:
    """Return all discovered benches under the configured scan root."""
    root = get_settings().root_scan_dir
    return await asyncio.to_thread(scan_for_benches, root)


@router.get("/benches/{bench_name}", response_model=BenchDetail)
async def read_bench(bench_name: str) -> BenchDetail:
    """Return detailed metadata for a single bench."""
    bench_path = await _find_bench_path(bench_name)
    return await asyncio.to_thread(get_bench_detail, bench_path)


@router.post("/benches/{bench_name}/start", status_code=204)
async def start_bench(bench_name: str) -> None:
    """Start a bench if it is not already running."""
    bench_path = await _find_bench_path(bench_name)
    status, _pid = process.get_bench_status(bench_path)
    if status == "running":
        raise HTTPException(status_code=409, detail="Bench is already running")
    try:
        await process.start_bench(bench_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/benches/{bench_name}/stop", status_code=204)
async def stop_bench(bench_name: str) -> None:
    """Stop a running bench."""
    bench_path = await _find_bench_path(bench_name)
    status, _pid = process.get_bench_status(bench_path)
    if status != "running":
        raise HTTPException(status_code=409, detail="Bench is not running")
    try:
        await process.stop_bench(bench_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/benches/{bench_name}/restart", status_code=204)
async def restart_bench(bench_name: str) -> None:
    """Restart a bench (stop, wait, then start)."""
    bench_path = await _find_bench_path(bench_name)
    try:
        await process.restart_bench(bench_path)
    except RuntimeError as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
