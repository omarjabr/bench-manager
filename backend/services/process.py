"""Process detection and bench start/stop using psutil and asyncio subprocesses."""

import asyncio
import logging
import shutil
from pathlib import Path

import psutil

from models.bench import BenchStatus

logger = logging.getLogger(__name__)


def _process_matches_bench(proc: psutil.Process, bench_path: Path) -> bool:
    """Return True when process cwd or command line references this bench."""
    try:
        cwd = proc.cwd()
        try:
            if Path(cwd).resolve() == bench_path:
                return True
        except (OSError, RuntimeError):
            pass
    except (psutil.Error, OSError, PermissionError):
        pass

    try:
        cmdline = " ".join(proc.cmdline()).lower()
    except (psutil.Error, OSError, PermissionError):
        return False
    return str(bench_path).lower() in cmdline


def _running_pid_from_bench_pid_files(bench_path: Path) -> int | None:
    """
    Return a live process PID from ``config/pids/*.pid`` for this bench, if any.

    Bench-managed PID files are a reliable fallback when supervisor command lines
    do not include ``honcho``/``foreman``.
    """
    pids_dir = bench_path / "config" / "pids"
    if not pids_dir.is_dir():
        return None

    for pid_file in sorted(pids_dir.glob("*.pid")):
        try:
            raw = pid_file.read_text(encoding="utf-8").strip()
            pid = int(raw)
            if pid <= 0:
                continue
        except (FileNotFoundError, PermissionError, OSError, ValueError):
            continue

        if not psutil.pid_exists(pid):
            continue

        try:
            proc = psutil.Process(pid)
            if not proc.is_running():
                continue
            if proc.status() == psutil.STATUS_ZOMBIE:
                continue
            if _process_matches_bench(proc, bench_path):
                return pid
        except (psutil.Error, OSError, PermissionError):
            continue

    return None


_DEV_SUPERVISOR_MARKERS = ("honcho", "foreman")

_PRODUCTION_WORKER_MARKERS = ("gunicorn", "redis-server", "node")


def _bench_path_in_cmdline(bench_str_lower: str, joined_cmdline: str) -> bool:
    """Return True when the resolved bench path string appears in the joined cmdline."""
    return bench_str_lower in joined_cmdline


def _is_dev_supervisor(joined: str) -> bool:
    """Check if cmdline indicates a development-mode process manager."""
    for marker in _DEV_SUPERVISOR_MARKERS:
        if marker in joined:
            return True
    if "bench start" in joined:
        return True
    return False


def _is_production_worker(joined: str) -> bool:
    """Check if cmdline indicates a typical bench production worker."""
    for marker in _PRODUCTION_WORKER_MARKERS:
        if marker in joined:
            return True
    return False


def _matches_bench_from_info(
    proc_info: dict[str, object],
    resolved_bench: Path,
    bench_str_lower: str,
) -> bool:
    """
    Determine if a process belongs to a bench using pre-fetched process_iter info.

    Avoids re-reading /proc which can fail with permission errors for processes
    owned by the same user on some configurations.
    """
    cwd = proc_info.get("cwd")
    if isinstance(cwd, str) and cwd:
        try:
            if Path(cwd).resolve() == resolved_bench:
                return True
        except (OSError, RuntimeError):
            pass

    cmdline = proc_info.get("cmdline") or []
    if isinstance(cmdline, list):
        joined = " ".join(str(c) for c in cmdline).lower()
        if bench_str_lower in joined:
            return True

    return False


def get_bench_status(bench_path: Path) -> tuple[BenchStatus, int | None]:
    """
    Return whether a bench appears to be running and its PID if found.

    Checks both development mode (honcho/foreman via ``bench start``) and production
    mode (gunicorn/redis-server/node workers managed by supervisor or systemd).
    """
    try:
        resolved_bench = bench_path.resolve()
    except (OSError, RuntimeError):
        return ("unknown", None)

    bench_str_lower = str(resolved_bench).lower()
    dev_pid: int | None = None
    production_pid: int | None = None

    for proc in psutil.process_iter(["pid", "cwd", "cmdline"]):
        try:
            cmdline = proc.info.get("cmdline") or []
            if not isinstance(cmdline, list):
                continue
            joined = " ".join(str(c) for c in cmdline).lower()

            if not _is_dev_supervisor(joined) and not _is_production_worker(joined):
                continue

            if not _matches_bench_from_info(proc.info, resolved_bench, bench_str_lower):
                continue

            pid = proc.info.get("pid")
            if not isinstance(pid, int):
                continue

            if _is_dev_supervisor(joined):
                dev_pid = pid
                break
            if production_pid is None and _is_production_worker(joined):
                production_pid = pid
        except (psutil.Error, OSError, PermissionError):
            continue

    if dev_pid is not None:
        return ("running", dev_pid)
    if production_pid is not None:
        return ("running", production_pid)

    pid_from_files = _running_pid_from_bench_pid_files(resolved_bench)
    if pid_from_files is not None:
        return ("running", pid_from_files)

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
