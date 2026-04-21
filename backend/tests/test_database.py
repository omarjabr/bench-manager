"""Unit tests for MariaDB explorer service (mocked PyMySQL — no real DB)."""

from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from services import database as db


@pytest.fixture
def mock_connect() -> MagicMock:
    """Patch ``pymysql.connect`` with a controllable connection mock."""
    conn = MagicMock()
    cursor = MagicMock()
    cursor.__enter__ = MagicMock(return_value=cursor)
    cursor.__exit__ = MagicMock(return_value=False)
    conn.cursor.return_value = cursor
    conn.close = MagicMock()
    with patch.object(db, "_connect", return_value=conn):
        yield conn


def test_list_databases_excludes_system_dbs(mock_connect: MagicMock) -> None:
    cur = mock_connect.cursor.return_value.__enter__.return_value
    cur.fetchall.return_value = [
        ("information_schema",),
        ("mysql",),
        ("myapp",),
        ("performance_schema",),
        ("sys",),
    ]

    names = db.list_databases()

    assert "myapp" in names
    assert "information_schema" not in names
    assert "performance_schema" not in names
    assert "mysql" not in names
    assert "sys" not in names


def test_get_table_rows_pagination(mock_connect: MagicMock) -> None:
    cur = mock_connect.cursor.return_value.__enter__.return_value
    cur.fetchone.return_value = (42,)
    cur.fetchall.return_value = [(1, "a"), (2, "b")]
    cur.description = (("id",), ("name",))

    result = db.get_table_rows("app", "tab", page=2, page_size=25)

    execute_calls = [c[0][0] for c in cur.execute.call_args_list]
    assert any("COUNT(*)" in q for q in execute_calls)
    assert any("LIMIT 25 OFFSET 25" in q for q in execute_calls)
    assert result["total"] == 42
    assert result["page"] == 2
    assert result["page_size"] == 25


def test_run_query_rejects_non_select() -> None:
    with pytest.raises(ValueError, match="Only SELECT"):
        db.run_query("db", "UPDATE foo SET x = 1")

    with pytest.raises(ValueError, match="Only SELECT"):
        db.run_query("db", "DELETE FROM foo")

    with pytest.raises(ValueError, match="Only SELECT"):
        db.run_query("db", "DROP TABLE foo")


def test_run_query_truncates_at_500_rows(mock_connect: MagicMock) -> None:
    cur = mock_connect.cursor.return_value.__enter__.return_value
    many = [(i,) for i in range(600)]
    cur.fetchall.return_value = many
    cur.description = (("id",),)

    out = db.run_query("db", "SELECT id FROM t")

    assert out["truncated"] is True
    assert out["total"] == 600
    assert len(out["rows"]) == 500


def test_update_cell_uses_parameterized_query(mock_connect: MagicMock) -> None:
    with patch.object(db, "get_table_columns", return_value=[{"name": "id"}, {"name": "name"}]):
        cur = mock_connect.cursor.return_value.__enter__.return_value

        db.update_cell("app", "tab", "id", "1", "name", "new")

    sql_arg = cur.execute.call_args[0][0]
    params = cur.execute.call_args[0][1]
    assert "%s" in sql_arg
    assert "new" not in sql_arg
    assert params == ("new", "1")
