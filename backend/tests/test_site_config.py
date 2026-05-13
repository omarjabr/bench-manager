"""Tests for ``routes.site_config`` — allowlist editing and atomic write."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import pytest
from fastapi import HTTPException

from routes.site_config import (
    EDITABLE_KEYS,
    EDITABLE_NESTED_KEYS,
    READONLY_KEYS,
    _merge_and_write_config_sync,
    _read_site_config_sync,
    _split_config,
    _validate_update_keys,
)


@pytest.fixture
def site_dir(tmp_path: Path) -> Path:
    """Create a temp directory that acts as a site dir with a config file."""
    cfg: dict[str, Any] = {
        "db_name": "_mydb",
        "db_password": "secret",
        "developer_mode": 1,
        "host_name": "mysite.localhost",
        "mail_server": "smtp.example.com",
        "limits": {
            "space_usage": {"total": 500},
            "emails": 100,
            "users": 5,
            "custom_limit": 99,
        },
        "unknown_key": "should_be_readonly",
    }
    (tmp_path / "site_config.json").write_text(
        json.dumps(cfg), encoding="utf-8"
    )
    return tmp_path


class TestSplitConfig:
    def test_editable_keys_separated(self, site_dir: Path) -> None:
        full = _read_site_config_sync(site_dir)
        editable, readonly = _split_config(full)

        assert "developer_mode" in editable
        assert "host_name" in editable
        assert "mail_server" in editable

    def test_readonly_keys_separated(self, site_dir: Path) -> None:
        full = _read_site_config_sync(site_dir)
        _editable, readonly = _split_config(full)

        assert "db_name" in readonly
        assert "db_password" in readonly
        assert "unknown_key" in readonly

    def test_nested_keys_split_correctly(self, site_dir: Path) -> None:
        full = _read_site_config_sync(site_dir)
        editable, readonly = _split_config(full)

        assert "limits" in editable
        assert "emails" in editable["limits"]
        assert "users" in editable["limits"]

        assert "limits" in readonly
        assert "custom_limit" in readonly["limits"]


class TestValidateUpdateKeys:
    def test_accepts_flat_editable_key(self) -> None:
        _validate_update_keys({"developer_mode": 0})

    def test_accepts_nested_editable_key(self) -> None:
        _validate_update_keys({"limits": {"emails": 200}})

    def test_rejects_readonly_key(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_update_keys({"db_name": "hacked"})
        assert exc_info.value.status_code == 400

    def test_rejects_unknown_key(self) -> None:
        with pytest.raises(HTTPException):
            _validate_update_keys({"unknown_key": "bad"})

    def test_rejects_nested_non_editable_subkey(self) -> None:
        with pytest.raises(HTTPException) as exc_info:
            _validate_update_keys({"limits": {"custom_limit": 1}})
        assert exc_info.value.status_code == 400

    def test_rejects_nested_non_dict(self) -> None:
        with pytest.raises(HTTPException):
            _validate_update_keys({"limits": "not-a-dict"})


class TestMergeAndWriteConfig:
    def test_atomic_write_merges_and_persists(self, site_dir: Path) -> None:
        updated = _merge_and_write_config_sync(
            site_dir, {"developer_mode": 0, "mail_server": "new.smtp.com"}
        )

        assert updated["developer_mode"] == 0
        assert updated["mail_server"] == "new.smtp.com"
        assert updated["db_name"] == "_mydb"

        on_disk = json.loads(
            (site_dir / "site_config.json").read_text(encoding="utf-8")
        )
        assert on_disk["developer_mode"] == 0
        assert on_disk["mail_server"] == "new.smtp.com"

    def test_nested_merge(self, site_dir: Path) -> None:
        updated = _merge_and_write_config_sync(
            site_dir, {"limits": {"emails": 999}}
        )

        assert updated["limits"]["emails"] == 999
        assert updated["limits"]["users"] == 5

    def test_creates_config_when_missing(self, tmp_path: Path) -> None:
        result = _merge_and_write_config_sync(
            tmp_path, {"developer_mode": 1}
        )

        assert result["developer_mode"] == 1
        on_disk = json.loads(
            (tmp_path / "site_config.json").read_text(encoding="utf-8")
        )
        assert on_disk["developer_mode"] == 1
