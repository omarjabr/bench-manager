"""Tests for ``routes.logs`` — log listing and path whitelist."""

from __future__ import annotations

import re

import pytest
from fastapi import HTTPException

from routes.logs import (
    _ALLOWED_LOG_NAMES,
    _list_log_files_sync,
    _tail_log_sync,
    _validate_log_filename,
)
from pathlib import Path


class TestAllowedLogNames:
    """Verify the regex allows expected log names and blocks traversal attempts."""

    @pytest.mark.parametrize(
        "name",
        [
            "web.log",
            "worker.log",
            "scheduler.log",
            "frappe.log",
            "error.log",
            "migrate.log",
            "worker.error.log",
        ],
    )
    def test_allows_valid_log_names(self, name: str) -> None:
        assert _ALLOWED_LOG_NAMES.fullmatch(name) is not None

    @pytest.mark.parametrize(
        "name",
        [
            "../../../etc/passwd",
            "/etc/shadow",
            "foo.txt",
            ".hidden.log",
            "nope",
            "web.log.bak",
        ],
    )
    def test_rejects_invalid_names(self, name: str) -> None:
        assert _ALLOWED_LOG_NAMES.fullmatch(name) is None


class TestValidateLogFilename:
    def test_rejects_path_traversal(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_log_filename("../../etc/passwd")
        assert exc_info.value.status_code == 400

    def test_rejects_absolute_path(self) -> None:
        with pytest.raises(HTTPException):
            _validate_log_filename("/var/log/syslog")

    def test_rejects_backslash(self) -> None:
        with pytest.raises(HTTPException):
            _validate_log_filename("..\\..\\windows\\system32")

    def test_accepts_valid_name(self) -> None:
        _validate_log_filename("web.log")


class TestListLogFilesSync:
    def test_returns_metadata_for_allowed_files(self, tmp_path: Path) -> None:
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        (logs_dir / "web.log").write_text("line1\nline2\n")
        (logs_dir / "scheduler.log").write_text("abc\n")
        (logs_dir / "random.txt").write_text("hidden")

        result = _list_log_files_sync(tmp_path)
        names = {item["name"] for item in result}

        assert "web.log" in names
        assert "scheduler.log" in names
        assert "random.txt" not in names

    def test_returns_empty_when_no_logs_dir(self, tmp_path: Path) -> None:
        assert _list_log_files_sync(tmp_path) == []


class TestTailLogSync:
    def test_returns_last_n_lines(self, tmp_path: Path) -> None:
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()
        lines = [f"line-{i}" for i in range(20)]
        (logs_dir / "web.log").write_text("\n".join(lines))

        result = _tail_log_sync(tmp_path, "web.log", 5)
        assert len(result) == 5
        assert result[-1] == "line-19"

    def test_raises_for_missing_file(self, tmp_path: Path) -> None:
        logs_dir = tmp_path / "logs"
        logs_dir.mkdir()

        with pytest.raises(FileNotFoundError):
            _tail_log_sync(tmp_path, "missing.log", 10)
