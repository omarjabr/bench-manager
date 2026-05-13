"""Tests for ``services.site_db`` — site config credential parsing."""

from __future__ import annotations

import json
from pathlib import Path

import pytest

from services.site_db import read_site_db_credentials, read_site_db_name


@pytest.fixture
def bench_tree(tmp_path: Path) -> Path:
    """Create a minimal bench directory with site and common configs."""
    sites_dir = tmp_path / "sites"
    sites_dir.mkdir()

    site_dir = sites_dir / "mysite.localhost"
    site_dir.mkdir()

    site_cfg = {
        "db_name": "_aabbcc_mysite",
        "db_password": "secret123",
    }
    (site_dir / "site_config.json").write_text(json.dumps(site_cfg), encoding="utf-8")

    common_cfg = {
        "db_host": "192.168.1.100",
        "db_port": 3307,
    }
    (sites_dir / "common_site_config.json").write_text(
        json.dumps(common_cfg), encoding="utf-8"
    )

    return tmp_path


def test_reads_credentials_from_site_and_common_configs(bench_tree: Path) -> None:
    """Credentials merge site_config.json (user, password) and common (host, port)."""
    params = read_site_db_credentials(str(bench_tree), "mysite.localhost")

    assert params.host == "192.168.1.100"
    assert params.port == 3307
    assert params.user == "_aabbcc_mysite"
    assert params.password == "secret123"


def test_reads_db_name_from_site_config(bench_tree: Path) -> None:
    name = read_site_db_name(str(bench_tree), "mysite.localhost")
    assert name == "_aabbcc_mysite"


def test_falls_back_to_defaults_when_configs_missing(tmp_path: Path) -> None:
    """When neither config file exists, hard-coded defaults are returned."""
    sites_dir = tmp_path / "sites"
    sites_dir.mkdir()
    site_dir = sites_dir / "missing.localhost"
    site_dir.mkdir()

    params = read_site_db_credentials(str(tmp_path), "missing.localhost")

    assert params.host == "127.0.0.1"
    assert params.port == 3306
    assert params.user == ""
    assert params.password == ""


def test_site_config_overrides_common_config(tmp_path: Path) -> None:
    """When both site and common define the same key, site wins."""
    sites_dir = tmp_path / "sites"
    sites_dir.mkdir()
    site_dir = sites_dir / "both.localhost"
    site_dir.mkdir()

    site_cfg = {"db_host": "10.0.0.1", "db_name": "site_user", "db_password": "pw"}
    (site_dir / "site_config.json").write_text(json.dumps(site_cfg), encoding="utf-8")

    common_cfg = {"db_host": "10.0.0.99"}
    (sites_dir / "common_site_config.json").write_text(
        json.dumps(common_cfg), encoding="utf-8"
    )

    params = read_site_db_credentials(str(tmp_path), "both.localhost")
    assert params.host == "10.0.0.1"


def test_read_db_name_falls_back_to_common(tmp_path: Path) -> None:
    """If site_config.json has no db_name, common_site_config.json is used."""
    sites_dir = tmp_path / "sites"
    sites_dir.mkdir()
    site_dir = sites_dir / "fallback.localhost"
    site_dir.mkdir()

    (site_dir / "site_config.json").write_text("{}", encoding="utf-8")
    common_cfg = {"db_name": "common_db"}
    (sites_dir / "common_site_config.json").write_text(
        json.dumps(common_cfg), encoding="utf-8"
    )

    name = read_site_db_name(str(tmp_path), "fallback.localhost")
    assert name == "common_db"


def test_returns_empty_db_name_when_missing(tmp_path: Path) -> None:
    sites_dir = tmp_path / "sites"
    sites_dir.mkdir()
    site_dir = sites_dir / "empty.localhost"
    site_dir.mkdir()

    name = read_site_db_name(str(tmp_path), "empty.localhost")
    assert name == ""
