"""Unit tests for ``services.process`` with ``psutil`` and subprocess calls mocked."""

from __future__ import annotations

import asyncio
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from services import process


def test_get_bench_status_running_with_honcho(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Detect a running bench when cwd matches and cmdline references honcho."""
    bench = tmp_path / "bench-a"
    bench.mkdir()
    resolved = bench.resolve()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 4242,
                "cwd": str(resolved),
                "cmdline": ["/usr/bin/python", "-m", "honcho", "start"],
            }

        def cwd(self) -> str:
            return str(resolved)

        def cmdline(self) -> list[str]:
            return self.info["cmdline"]

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 4242


def test_get_bench_status_running_with_foreman(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Detect a running bench when cmdline references foreman."""
    bench = tmp_path / "bench-b"
    bench.mkdir()
    resolved = bench.resolve()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 77,
                "cwd": str(resolved),
                "cmdline": ["ruby", "/usr/bin/foreman", "start"],
            }

        def cwd(self) -> str:
            return str(resolved)

        def cmdline(self) -> list[str]:
            return self.info["cmdline"]

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 77


def test_get_bench_status_running_when_cmdline_mentions_bench_path(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """
    Detect running bench even when cwd differs, as long as supervisor cmdline
    references the bench path.
    """
    bench = tmp_path / "bench-cmdline"
    bench.mkdir()
    resolved = bench.resolve()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 8080,
                "cwd": "/tmp",
                "cmdline": [
                    "/usr/bin/python",
                    "-m",
                    "honcho",
                    "start",
                    "-d",
                    str(resolved),
                ],
            }

        def cwd(self) -> str:
            return "/tmp"

        def cmdline(self) -> list[str]:
            return self.info["cmdline"]

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 8080


def test_get_bench_status_running_with_production_gunicorn(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Detect running bench in production mode when gunicorn references bench path."""
    bench = tmp_path / "bench-prod"
    bench.mkdir()
    resolved = bench.resolve()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 5050,
                "cwd": str(resolved),
                "cmdline": [
                    f"{resolved}/env/bin/gunicorn",
                    "-b", "127.0.0.1:8000",
                    "-w", "4",
                    "--chdir", str(resolved),
                    "frappe.app:application",
                ],
            }

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 5050


def test_get_bench_status_running_with_production_redis(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Detect running bench in production mode when redis-server references bench path."""
    bench = tmp_path / "bench-redis-prod"
    bench.mkdir()
    resolved = bench.resolve()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 6060,
                "cwd": "/",
                "cmdline": [
                    "redis-server",
                    f"{resolved}/config/redis_cache.conf",
                ],
            }

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 6060


def test_get_bench_status_stopped_when_no_supervisor(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No honcho/foreman/gunicorn/redis process for the bench cwd yields stopped."""
    bench = tmp_path / "bench-c"
    bench.mkdir()
    resolved = bench.resolve()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 1,
                "cwd": str(resolved),
                "cmdline": ["sleep", "999"],
            }

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "stopped"
    assert pid is None


def test_get_bench_status_stopped_when_worker_references_different_bench(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A gunicorn referencing a different bench path does not match."""
    bench = tmp_path / "bench-mine"
    bench.mkdir()
    other_bench = tmp_path / "bench-other"
    other_bench.mkdir()

    class _Proc:
        def __init__(self) -> None:
            self.info = {
                "pid": 7070,
                "cwd": str(other_bench.resolve()),
                "cmdline": [
                    f"{other_bench.resolve()}/env/bin/gunicorn",
                    "frappe.app:application",
                ],
            }

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "stopped"
    assert pid is None


def test_get_bench_status_running_from_pid_files(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Fallback to bench pid files when supervisor cmdline is not discoverable."""
    bench = tmp_path / "bench-pid-files"
    bench.mkdir()
    pids_dir = bench / "config" / "pids"
    pids_dir.mkdir(parents=True)
    (pids_dir / "redis_cache.pid").write_text("9001", encoding="utf-8")

    def fake_iter(_attrs: list[str]):
        if False:
            yield

    class _Proc:
        def __init__(self) -> None:
            self.pid = 9001

        def is_running(self) -> bool:
            return True

        def status(self) -> str:
            return "running"

        def cwd(self) -> str:
            return str(bench.resolve())

        def cmdline(self) -> list[str]:
            return ["/usr/bin/python", "-m", "redis.server"]

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)
    monkeypatch.setattr(process.psutil, "pid_exists", lambda pid: pid == 9001)
    monkeypatch.setattr(process.psutil, "Process", lambda pid: _Proc())

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 9001


@pytest.mark.asyncio
async def test_start_bench_uses_shutil_which_bench_with_new_session(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``start_bench`` uses ``shutil.which("bench")`` when available."""
    bench = tmp_path / "bench-d"
    bench.mkdir()

    exec_mock = AsyncMock(return_value=MagicMock())
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_mock)
    monkeypatch.setattr(process.shutil, "which", lambda _cmd: "/usr/bin/bench")

    await process.start_bench(bench)

    exec_mock.assert_awaited_once()
    args, kwargs = exec_mock.call_args
    assert args[0:2] == ("/usr/bin/bench", "start")
    assert kwargs["cwd"] == str(bench.resolve())
    assert kwargs.get("start_new_session") is True


@pytest.mark.asyncio
async def test_start_bench_falls_back_to_local_bin_when_which_returns_none(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If ``which("bench")`` is None, use ``~/.local/bin/bench`` when that file exists."""
    bench = tmp_path / "bench-local"
    bench.mkdir()
    monkeypatch.setenv("HOME", str(tmp_path))
    fallback = tmp_path / ".local" / "bin" / "bench"
    fallback.parent.mkdir(parents=True)
    fallback.touch()

    exec_mock = AsyncMock(return_value=MagicMock())
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_mock)
    monkeypatch.setattr(process.shutil, "which", lambda _cmd: None)

    await process.start_bench(bench)

    exec_mock.assert_awaited_once()
    args, _kwargs = exec_mock.call_args
    assert args[0:2] == (str(fallback.resolve()), "start")


@pytest.mark.asyncio
async def test_start_bench_runtime_error_when_bench_not_found(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Raises when ``bench`` is not on PATH and ``~/.local/bin/bench`` is missing."""
    bench = tmp_path / "bench-missing"
    bench.mkdir()
    monkeypatch.setenv("HOME", str(tmp_path))
    monkeypatch.setattr(process.shutil, "which", lambda _cmd: None)

    with pytest.raises(RuntimeError, match="bench command not found in PATH"):
        await process.start_bench(bench)


@pytest.mark.asyncio
async def test_stop_bench_terminates_matching_process_tree(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``stop_bench`` terminates children and parent for the detected PID."""
    bench = tmp_path / "bench-e"
    bench.mkdir()

    child = MagicMock()
    parent = MagicMock()
    parent.children.return_value = [child]
    parent_proc = MagicMock(return_value=parent)
    monkeypatch.setattr(process.psutil, "Process", parent_proc)

    monkeypatch.setattr(process, "get_bench_status", lambda _p: ("running", 99))

    wait_mock = MagicMock(return_value=([], []))
    monkeypatch.setattr(process.psutil, "wait_procs", wait_mock)

    await process.stop_bench(bench)

    child.terminate.assert_called_once()
    parent.terminate.assert_called_once()
    assert wait_mock.call_count == 2


@pytest.mark.asyncio
async def test_stop_bench_sigkill_when_graceful_timeout(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``stop_bench`` sends SIGKILL when processes remain after graceful wait."""
    bench = tmp_path / "bench-kill"
    bench.mkdir()

    stubborn = MagicMock()
    stubborn.is_running.return_value = False
    parent = MagicMock()
    parent.children.return_value = []
    monkeypatch.setattr(process.psutil, "Process", MagicMock(return_value=parent))
    monkeypatch.setattr(process, "get_bench_status", lambda _p: ("running", 100))

    def wait_side_effect(procs, timeout):
        if len(procs) == 1:
            return ([], [stubborn])
        return ([], [])

    wait_mock = MagicMock(side_effect=wait_side_effect)
    monkeypatch.setattr(process.psutil, "wait_procs", wait_mock)

    await process.stop_bench(bench)

    stubborn.kill.assert_called_once()
    assert wait_mock.call_count == 2


@pytest.mark.asyncio
async def test_stop_bench_runtime_error_when_still_running_after_kill(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``stop_bench`` raises when a process remains alive after SIGKILL."""
    bench = tmp_path / "bench-stubborn"
    bench.mkdir()

    stubborn = MagicMock()
    stubborn.pid = 555
    stubborn.is_running.return_value = True
    parent = MagicMock()
    parent.children.return_value = []
    monkeypatch.setattr(process.psutil, "Process", MagicMock(return_value=parent))
    monkeypatch.setattr(process, "get_bench_status", lambda _p: ("running", 101))

    def wait_side_effect(procs, timeout):
        if len(procs) == 1:
            return ([], [stubborn])
        return ([], [stubborn])

    monkeypatch.setattr(process.psutil, "wait_procs", MagicMock(side_effect=wait_side_effect))

    with pytest.raises(RuntimeError, match="still alive"):
        await process.stop_bench(bench)


@pytest.mark.asyncio
async def test_restart_bench_stops_waits_and_starts(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``restart_bench`` chains stop → sleep → start."""
    bench = tmp_path / "bench-f"
    bench.mkdir()

    stop_mock = AsyncMock()
    start_mock = AsyncMock()
    sleep_mock = AsyncMock()

    monkeypatch.setattr(process, "stop_bench", stop_mock)
    monkeypatch.setattr(process, "start_bench", start_mock)
    monkeypatch.setattr(asyncio, "sleep", sleep_mock)

    await process.restart_bench(bench)

    stop_mock.assert_awaited_once_with(bench)
    sleep_mock.assert_awaited_once_with(2)
    start_mock.assert_awaited_once_with(bench)
