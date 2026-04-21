"""Template CRUD routes."""

from __future__ import annotations

import json
import logging
from datetime import datetime, timezone
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Response, status
from pydantic import BaseModel, Field
from sqlmodel import Session, select

from database import get_session
from models.template import Template

logger = logging.getLogger(__name__)

router = APIRouter(tags=["templates"])


class TemplateAppItem(BaseModel):
    """One app entry inside a template."""

    name: str = Field(min_length=1)
    repo_url: str = Field(min_length=1)
    branch: str | None = None


class TemplateCreateBody(BaseModel):
    """Request body for create/update template."""

    name: str = Field(min_length=1)
    frappe_version: str = Field(min_length=1)
    apps: list[TemplateAppItem] = Field(default_factory=list)


class TemplateReadResponse(BaseModel):
    """Template row with ``apps`` deserialized to JSON objects."""

    id: str
    name: str
    frappe_version: str
    apps: list[dict]
    created_at: datetime
    last_used_at: datetime | None


def _apps_json_to_list(apps_json: str) -> list[dict]:
    """Parse stored JSON array; return a list of dicts or []."""
    if not apps_json or not apps_json.strip():
        return []
    try:
        parsed = json.loads(apps_json)
    except json.JSONDecodeError:
        logger.warning("Template apps JSON could not be decoded")
        return []
    if not isinstance(parsed, list):
        return []
    return [item for item in parsed if isinstance(item, dict)]


def _template_to_read(row: Template) -> TemplateReadResponse:
    return TemplateReadResponse(
        id=row.id,
        name=row.name,
        frappe_version=row.frappe_version,
        apps=_apps_json_to_list(row.apps),
        created_at=row.created_at,
        last_used_at=row.last_used_at,
    )


@router.get("/templates", response_model=list[TemplateReadResponse])
async def list_templates(
    session: Session = Depends(get_session),
) -> list[TemplateReadResponse]:
    """List all templates, newest first."""
    statement = select(Template).order_by(Template.created_at.desc())
    rows = session.exec(statement).all()
    return [_template_to_read(r) for r in rows]


@router.post(
    "/templates",
    response_model=TemplateReadResponse,
    status_code=status.HTTP_201_CREATED,
)
async def create_template(
    body: TemplateCreateBody,
    session: Session = Depends(get_session),
) -> TemplateReadResponse:
    """Create a template with a new id and current UTC timestamp."""
    now = datetime.now(timezone.utc)
    apps_payload = [a.model_dump(exclude_none=True) for a in body.apps]
    row = Template(
        id=str(uuid4()),
        name=body.name.strip(),
        frappe_version=body.frappe_version.strip(),
        apps=json.dumps(apps_payload),
        created_at=now,
        last_used_at=None,
    )
    session.add(row)
    session.commit()
    session.refresh(row)
    return _template_to_read(row)


@router.put("/templates/{template_id}", response_model=TemplateReadResponse)
async def update_template(
    template_id: str,
    body: TemplateCreateBody,
    session: Session = Depends(get_session),
) -> TemplateReadResponse:
    """Update name, frappe_version, and apps."""
    row = session.get(Template, template_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    apps_payload = [a.model_dump(exclude_none=True) for a in body.apps]
    row.name = body.name.strip()
    row.frappe_version = body.frappe_version.strip()
    row.apps = json.dumps(apps_payload)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _template_to_read(row)


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_template(
    template_id: str,
    session: Session = Depends(get_session),
) -> Response:
    """Delete a template."""
    row = session.get(Template, template_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    session.delete(row)
    session.commit()
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post("/templates/{template_id}/use", response_model=TemplateReadResponse)
async def use_template(
    template_id: str,
    session: Session = Depends(get_session),
) -> TemplateReadResponse:
    """Mark template as used now (updates ``last_used_at``)."""
    row = session.get(Template, template_id)
    if row is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    row.last_used_at = datetime.now(timezone.utc)
    session.add(row)
    session.commit()
    session.refresh(row)
    return _template_to_read(row)
