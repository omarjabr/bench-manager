"""Pydantic models for bench discovery and API responses (not database tables)."""

from typing import Literal

from pydantic import BaseModel, Field

BenchStatus = Literal["running", "stopped", "unknown"]


class AppInfo(BaseModel):
    """An installed Frappe app and its version string."""

    name: str
    version: str


class SiteInfo(BaseModel):
    """A site folder and the apps installed on that site."""

    name: str
    installed_apps: list[AppInfo] = Field(default_factory=list)


class BenchSummary(BaseModel):
    """Summary row for the bench list endpoint."""

    name: str
    path: str
    frappe_version: str
    status: BenchStatus
    site_count: int
    app_count: int


class BenchDetail(BaseModel):
    """Full bench inspection payload."""

    name: str
    path: str
    frappe_version: str
    status: BenchStatus
    site_count: int
    app_count: int
    sites: list[SiteInfo] = Field(default_factory=list)
    apps: list[AppInfo] = Field(default_factory=list)
    pid: int | None
    ports: dict[str, str] = Field(default_factory=dict)
