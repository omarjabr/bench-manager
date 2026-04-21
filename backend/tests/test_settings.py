"""Tests for the settings API and configuration defaults."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi.testclient import TestClient

from config import DEFAULT_APP_REGISTRY, Settings, get_settings
from main import app


@pytest.fixture(autouse=True)
def _clear_settings_cache() -> None:
    """Ensure a fresh settings cache for every test."""
    get_settings.cache_clear()


@pytest.fixture()
def client() -> TestClient:
    return TestClient(app)


def _make_settings(**overrides: object) -> Settings:
    """Build a Settings object with sensible defaults, applying overrides."""
    defaults = {
        "root_scan_dir": "/tmp/test-scan",
        "excluded_paths": ["*/venv/*"],
        "scan_interval_seconds": 60,
        "backend_host": "127.0.0.1",
        "backend_port": 8000,
        "db_host": "127.0.0.1",
        "db_user": "root",
        "db_password": "",
        "app_registry": list(DEFAULT_APP_REGISTRY),
    }
    defaults.update(overrides)
    return Settings.model_validate(defaults)


class TestGetSettings:
    """GET /api/settings"""

    def test_returns_app_registry(self, client: TestClient) -> None:
        """The response must include the app_registry field with entries."""
        res = client.get("/api/settings")
        assert res.status_code == 200
        data = res.json()
        assert "app_registry" in data
        assert isinstance(data["app_registry"], list)

    def test_app_registry_has_default_entries(self, client: TestClient) -> None:
        """When no custom registry is configured, the default seed must be present."""
        res = client.get("/api/settings")
        data = res.json()
        registry_names = {entry["name"] for entry in data["app_registry"]}
        assert "ERPNext" in registry_names
        assert "HRMS" in registry_names
        assert "Builder" in registry_names

    def test_app_registry_entries_have_required_fields(
        self, client: TestClient
    ) -> None:
        """Each entry in the registry must have name, repo_url, and default_branch."""
        res = client.get("/api/settings")
        data = res.json()
        for entry in data["app_registry"]:
            assert "name" in entry
            assert "repo_url" in entry
            assert "default_branch" in entry

    def test_returns_all_settings_fields(self, client: TestClient) -> None:
        res = client.get("/api/settings")
        data = res.json()
        expected_keys = {
            "root_scan_dir",
            "excluded_paths",
            "scan_interval_seconds",
            "backend_host",
            "backend_port",
            "db_host",
            "db_user",
            "db_password",
            "app_registry",
        }
        assert expected_keys.issubset(set(data.keys()))


class TestPutSettingsPartialUpdate:
    """PUT /api/settings — partial updates."""

    def test_partial_update_only_changes_provided_fields(
        self, client: TestClient
    ) -> None:
        """Sending only ``db_host`` must not change other settings."""
        original = _make_settings()
        persist_mock = MagicMock()

        with (
            patch("routes.settings.get_settings", return_value=original),
            patch("routes.settings.persist_settings", persist_mock),
        ):
            res = client.put("/api/settings", json={"db_host": "192.168.1.100"})
            assert res.status_code == 200

            persisted = persist_mock.call_args[0][0]
            assert persisted.db_host == "192.168.1.100"
            assert persisted.db_user == "root"
            assert persisted.backend_port == 8000

    def test_partial_update_app_registry(self, client: TestClient) -> None:
        """Updating app_registry should persist the new list."""
        original = _make_settings()
        persist_mock = MagicMock()

        custom_registry = [
            {
                "name": "TestApp",
                "repo_url": "https://github.com/test/app",
                "default_branch": "main",
            }
        ]

        with (
            patch("routes.settings.get_settings", return_value=original),
            patch("routes.settings.persist_settings", persist_mock),
        ):
            res = client.put(
                "/api/settings", json={"app_registry": custom_registry}
            )
            assert res.status_code == 200

            persisted = persist_mock.call_args[0][0]
            assert len(persisted.app_registry) == 1
            assert persisted.app_registry[0]["name"] == "TestApp"

    def test_partial_update_preserves_app_registry_when_not_sent(
        self, client: TestClient
    ) -> None:
        """Not sending app_registry must leave the existing registry intact."""
        original = _make_settings()
        persist_mock = MagicMock()

        with (
            patch("routes.settings.get_settings", return_value=original),
            patch("routes.settings.persist_settings", persist_mock),
        ):
            res = client.put("/api/settings", json={"db_user": "testuser"})
            assert res.status_code == 200

            persisted = persist_mock.call_args[0][0]
            assert len(persisted.app_registry) == len(DEFAULT_APP_REGISTRY)
            assert persisted.db_user == "testuser"


class TestAppRegistryDefaultSeed:
    """Verify that the default app registry is seeded on first run."""

    def test_default_registry_is_non_empty(self) -> None:
        assert len(DEFAULT_APP_REGISTRY) > 0

    def test_fresh_settings_has_registry(self) -> None:
        """Creating Settings with no env produces the default registry."""
        s = _make_settings(app_registry=[])
        assert isinstance(s.app_registry, list)

    def test_default_entries_match_expected_count(self) -> None:
        assert len(DEFAULT_APP_REGISTRY) == 10

    def test_get_settings_returns_app_registry_on_first_run(
        self, client: TestClient
    ) -> None:
        """GET /api/settings returns a non-empty registry on a fresh install."""
        res = client.get("/api/settings")
        data = res.json()
        assert len(data["app_registry"]) > 0
        names = {e["name"] for e in data["app_registry"]}
        assert "ERPNext" in names
