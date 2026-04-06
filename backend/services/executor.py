"""Async subprocess execution with WebSocket log streaming for long-running bench operations."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from pathlib import Path

from ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

# Subprocess tools may print long progress without newlines; asyncio readline() caps each
# "line" (~64KiB) and raises LimitOverrunError. We buffer reads and split on newlines instead.
_PUMP_CHUNK = 65536
_PUMP_MAX_BUFFER = 2 * 1024 * 1024


async def _pump_subprocess_stream(
    stream: asyncio.StreamReader,
    stream_name: str,
    operation_id: str,
    ws_manager: ConnectionManager,
) -> None:
    buffer = bytearray()
    while True:
        chunk = await stream.read(_PUMP_CHUNK)
        if not chunk:
            break
        buffer.extend(chunk)
        while True:
            newline = buffer.find(b"\n")
            if newline == -1:
                break
            raw_line = buffer[:newline]
            del buffer[: newline + 1]
            text = raw_line.decode("utf-8", errors="replace").rstrip("\r")
            await ws_manager.send(
                operation_id,
                json.dumps({"type": "log", "line": text, "stream": stream_name}),
            )
        if len(buffer) > _PUMP_MAX_BUFFER:
            overflow = bytes(buffer[:_PUMP_MAX_BUFFER])
            del buffer[:_PUMP_MAX_BUFFER]
            text = overflow.decode("utf-8", errors="replace").rstrip("\r\n")
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "log",
                        "line": f"{text}…",
                        "stream": stream_name,
                    }
                ),
            )

    if buffer:
        text = bytes(buffer).decode("utf-8", errors="replace").rstrip("\r\n")
        if text:
            await ws_manager.send(
                operation_id,
                json.dumps({"type": "log", "line": text, "stream": stream_name}),
            )


async def stream_command(
    operation_id: str,
    cmd: list[str],
    cwd: Path,
    ws_manager: ConnectionManager,
    stdin_input: str | None = None,
) -> int | None:
    """
    Run ``cmd`` under ``cwd``, streaming each stdout/stderr line to the WebSocket client.

    When ``stdin_input`` is set, the subprocess stdin is a pipe and the text (plus a newline)
    is written after the process starts (e.g. answering a sudo password prompt).

    Returns the process exit code, or ``None`` if the process failed to start (an ``error``
    message is already sent). Does **not** send a ``done`` message — callers orchestrating
    multi-step flows must send it once at the end of the pipeline.
    """
    exec_kwargs: dict[str, object] = {
        "cwd": str(cwd),
        "stdout": asyncio.subprocess.PIPE,
        "stderr": asyncio.subprocess.PIPE,
    }
    if stdin_input is not None:
        exec_kwargs["stdin"] = asyncio.subprocess.PIPE
    try:
        proc = await asyncio.create_subprocess_exec(*cmd, **exec_kwargs)
    except OSError as exc:
        logger.warning("Failed to start subprocess %s: %s", cmd, exc)
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "error", "message": str(exc)}),
        )
        return None

    if stdin_input is not None:
        stdin_wr = proc.stdin
        if stdin_wr is None:
            await ws_manager.send(
                operation_id,
                json.dumps(
                    {
                        "type": "error",
                        "message": "subprocess stdin is unavailable",
                    }
                ),
            )
            return None
        stdin_wr.write(f"{stdin_input}\n".encode())
        await stdin_wr.drain()
        stdin_wr.close()
        await stdin_wr.wait_closed()

    stdout = proc.stdout
    stderr = proc.stderr
    if stdout is None or stderr is None:
        await ws_manager.send(
            operation_id,
            json.dumps(
                {
                    "type": "error",
                    "message": "subprocess streams are unavailable",
                }
            ),
        )
        return None

    await asyncio.gather(
        _pump_subprocess_stream(stdout, "stdout", operation_id, ws_manager),
        _pump_subprocess_stream(stderr, "stderr", operation_id, ws_manager),
    )
    exit_code = await proc.wait()
    return int(exit_code)


async def run_operation(
    operation_id: str,
    cmd: list[str],
    cwd: Path,
    ws_manager: ConnectionManager,
    stdin_input: str | None = None,
) -> None:
    """
    Run a single command and stream logs; when the process finishes, send ``done`` or only
    ``error`` if the process failed to start.
    """
    code = await stream_command(
        operation_id, cmd, cwd, ws_manager, stdin_input=stdin_input
    )
    if code is None:
        return
    await ws_manager.send(
        operation_id,
        json.dumps({"type": "done", "exit_code": code}),
    )


def create_operation_id() -> str:
    """Return a short unique id for correlating REST calls with a WebSocket subscription."""
    return uuid.uuid4().hex[:12]
