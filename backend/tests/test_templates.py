"""Tests for template CRUD API."""

from __future__ import annotations

import time
from collections.abc import Generator

import pytest
from fastapi.testclient import TestClient
from sqlalchemy.pool import StaticPool
from sqlmodel import Session, SQLModel, create_engine

from database import get_session
from main import app
from models.template import Template  # noqa: F401 — register ORM tables on metadata

_test_engine = create_engine(
    "sqlite://",
    connect_args={"check_same_thread": False},
    poolclass=StaticPool,
)


def _override_get_session() -> Generator[Session, None, None]:
    with Session(_test_engine) as session:
        yield session


@pytest.fixture(autouse=True)
def _templates_db() -> Generator[None, None, None]:
    SQLModel.metadata.create_all(_test_engine)
    app.dependency_overrides[get_session] = _override_get_session
    yield
    app.dependency_overrides.clear()
    SQLModel.metadata.drop_all(_test_engine)


@pytest.fixture
def client() -> TestClient:
    return TestClient(app)


def test_create_template(client: TestClient) -> None:
    body = {
        "name": "My stack",
        "frappe_version": "version-15",
        "apps": [
            {"name": "ERPNext", "repo_url": "https://github.com/frappe/erpnext", "branch": "version-15"}
        ],
    }
    res = client.post("/api/templates", json=body)
    assert res.status_code == 201
    data = res.json()
    assert data["name"] == "My stack"
    assert data["frappe_version"] == "version-15"
    assert len(data["apps"]) == 1
    assert data["apps"][0]["name"] == "ERPNext"
    assert data["last_used_at"] is None
    assert "id" in data and len(data["id"]) > 0
    assert "created_at" in data


def test_list_templates_ordered_by_created_at(client: TestClient) -> None:
    first = client.post(
        "/api/templates",
        json={
            "name": "older",
            "frappe_version": "version-14",
            "apps": [],
        },
    )
    assert first.status_code == 201
    time.sleep(0.02)
    second = client.post(
        "/api/templates",
        json={
            "name": "newer",
            "frappe_version": "develop",
            "apps": [{"name": "CRM", "repo_url": "https://github.com/frappe/crm"}],
        },
    )
    assert second.status_code == 201
    newer_id = second.json()["id"]

    listed = client.get("/api/templates")
    assert listed.status_code == 200
    rows = listed.json()
    assert len(rows) == 2
    assert rows[0]["id"] == newer_id
    assert rows[0]["name"] == "newer"


def test_update_template_returns_404_for_unknown_id(client: TestClient) -> None:
    res = client.put(
        "/api/templates/nonexistent-id",
        json={"name": "x", "frappe_version": "version-15", "apps": []},
    )
    assert res.status_code == 404


def test_delete_template_returns_204(client: TestClient) -> None:
    created = client.post(
        "/api/templates",
        json={"name": "t", "frappe_version": "version-15", "apps": []},
    )
    assert created.status_code == 201
    tid = created.json()["id"]

    deleted = client.delete(f"/api/templates/{tid}")
    assert deleted.status_code == 204

    missing = client.delete(f"/api/templates/{tid}")
    assert missing.status_code == 404


def test_use_template_updates_last_used_at(client: TestClient) -> None:
    created = client.post(
        "/api/templates",
        json={"name": "use-me", "frappe_version": "version-15", "apps": []},
    )
    assert created.status_code == 201
    tid = created.json()["id"]
    assert created.json()["last_used_at"] is None

    time.sleep(0.02)
    used = client.post(f"/api/templates/{tid}/use")
    assert used.status_code == 200
    body = used.json()
    assert body["last_used_at"] is not None

    listed = client.get("/api/templates")
    row = next(r for r in listed.json() if r["id"] == tid)
    assert row["last_used_at"] is not None
