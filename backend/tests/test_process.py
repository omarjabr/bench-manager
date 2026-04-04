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

    def fake_iter(_attrs: list[str]):
        yield _Proc()

    monkeypatch.setattr(process.psutil, "process_iter", fake_iter)

    status, pid = process.get_bench_status(bench)
    assert status == "running"
    assert pid == 77


def test_get_bench_status_stopped_when_no_supervisor(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """No honcho/foreman process for the bench cwd yields stopped."""
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


@pytest.mark.asyncio
async def test_start_bench_invokes_bench_start(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``start_bench`` launches ``bench start`` with the expected cwd."""
    bench = tmp_path / "bench-d"
    bench.mkdir()

    exec_mock = AsyncMock(return_value=MagicMock())
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_mock)

    await process.start_bench(bench)

    exec_mock.assert_awaited_once()
    args, kwargs = exec_mock.call_args
    assert args[0:2] == ("bench", "start")
    assert kwargs["cwd"] == str(bench.resolve())


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
    wait_mock.assert_called_once()


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
