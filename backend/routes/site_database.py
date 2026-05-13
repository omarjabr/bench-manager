"""Per-site Database Explorer API.

Each Frappe site stores MariaDB credentials in ``site_config.json``.  These
routes expose the same query surface as the global Database Explorer, but
scoped to a single site's database.
"""

from __future__ import annotations

import asyncio
from pathlib import Path
from typing import Any

import pymysql
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field

from config import get_settings
from routes.database import DatabaseStatusResponse, DeleteRowBody, RunQueryBody, UpdateCellBody
from services import database as database_service
from services.discovery import scan_for_benches
from services.dispatcher import call_remote, get_server_id, is_local
from services.site_db import read_site_db_credentials, read_site_db_name

router = APIRouter(
    prefix="/benches/{bench_name}/sites/{site_name}/database",
    tags=["site-database"],
)


async def _find_bench_path(bench_name: str) -> Path:
    """Resolve a bench directory path from its folder name or raise 404."""
    root = get_settings().root_scan_dir
    summaries = await asyncio.to_thread(scan_for_benches, root)
    match = next((item for item in summaries if item.name == bench_name), None)
    if match is None:
        raise HTTPException(status_code=404, detail=f"Bench not found: {bench_name}")
    return Path(match.path)


def _resolve_site_dir(bench_path: Path, site_name: str) -> Path:
    """Validate the site directory exists and return its path."""
    site_dir = bench_path / "sites" / site_name
    if not site_dir.is_dir():
        raise HTTPException(
            status_code=404,
            detail=f"Site not found: {site_name}",
        )
    return site_dir


async def _site_conn(bench_name: str, site_name: str) -> tuple[database_service.ConnectionParams, str]:
    """Return ``(ConnectionParams, db_name)`` for the given site."""
    bench_path = await _find_bench_path(bench_name)
    _resolve_site_dir(bench_path, site_name)
    bench_str = str(bench_path)
    conn_params = await asyncio.to_thread(read_site_db_credentials, bench_str, site_name)
    db_name = await asyncio.to_thread(read_site_db_name, bench_str, site_name)
    if not db_name:
        raise HTTPException(
            status_code=400,
            detail="Could not determine db_name from site_config.json.",
        )
    return conn_params, db_name


def _site_db_prefix(bench_name: str, site_name: str) -> str:
    return f"/api/benches/{bench_name}/sites/{site_name}/database"


@router.get("/status", response_model=DatabaseStatusResponse)
async def site_database_status(
    bench_name: str,
    site_name: str,
    server_id: str = Depends(get_server_id),
) -> DatabaseStatusResponse:
    """Probe the MariaDB connection using this site's credentials."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "GET", f"{_site_db_prefix(bench_name, site_name)}/status"
        )
    conn_params, _db_name = await _site_conn(bench_name, site_name)
    connected = await asyncio.to_thread(database_service.test_connection, conn_params)
    return DatabaseStatusResponse(
        connected=connected,
        host=conn_params.host,
        user=conn_params.user,
    )


@router.get("/tables", response_model=list[str])
async def site_table_list(
    bench_name: str,
    site_name: str,
    server_id: str = Depends(get_server_id),
) -> list[str]:
    """List tables in this site's database."""
    if not is_local(server_id):
        return await call_remote(
            server_id, "GET", f"{_site_db_prefix(bench_name, site_name)}/tables"
        )
    conn_params, db_name = await _site_conn(bench_name, site_name)
    return await asyncio.to_thread(
        database_service.list_tables, db_name, conn_params
    )


@router.get("/{table_name}/columns")
async def site_column_list(
    bench_name: str,
    site_name: str,
    table_name: str,
    server_id: str = Depends(get_server_id),
) -> list[dict[str, Any]]:
    """Column metadata for a table in this site's database."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "GET",
            f"{_site_db_prefix(bench_name, site_name)}/{table_name}/columns",
        )
    conn_params, db_name = await _site_conn(bench_name, site_name)
    return await asyncio.to_thread(
        database_service.get_table_columns, db_name, table_name, conn_params
    )


@router.get("/{table_name}/rows")
async def site_row_page(
    bench_name: str,
    site_name: str,
    table_name: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(25, ge=1, le=500),
    server_id: str = Depends(get_server_id),
) -> dict[str, Any]:
    """Paginated rows from a table in this site's database."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "GET",
            f"{_site_db_prefix(bench_name, site_name)}/{table_name}/rows",
            params={"page": page, "page_size": page_size},
        )
    conn_params, db_name = await _site_conn(bench_name, site_name)
    return await asyncio.to_thread(
        database_service.get_table_rows,
        db_name,
        table_name,
        page,
        page_size,
        conn_params,
    )


@router.patch("/{table_name}/rows")
async def site_patch_cell(
    bench_name: str,
    site_name: str,
    table_name: str,
    body: UpdateCellBody,
    server_id: str = Depends(get_server_id),
) -> dict[str, str]:
    """Update a single cell in this site's database."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "PATCH",
            f"{_site_db_prefix(bench_name, site_name)}/{table_name}/rows",
            body=body.model_dump(),
        )
    conn_params, db_name = await _site_conn(bench_name, site_name)
    try:
        await asyncio.to_thread(
            database_service.update_cell,
            db_name,
            table_name,
            body.primary_key_col,
            body.primary_key_val,
            body.column,
            body.value,
            conn_params,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except pymysql.Error as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.delete("/{table_name}/rows")
async def site_remove_row(
    bench_name: str,
    site_name: str,
    table_name: str,
    body: DeleteRowBody,
    server_id: str = Depends(get_server_id),
) -> dict[str, str]:
    """Delete a row by primary key in this site's database."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "DELETE",
            f"{_site_db_prefix(bench_name, site_name)}/{table_name}/rows",
            body=body.model_dump(),
        )
    conn_params, db_name = await _site_conn(bench_name, site_name)
    try:
        await asyncio.to_thread(
            database_service.delete_row,
            db_name,
            table_name,
            body.primary_key_col,
            body.primary_key_val,
            conn_params,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except pymysql.Error as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"status": "ok"}


@router.post("/query")
async def site_run_sql(
    bench_name: str,
    site_name: str,
    body: RunQueryBody,
    server_id: str = Depends(get_server_id),
) -> dict[str, Any]:
    """Execute read-only SQL against this site's database."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "POST",
            f"{_site_db_prefix(bench_name, site_name)}/query",
            body=body.model_dump(),
        )
    conn_params, db_name = await _site_conn(bench_name, site_name)
    try:
        return await asyncio.to_thread(
            database_service.run_query, db_name, body.sql, conn_params
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
