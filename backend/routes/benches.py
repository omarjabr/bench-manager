"""Bench discovery and process control routes."""

import asyncio
from pathlib import Path

from fastapi import APIRouter, HTTPException

from config import get_settings
from models.bench import BenchDetail, BenchSummary
from services.discovery import get_bench_detail, scan_for_benches
from services import process

router = APIRouter(tags=["benches"])


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
    await process.start_bench(bench_path)


@router.post("/benches/{bench_name}/stop", status_code=204)
async def stop_bench(bench_name: str) -> None:
    """Stop a running bench."""
    bench_path = await _find_bench_path(bench_name)
    status, _pid = process.get_bench_status(bench_path)
    if status != "running":
        raise HTTPException(status_code=409, detail="Bench is not running")
    await process.stop_bench(bench_path)


@router.post("/benches/{bench_name}/restart", status_code=204)
async def restart_bench(bench_name: str) -> None:
    """Restart a bench (stop, wait, then start)."""
    bench_path = await _find_bench_path(bench_name)
    await process.restart_bench(bench_path)
