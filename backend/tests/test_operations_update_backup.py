"""Tests for bench-update, site-backup, and site-restore request model validation."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from routes.operations import (
    BenchUpdateRequest,
    SiteBackupRequest,
    SiteRestoreRequest,
)


class TestBenchUpdateRequest:
    def test_accepts_valid_payload(self) -> None:
        body = BenchUpdateRequest(bench_name="my-bench", reset=True, no_backup=False)
        assert body.bench_name == "my-bench"
        assert body.reset is True

    def test_defaults_are_false(self) -> None:
        body = BenchUpdateRequest(bench_name="bench1")
        assert body.reset is False
        assert body.no_backup is False

    def test_rejects_invalid_bench_name(self) -> None:
        with pytest.raises(ValidationError):
            BenchUpdateRequest(bench_name="bad name!")

    def test_rejects_empty_bench_name(self) -> None:
        with pytest.raises(ValidationError):
            BenchUpdateRequest(bench_name="")


class TestSiteBackupRequest:
    def test_accepts_valid_payload(self) -> None:
        body = SiteBackupRequest(
            bench_name="my-bench",
            site_name="mysite.localhost",
            with_files=True,
        )
        assert body.bench_name == "my-bench"
        assert body.site_name == "mysite.localhost"
        assert body.with_files is True

    def test_defaults_with_files_false(self) -> None:
        body = SiteBackupRequest(bench_name="b", site_name="s.localhost")
        assert body.with_files is False

    def test_rejects_invalid_bench_name(self) -> None:
        with pytest.raises(ValidationError):
            SiteBackupRequest(bench_name="bad name", site_name="s.localhost")

    def test_rejects_invalid_site_name(self) -> None:
        with pytest.raises(ValidationError):
            SiteBackupRequest(bench_name="bench", site_name="../../etc")


class TestSiteRestoreRequest:
    def test_accepts_valid_payload(self) -> None:
        body = SiteRestoreRequest(
            bench_name="my-bench",
            site_name="mysite.localhost",
            backup_path="sites/mysite.localhost/private/backups/20240101_120000-mysite-database.sql.gz",
            db_root_password="rootpw",
        )
        assert body.bench_name == "my-bench"
        assert body.backup_path.endswith(".sql.gz")

    def test_rejects_absolute_backup_path(self) -> None:
        with pytest.raises(ValidationError):
            SiteRestoreRequest(
                bench_name="b",
                site_name="s.localhost",
                backup_path="/etc/passwd",
                db_root_password="pw",
            )

    def test_rejects_path_traversal_in_backup(self) -> None:
        with pytest.raises(ValidationError):
            SiteRestoreRequest(
                bench_name="b",
                site_name="s.localhost",
                backup_path="../../../etc/passwd",
                db_root_password="pw",
            )

    def test_rejects_empty_db_root_password(self) -> None:
        with pytest.raises(ValidationError):
            SiteRestoreRequest(
                bench_name="b",
                site_name="s.localhost",
                backup_path="backups/file.sql.gz",
                db_root_password="",
            )
