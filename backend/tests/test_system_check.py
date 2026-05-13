"""Tests for system readiness probes and config parsing."""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any
from unittest.mock import AsyncMock, MagicMock

import pytest

from services import system_check


class _FakeProcess:
    def __init__(self, returncode: int, stdout: bytes, stderr: bytes) -> None:
        self.returncode = returncode
        self._stdout = stdout
        self._stderr = stderr

    async def communicate(self) -> tuple[bytes, bytes]:
        return self._stdout, self._stderr

    def kill(self) -> None:
        return None

    async def wait(self) -> int:
        return self.returncode


@pytest.mark.asyncio
async def test_run_command_success(monkeypatch: pytest.MonkeyPatch) -> None:
    proc = _FakeProcess(0, b"ok\n", b"")
    monkeypatch.setattr(
        asyncio, "create_subprocess_exec", AsyncMock(return_value=proc)
    )
    result = await system_check._run_command(["echo", "ok"])  # noqa: SLF001
    assert result.ok is True
    assert result.stdout == "ok"


@pytest.mark.asyncio
async def test_collect_report_marks_missing_apt_as_fail(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    original_run_command = system_check._run_command  # noqa: SLF001

    async def fake_run_command(command: list[str]) -> system_check.CommandResult:
        if command[:2] == ["dpkg-query", "-W"] and command[-1] == "git":
            return system_check.CommandResult(1, "", "not installed")
        if command[:2] == ["dpkg-query", "-W"]:
            return system_check.CommandResult(0, "install ok installed", "")
        if command[:2] == ["python3", "-c"]:
            return system_check.CommandResult(0, "3.11", "")
        if command[:2] == ["which", "yarn"]:
            return system_check.CommandResult(0, "/usr/bin/yarn", "")
        if command[:2] == ["which", "bench"]:
            return system_check.CommandResult(0, "/usr/local/bin/bench", "")
        if command[:2] == ["pip3", "show"]:
            return system_check.CommandResult(0, "Name: frappe-bench", "")
        if command[:2] == ["which", "ansible"]:
            return system_check.CommandResult(0, "/usr/bin/ansible", "")
        if command[:3] == ["systemctl", "is-active", "mariadb"]:
            return system_check.CommandResult(0, "active", "")
        if command[:4] == ["redis-cli", "-t", "2", "ping"]:
            return system_check.CommandResult(0, "PONG", "")
        if command[:2] == ["bash", "-lc"]:
            return system_check.CommandResult(0, "v18.20.0", "")
        return await original_run_command(command)

    monkeypatch.setattr(system_check, "_run_command", fake_run_command)
    monkeypatch.setattr(
        Path,
        "read_text",
        MagicMock(
            return_value=(
                "[mysqld]\n"
                "character-set-client-handshake = FALSE\n"
                "character-set-server = utf8mb4\n"
                "collation-server = utf8mb4_unicode_ci\n"
                "[mysql]\n"
                "default-character-set = utf8mb4\n"
            )
        ),
    )
    monkeypatch.setattr(Path, "is_file", MagicMock(return_value=True))

    report = await system_check.collect_system_check_report()
    apt_item = next(item for item in report.items if item.id == "apt_packages")
    assert apt_item.status == "fail"
    assert "git" in apt_item.details
    assert report.ready is False


def test_parse_mariadb_charset_config_present() -> None:
    text = """
    [mysqld]
    character-set-client-handshake = FALSE
    character-set-server = utf8mb4
    collation-server = utf8mb4_unicode_ci
    [mysql]
    default-character-set = utf8mb4
    """
    assert system_check._parse_mariadb_charset_config(text) is True  # noqa: SLF001


def test_parse_mariadb_charset_config_partial() -> None:
    text = """
    [mysqld]
    character-set-server = utf8mb4
    [mysql]
    default-character-set = utf8mb4
    """
    assert system_check._parse_mariadb_charset_config(text) is False  # noqa: SLF001


def test_parse_mariadb_charset_config_absent() -> None:
    assert system_check._parse_mariadb_charset_config("") is False  # noqa: SLF001
