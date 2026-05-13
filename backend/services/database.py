"""MariaDB connection helpers for the Database Explorer (PyMySQL, one connection per operation).

Both the global Database Explorer and the per-site Database tab share the query
logic in this module.  Functions that hit MariaDB accept an optional
``ConnectionParams``; when omitted they fall back to the global credentials
(``~/.my.cnf`` → Settings).
"""

from __future__ import annotations

import configparser
import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Any

import pymysql

from config import Settings, get_settings

logger = logging.getLogger(__name__)

_SYSTEM_DATABASES = frozenset(
    {"information_schema", "performance_schema", "mysql", "sys"}
)

_FORBIDDEN_QUERY_PREFIXES = (
    "INSERT",
    "UPDATE",
    "DELETE",
    "DROP",
    "TRUNCATE",
    "ALTER",
    "CREATE",
    "REPLACE",
)


@dataclass(frozen=True)
class ConnectionParams:
    """Explicit MariaDB connection credentials (used by per-site DB)."""

    host: str
    user: str
    password: str
    port: int = 3306


def _fallback_from_settings(settings: Settings) -> dict[str, Any]:
    """Build connection params from persisted app settings."""
    host = str(settings.db_host) if settings.db_host else "127.0.0.1"
    return {
        "host": host,
        "user": settings.db_user,
        "password": settings.db_password,
        "port": 3306,
    }


def get_connection_params() -> dict[str, Any]:
    """
    Resolve global MariaDB connection parameters.

    Reads ``~/.my.cnf`` ``[client]`` when present; otherwise uses :class:`Settings`.
    Host defaults to 127.0.0.1 when not set in ``[client]``.
    """
    settings = get_settings()
    my_cnf = Path.home() / ".my.cnf"
    if not my_cnf.is_file():
        return _fallback_from_settings(settings)

    parser = configparser.ConfigParser()
    try:
        parser.read(my_cnf)
    except configparser.Error:
        logger.warning("Could not parse ~/.my.cnf; using Settings fallback.")
        return _fallback_from_settings(settings)

    if "client" not in parser:
        return _fallback_from_settings(settings)

    section = parser["client"]
    host = (
        section["host"].strip()
        if section.get("host", "").strip()
        else "127.0.0.1"
    )
    user = (
        section["user"].strip()
        if section.get("user", "").strip()
        else settings.db_user
    )
    password = section["password"] if "password" in section else settings.db_password
    return {"host": host, "user": user, "password": password, "port": 3306}


def _connect(
    conn_params: ConnectionParams | None = None,
) -> pymysql.connections.Connection:
    """Open a PyMySQL connection using explicit *conn_params* or global creds."""
    if conn_params is not None:
        return pymysql.connect(
            host=conn_params.host,
            user=conn_params.user,
            password=conn_params.password,
            port=conn_params.port,
            charset="utf8mb4",
            cursorclass=pymysql.cursors.Cursor,
        )
    params = get_connection_params()
    return pymysql.connect(
        host=params["host"],
        user=params["user"],
        password=params["password"],
        port=int(params["port"]),
        charset="utf8mb4",
        cursorclass=pymysql.cursors.Cursor,
    )


def _json_safe(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, (bytes, bytearray)):
        return bytes(value).decode("utf-8", errors="replace")
    if hasattr(value, "isoformat"):
        return value.isoformat()
    return value


def test_connection(
    conn_params: ConnectionParams | None = None,
) -> bool:
    """Return True if ``SELECT 1`` succeeds against the configured server."""
    try:
        conn = _connect(conn_params)
        try:
            with conn.cursor() as cur:
                cur.execute("SELECT 1")
                cur.fetchone()
        finally:
            conn.close()
    except Exception:
        return False
    return True


def list_databases(
    conn_params: ConnectionParams | None = None,
) -> list[str]:
    """Return user database names (system schemas excluded)."""
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            cur.execute("SHOW DATABASES")
            rows = cur.fetchall()
    finally:
        conn.close()
    names: list[str] = []
    for row in rows:
        name = row[0]
        if isinstance(name, bytes):
            name = name.decode("utf-8", errors="replace")
        if name not in _SYSTEM_DATABASES:
            names.append(name)
    return sorted(names)


def list_tables(
    db_name: str,
    conn_params: ConnectionParams | None = None,
) -> list[str]:
    """Return table names in ``db_name``."""
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            cur.execute(f"SHOW TABLES FROM `{db_name}`")
            rows = cur.fetchall()
    finally:
        conn.close()
    out: list[str] = []
    for row in rows:
        name = row[0]
        if isinstance(name, bytes):
            name = name.decode("utf-8", errors="replace")
        out.append(name)
    return sorted(out)


def get_table_columns(
    db_name: str,
    table_name: str,
    conn_params: ConnectionParams | None = None,
) -> list[dict[str, Any]]:
    """Column metadata from ``DESCRIBE``."""
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            cur.execute(f"DESCRIBE `{db_name}`.`{table_name}`")
            rows = cur.fetchall()
    finally:
        conn.close()
    columns: list[dict[str, Any]] = []
    for row in rows:
        field = row[0]
        col_type = row[1]
        null_raw = row[2]
        key = row[3]
        default = row[4]
        if isinstance(field, bytes):
            field = field.decode("utf-8", errors="replace")
        if isinstance(col_type, bytes):
            col_type = col_type.decode("utf-8", errors="replace")
        if isinstance(null_raw, bytes):
            null_raw = null_raw.decode("utf-8", errors="replace")
        if isinstance(key, bytes):
            key = key.decode("utf-8", errors="replace")
        columns.append(
            {
                "name": field,
                "type": col_type,
                "nullable": null_raw == "YES",
                "key": key,
                "default": _json_safe(default),
            }
        )
    return columns


def get_table_rows(
    db_name: str,
    table_name: str,
    page: int,
    page_size: int = 25,
    conn_params: ConnectionParams | None = None,
) -> dict[str, Any]:
    """Paginated ``SELECT *`` with total row count."""
    if page < 1:
        page = 1
    offset = (page - 1) * page_size
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            count_sql = f"SELECT COUNT(*) FROM `{db_name}`.`{table_name}`"
            cur.execute(count_sql)
            count_row = cur.fetchone()
            total = int(count_row[0]) if count_row else 0

            data_sql = (
                f"SELECT * FROM `{db_name}`.`{table_name}` "
                f"LIMIT {int(page_size)} OFFSET {int(offset)}"
            )
            cur.execute(data_sql)
            raw_rows = cur.fetchall()
            column_names = [d[0] for d in cur.description] if cur.description else []
    finally:
        conn.close()

    columns = [str(c) for c in column_names]
    rows: list[list[Any]] = []
    for raw in raw_rows:
        rows.append([_json_safe(cell) for cell in raw])

    return {
        "columns": columns,
        "rows": rows,
        "total": total,
        "page": page,
        "page_size": page_size,
    }


def update_cell(
    db_name: str,
    table_name: str,
    primary_key_col: str,
    primary_key_val: str,
    column: str,
    value: str,
    conn_params: ConnectionParams | None = None,
) -> None:
    """Update a single cell using a parameterized ``UPDATE``."""
    meta = get_table_columns(db_name, table_name, conn_params=conn_params)
    valid_names = {c["name"] for c in meta}
    if primary_key_col not in valid_names or column not in valid_names:
        raise ValueError("Invalid column name for this table.")
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            sql = (
                f"UPDATE `{db_name}`.`{table_name}` "
                f"SET `{column}` = %s WHERE `{primary_key_col}` = %s"
            )
            cur.execute(sql, (value, primary_key_val))
            conn.commit()
    finally:
        conn.close()


def delete_row(
    db_name: str,
    table_name: str,
    primary_key_col: str,
    primary_key_val: str,
    conn_params: ConnectionParams | None = None,
) -> None:
    """Delete a row by primary key."""
    meta = get_table_columns(db_name, table_name, conn_params=conn_params)
    valid_names = {c["name"] for c in meta}
    if primary_key_col not in valid_names:
        raise ValueError("Invalid primary key column for this table.")
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            sql = f"DELETE FROM `{db_name}`.`{table_name}` WHERE `{primary_key_col}` = %s"
            cur.execute(sql, (primary_key_val,))
            conn.commit()
    finally:
        conn.close()


def _assert_read_only_sql(sql: str) -> None:
    stripped = sql.strip()
    if not stripped:
        raise ValueError("Empty SQL statement.")
    upper = stripped.upper()
    for prefix in _FORBIDDEN_QUERY_PREFIXES:
        if upper.startswith(prefix):
            raise ValueError("Only SELECT statements are allowed in the query runner")


def run_query(
    db_name: str,
    sql: str,
    conn_params: ConnectionParams | None = None,
) -> dict[str, Any]:
    """
    Execute read-only SQL in ``db_name``.

    Results larger than 500 rows are truncated; ``total`` is the full count.
    """
    _assert_read_only_sql(sql)
    conn = _connect(conn_params)
    try:
        with conn.cursor() as cur:
            cur.execute(f"USE `{db_name}`")
            try:
                cur.execute(sql)
            except pymysql.Error as exc:
                raise ValueError(str(exc)) from exc
            raw_rows = cur.fetchall()
            column_names = [d[0] for d in cur.description] if cur.description else []
    finally:
        conn.close()

    total = len(raw_rows)
    truncated = total > 500
    sliced = raw_rows[:500] if truncated else raw_rows
    columns = [str(c) for c in column_names]
    rows: list[list[Any]] = []
    for raw in sliced:
        rows.append([_json_safe(cell) for cell in raw])

    return {
        "columns": columns,
        "rows": rows,
        "truncated": truncated,
        "total": total,
    }
