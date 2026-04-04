"""Process detection and bench start/stop using psutil and asyncio subprocesses."""

import asyncio
import logging
import shutil
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


def resolve_bench_executable() -> Path:
    """
    Resolve the ``bench`` CLI: ``PATH`` via ``shutil.which``, then ``~/.local/bin/bench``.
    """
    which_path = shutil.which("bench")
    if which_path:
        return Path(which_path).resolve()
    local_bin = Path.home() / ".local" / "bin" / "bench"
    try:
        resolved_local = local_bin.resolve()
    except (OSError, RuntimeError):
        resolved_local = local_bin
    if resolved_local.is_file():
        return resolved_local
    raise RuntimeError(
        "bench command not found in PATH. Make sure bench is installed and accessible."
    )


async def start_bench(bench_path: Path) -> None:
    """Start ``bench start`` with the bench directory as cwd (detached subprocess)."""
    resolved = bench_path.resolve()
    bench_exe = resolve_bench_executable()
    try:
        await asyncio.create_subprocess_exec(
            str(bench_exe),
            "start",
            cwd=str(resolved),
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.DEVNULL,
            start_new_session=True,
        )
    except OSError as exc:
        logger.error("Failed to start bench at %s: %s", resolved, exc)
        raise RuntimeError(f"Failed to start bench at {resolved}: {exc}") from exc


async def stop_bench(bench_path: Path) -> None:
    """Terminate the bench supervisor process tree if it is running."""
    status, pid = get_bench_status(bench_path)
    if status != "running" or pid is None:
        return
    try:
        parent = psutil.Process(pid)
    except psutil.Error as exc:
        raise RuntimeError(
            f"Could not access bench supervisor process (PID {pid}): {exc}"
        ) from exc

    children = parent.children(recursive=True)
    for child in children:
        try:
            child.terminate()
        except psutil.Error:
            continue
    try:
        parent.terminate()
    except psutil.Error as exc:
        raise RuntimeError(f"Could not signal bench supervisor (PID {pid}): {exc}") from exc

    _, alive = psutil.wait_procs(children + [parent], timeout=5)
    for proc in alive:
        try:
            proc.kill()
        except psutil.Error:
            continue

    _, still_alive = psutil.wait_procs(alive, timeout=2)
    for proc in still_alive:
        try:
            if proc.is_running():
                raise RuntimeError(
                    f"Bench process tree still alive after SIGKILL (PID {proc.pid})"
                )
        except psutil.Error as exc:
            raise RuntimeError(
                f"Could not verify bench process termination (PID {getattr(proc, 'pid', '?')}): {exc}"
            ) from exc


async def restart_bench(bench_path: Path) -> None:
    """Stop the bench if running, wait, then start it again."""
    await stop_bench(bench_path)
    await asyncio.sleep(2)
    await start_bench(bench_path)
