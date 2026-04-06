"""Tests for ``routes.operations`` request models (bench init payload)."""

from __future__ import annotations

from pathlib import Path
from unittest.mock import MagicMock

import pytest
from fastapi import HTTPException
from pydantic import ValidationError

from routes.operations import (
    InitOperationRequest,
    start_bench_init,
    _bench_get_app_command,
    _parse_apps_txt_content,
    _single_new_app_name,
)


def test_init_operation_request_accepts_full_payload() -> None:
    """Mandatory site fields and apps list are accepted."""
    body = InitOperationRequest(
        bench_name="my-bench",
        parent_dir="/home/dev",
        frappe_version="version-15",
        site_name="mysite.localhost",
        admin_password="password123",
        db_root_password="secret",
        apps=[{"name": "erpnext", "repo_url": "https://github.com/frappe/erpnext"}],
    )
    assert body.bench_name == "my-bench"
    assert body.site_name == "mysite.localhost"
    assert body.db_root_password == "secret"
    assert body.python_version == "python3.11"


def test_init_operation_request_python_version_override() -> None:
    body = InitOperationRequest(
        bench_name="b",
        parent_dir="/home/dev",
        frappe_version="version-15",
        site_name="a.localhost",
        admin_password="password12",
        db_root_password="x",
        python_version="/usr/bin/python3.12",
    )
    assert body.python_version == "/usr/bin/python3.12"


def test_init_operation_request_rejects_unsafe_python_version() -> None:
    with pytest.raises(ValidationError):
        InitOperationRequest(
            bench_name="b",
            parent_dir="/home/dev",
            frappe_version="version-15",
            site_name="a.localhost",
            admin_password="password12",
            db_root_password="x",
            python_version="python3; rm -rf /",
        )


def test_init_operation_request_allows_empty_db_root_password() -> None:
    """Local MariaDB may use an empty root password."""
    body = InitOperationRequest(
        bench_name="b",
        parent_dir="/home/dev",
        frappe_version="version-15",
        site_name="x.localhost",
        admin_password="password12",
        db_root_password="",
    )
    assert body.db_root_password == ""


def test_init_operation_request_rejects_invalid_bench_name() -> None:
    with pytest.raises(ValidationError):
        InitOperationRequest(
            bench_name="bad name",
            parent_dir="/home/dev",
            frappe_version="version-15",
            site_name="a.localhost",
            admin_password="password12",
            db_root_password="x",
        )


def test_init_operation_request_rejects_short_admin_password() -> None:
    with pytest.raises(ValidationError):
        InitOperationRequest(
            bench_name="b",
            parent_dir="/home/dev",
            frappe_version="version-15",
            site_name="a.localhost",
            admin_password="short",
            db_root_password="x",
        )


def test_init_operation_request_rejects_uppercase_site_name() -> None:
    with pytest.raises(ValidationError):
        InitOperationRequest(
            bench_name="b",
            parent_dir="/home/dev",
            frappe_version="version-15",
            site_name="Site.localhost",
            admin_password="password12",
            db_root_password="x",
        )


def test_bench_get_app_command_adds_branch_only_when_non_empty() -> None:
    """``_bench_get_app_command`` mirrors get-app / init ``--branch`` behavior."""
    exe = Path("/usr/bin/bench")
    repo = "https://github.com/frappe/erpnext"
    assert _bench_get_app_command(exe, repo, "version-15") == [
        str(exe),
        "get-app",
        repo,
        "--branch",
        "version-15",
    ]
    assert _bench_get_app_command(exe, repo, None) == [str(exe), "get-app", repo]
    assert _bench_get_app_command(exe, repo, "") == [str(exe), "get-app", repo]
    assert _bench_get_app_command(exe, repo, "   ") == [str(exe), "get-app", repo]


def test_parse_apps_txt_content_skips_comments_and_blank() -> None:
    text = "frappe\n\n# skip\nerpnext\n"
    assert _parse_apps_txt_content(text) == {"frappe", "erpnext"}


def test_single_new_app_name_one_added() -> None:
    name, reason = _single_new_app_name({"frappe"}, {"frappe", "erpnext"})
    assert name == "erpnext"
    assert reason == ""


def test_single_new_app_name_none_added() -> None:
    name, reason = _single_new_app_name({"a"}, {"a"})
    assert name is None
    assert "no new app" in reason


def test_single_new_app_name_multiple_added() -> None:
    name, reason = _single_new_app_name(set(), {"a", "b"})
    assert name is None
    assert "expected one new app" in reason


@pytest.mark.asyncio
async def test_init_returns_409_when_bench_directory_already_exists(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``POST /api/operations/init`` rejects when ``parent_dir/bench_name`` exists."""
    parent = tmp_path / "projects"
    parent.mkdir()
    (parent / "existing-bench").mkdir()

    class _Settings:
        root_scan_dir = tmp_path.resolve()

    monkeypatch.setattr("routes.operations.get_settings", lambda: _Settings())

    request = MagicMock()
    body = InitOperationRequest(
        bench_name="existing-bench",
        parent_dir=str(parent.resolve()),
        frappe_version="version-15",
        site_name="mysite.localhost",
        admin_password="password123",
        db_root_password="secret12",
        apps=[],
        python_version="python3.11",
    )

    with pytest.raises(HTTPException) as exc_info:
        await start_bench_init(request, body)
    assert exc_info.value.status_code == 409
    detail = str(exc_info.value.detail)
    assert "already exists" in detail
    assert "existing-bench" in detail
