"""Database Explorer API (MariaDB)."""

from __future__ import annotations

import asyncio
from typing import Any

import pymysql
from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel, Field

from services import database as database_service

router = APIRouter(prefix="/database", tags=["database"])

_DB_UNAVAILABLE = HTTPException(
    status_code=503,
    detail="Cannot connect to MariaDB. Check credentials in Settings.",
)


class DatabaseStatusResponse(BaseModel):
    """Connection probe result for the UI."""

    connected: bool
    host: str
    user: str


class UpdateCellBody(BaseModel):
    """Cell edit payload."""

    primary_key_col: str
    primary_key_val: str
    column: str
    value: str


class DeleteRowBody(BaseModel):
    """Row delete payload."""

    primary_key_col: str
    primary_key_val: str


class RunQueryBody(BaseModel):
    """Ad-hoc read-only SQL."""

    sql: str = Field(min_length=1)


async def _require_connection() -> None:
    ok = await asyncio.to_thread(database_service.test_connection)
    if not ok:
        raise _DB_UNAVAILABLE


@router.get("/status", response_model=DatabaseStatusResponse)
async def database_status() -> DatabaseStatusResponse:
    """Report whether MariaDB is reachable and which host/user are configured."""
    connected = await asyncio.to_thread(database_service.test_connection)
    params = database_service.get_connection_params()
    return DatabaseStatusResponse(
        connected=connected,
        host=str(params["host"]),
        user=str(params["user"]),
    )


@router.get("/databases", response_model=list[str])
async def database_list() -> list[str]:
    """List non-system databases."""
    await _require_connection()
    return await asyncio.to_thread(database_service.list_databases)


@router.get("/{db_name}/tables", response_model=list[str])
async def table_list(db_name: str) -> list[str]:
    """List tables in a database."""
    await _require_connection()
    return await asyncio.to_thread(database_service.list_tables, db_name)


@router.get("/{db_name}/{table_name}/columns")
async def column_list(db_name: str, table_name: str) -> list[dict[str, Any]]:
    """Return column metadata for a table."""
    await _require_connection()
    return await asyncio.to_thread(
        database_service.get_table_columns, db_name, table_name
    )


@router.get("/{db_name}/{table_name}/rows")
async def row_page(
    db_name: str,
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
) -> dict[str, Any]:
    """Paginated table rows."""
    await _require_connection()
    return await asyncio.to_thread(
        database_service.get_table_rows, db_name, table_name, page, page_size
    )


@router.patch("/{db_name}/{table_name}/rows")
async def patch_cell(
    db_name: str, table_name: str, body: UpdateCellBody
) -> dict[str, str]:
    """Update a single cell."""
    await _require_connection()
    try:
        await asyncio.to_thread(
            database_service.update_cell,
            db_name,
            table_name,
            body.primary_key_col,
            body.primary_key_val,
            body.column,
            body.value,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except pymysql.Error as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.delete("/{db_name}/{table_name}/rows")
async def remove_row(db_name: str, table_name: str, body: DeleteRowBody) -> dict[str, str]:
    """Delete a row by primary key."""
    await _require_connection()
    try:
        await asyncio.to_thread(
            database_service.delete_row,
            db_name,
            table_name,
            body.primary_key_col,
            body.primary_key_val,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except pymysql.Error as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.post("/{db_name}/query")
async def run_sql(db_name: str, body: RunQueryBody) -> dict[str, Any]:
    """Execute read-only SQL and return a row set."""
    await _require_connection()
    try:
        return await asyncio.to_thread(database_service.run_query, db_name, body.sql)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
