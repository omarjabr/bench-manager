"""SQLModel tables for templates and app registry, plus API schemas."""

from datetime import datetime, timezone
from typing import Annotated
from uuid import uuid4

from pydantic import BaseModel, Field
from sqlmodel import Field as SQLField
from sqlmodel import SQLModel


class Template(SQLModel, table=True):
    """A reusable bench configuration (Frappe version + apps to install)."""

    id: str = SQLField(default_factory=lambda: str(uuid4()), primary_key=True)
    name: str = SQLField(index=True)
    frappe_version: str
    apps: str = SQLField(description="JSON array of objects with name and repo_url")
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))
    last_used_at: datetime | None = SQLField(default=None)


class AppRegistry(SQLModel, table=True):
    """User-curated shortcuts for common Frappe apps."""

    id: str = SQLField(default_factory=lambda: str(uuid4()), primary_key=True)
    name: str = SQLField(index=True)
    repo_url: str
    description: str | None = SQLField(default=None)


class TemplateCreate(BaseModel):
    """Payload for creating a template."""

    name: Annotated[str, Field(min_length=1)]
    frappe_version: Annotated[str, Field(min_length=1)]
    apps: Annotated[str, Field(description="JSON array string")]


class TemplateRead(BaseModel):
    """API representation of a template row."""

    id: str
    name: str
    frappe_version: str
    apps: str
    created_at: datetime
    last_used_at: datetime | None


class AppRegistryRead(BaseModel):
    """API representation of an app registry row."""

    id: str
    name: str
    repo_url: str
    description: str | None
