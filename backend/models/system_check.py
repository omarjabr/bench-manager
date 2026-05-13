"""Pydantic models for system readiness checks and fix requests."""

from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


SystemCheckStatus = Literal["pass", "fail", "warn", "unknown"]
SystemCheckFixKind = Literal["auto", "manual", "none"]


class SystemCheckItem(BaseModel):
    """Single readiness check result and optional remediation metadata."""

    id: str
    label: str
    status: SystemCheckStatus
    details: str
    fix_kind: SystemCheckFixKind
    manual_commands: list[str] = Field(default_factory=list)


class SystemCheckReport(BaseModel):
    """Aggregate readiness report for all system prerequisite checks."""

    items: list[SystemCheckItem]
    ready: bool


class FixRequest(BaseModel):
    """Body for auto-fix endpoints that need sudo elevation."""

    sudo_password: str = Field(min_length=1)
