"""Service for collecting system resource metrics via psutil."""

from __future__ import annotations

import asyncio

import psutil

from models.system_analytics import SystemAnalyticsSnapshot


def _collect_snapshot_sync() -> SystemAnalyticsSnapshot:
    """
    Collect system metrics synchronously.

    This is a blocking operation and should be called via asyncio.to_thread
    from async contexts to avoid blocking the event loop.
    """
    cpu_percent = psutil.cpu_percent(interval=None)
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage("/")
    network = psutil.net_io_counters()
    boot_time = psutil.boot_time()
    process_count = len(psutil.pids())

    return SystemAnalyticsSnapshot(
        cpu_percent=cpu_percent,
        memory_used_bytes=memory.used,
        memory_total_bytes=memory.total,
        memory_percent=memory.percent,
        disk_used_bytes=disk.used,
        disk_total_bytes=disk.total,
        disk_percent=disk.percent,
        network_bytes_sent=network.bytes_sent,
        network_bytes_recv=network.bytes_recv,
        boot_time=boot_time,
        process_count=process_count,
    )


async def collect_system_analytics() -> SystemAnalyticsSnapshot:
    """
    Collect a snapshot of current system resource metrics.

    Runs blocking psutil calls in a thread pool to avoid blocking
    the FastAPI event loop.
    """
    return await asyncio.to_thread(_collect_snapshot_sync)
