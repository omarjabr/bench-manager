"""Process detection and bench start/stop using psutil and asyncio subprocesses."""

import asyncio
import logging
from pathlib import Path

import psutil

from models.bench import BenchStatus

logger = logging.getLogger(__name__)


def get_bench_status(bench_path: Path) -> tuple[BenchStatus, int | None]:
    """
    Return whether a bench supervisor appears to be running and its PID if found.

    A process counts as the bench supervisor when its cwd matches ``bench_path`` and its
    command line mentions ``honcho`` or ``foreman`` (typical for ``bench start``).
    """
    try:
        resolved_bench = bench_path.resolve()
    except (OSError, RuntimeError):
        return ("unknown", None)

    for proc in psutil.process_iter(["pid", "cwd", "cmdline"]):
        try:
            cwd = proc.info.get("cwd")
            if cwd is None:
                continue
            try:
                resolved_cwd = Path(cwd).resolve()
            except (OSError, RuntimeError):
                continue
            if resolved_cwd != resolved_bench:
                continue
            cmdline = proc.info.get("cmdline") or []
            joined = " ".join(cmdline).lower()
            if "honcho" in joined or "foreman" in joined:
                pid = proc.info.get("pid")
                if isinstance(pid, int):
                    return ("running", pid)
        except (psutil.Error, OSError, PermissionError):
            continue

    return ("stopped", None)


async def start_bench(bench_path: Path) -> None:
    """Start ``bench start`` in the bench directory as a detached subprocess."""
    try:
        await asyncio.create_subprocess_exec(
            "bench",
            "start",
            cwd=str(bench_path.resolve()),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as exc:
        logger.error("Failed to start bench at %s: %s", bench_path, exc)
        raise


async def stop_bench(bench_path: Path) -> None:
    """Terminate the bench supervisor process tree if it is running."""
    status, pid = get_bench_status(bench_path)
    if status != "running" or pid is None:
        return
    try:
        parent = psutil.Process(pid)
    except psutil.Error:
        return
    children = parent.children(recursive=True)
    for child in children:
        try:
            child.terminate()
        except psutil.Error:
            continue
    try:
        parent.terminate()
    except psutil.Error:
        return
    gone, alive = psutil.wait_procs(children + [parent], timeout=5)
    for p in alive:
        try:
            p.kill()
        except psutil.Error:
            continue


async def restart_bench(bench_path: Path) -> None:
    """Stop the bench if running, wait, then start it again."""
    await stop_bench(bench_path)
    await asyncio.sleep(2)
    await start_bench(bench_path)
