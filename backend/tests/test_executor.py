"""Unit tests for ``services.executor`` with ``asyncio.create_subprocess_exec`` mocked."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock

import pytest

from services import executor


class _FakeStream:
    """Async stream compatible with chunk-based ``read()`` (mirrors ``asyncio.StreamReader``)."""

    def __init__(self, lines: list[bytes]) -> None:
        self._data = b"".join(lines)
        self._pos = 0

    async def read(self, n: int = -1) -> bytes:
        await asyncio.sleep(0)
        if self._pos >= len(self._data):
            return b""
        if n == -1:
            chunk = self._data[self._pos :]
            self._pos = len(self._data)
            return chunk
        end = min(self._pos + n, len(self._data))
        chunk = self._data[self._pos : end]
        self._pos = end
        return chunk


@pytest.mark.asyncio
async def test_run_operation_streams_logs_and_sends_done(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Stdout/stderr lines are sent as JSON logs, then a final ``done`` message."""
    sent: list[tuple[str, dict[str, object]]] = []

    class _Mgr:
        async def send(self, client_id: str, message: str) -> None:
            sent.append((client_id, json.loads(message)))

    ws_manager = _Mgr()
    proc = MagicMock()
    proc.stdout = _FakeStream([b"hello out\n"])
    proc.stderr = _FakeStream([b"hello err\n"])
    proc.wait = AsyncMock(return_value=0)

    exec_mock = AsyncMock(return_value=proc)
    monkeypatch.setattr(asyncio, "create_subprocess_exec", exec_mock)

    await executor.run_operation(
        "op-1",
        ["/bin/bench", "init", "mybench"],
        Path("/tmp/parent"),
        ws_manager,  # type: ignore[arg-type]
    )

    exec_mock.assert_awaited_once()
    logs = [msg for _cid, msg in sent if msg["type"] == "log"]
    expected_logs = [
        {"type": "log", "line": "hello out", "stream": "stdout"},
        {"type": "log", "line": "hello err", "stream": "stderr"},
    ]
    assert sorted(logs, key=lambda m: (m["stream"], m["line"])) == sorted(
        expected_logs,
        key=lambda m: (m["stream"], m["line"]),
    )
    assert sent[-1][1] == {"type": "done", "exit_code": 0}


@pytest.mark.asyncio
async def test_run_operation_streams_long_line_without_readline_limit_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Output longer than asyncio's default readline buffer must not abort the pump."""
    sent: list[tuple[str, dict[str, object]]] = []

    class _Mgr:
        async def send(self, client_id: str, message: str) -> None:
            sent.append((client_id, json.loads(message)))

    ws_manager = _Mgr()
    long_line = b"x" * 200_000 + b"\n"
    proc = MagicMock()
    proc.stdout = _FakeStream([long_line])
    proc.stderr = _FakeStream([b""])
    proc.wait = AsyncMock(return_value=0)

    monkeypatch.setattr(asyncio, "create_subprocess_exec", AsyncMock(return_value=proc))

    await executor.run_operation(
        "op-long",
        ["/bin/bench", "migrate"],
        Path("/tmp/bench"),
        ws_manager,  # type: ignore[arg-type]
    )

    logs = [msg for _cid, msg in sent if msg["type"] == "log"]
    assert len(logs) == 1
    assert logs[0]["stream"] == "stdout"
    assert len(str(logs[0]["line"])) == 200_000
    assert sent[-1][1] == {"type": "done", "exit_code": 0}


@pytest.mark.asyncio
async def test_run_operation_sends_error_when_subprocess_fails_to_start(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If ``create_subprocess_exec`` raises ``OSError``, an ``error`` frame is sent."""
    sent: list[dict[str, object]] = []

    class _Mgr:
        async def send(self, _client_id: str, message: str) -> None:
            sent.append(json.loads(message))

    ws_manager = _Mgr()

    async def _boom(*_a: object, **_k: object) -> None:
        raise OSError("exec denied")

    monkeypatch.setattr(asyncio, "create_subprocess_exec", _boom)

    await executor.run_operation(
        "op-2",
        ["/missing/bench"],
        Path("/tmp"),
        ws_manager,  # type: ignore[arg-type]
    )

    assert sent == [{"type": "error", "message": "exec denied"}]


def test_create_operation_id_is_short_hex() -> None:
    """``create_operation_id`` returns a 12-char hex string."""
    oid = executor.create_operation_id()
    assert len(oid) == 12
    assert int(oid, 16) >= 0
