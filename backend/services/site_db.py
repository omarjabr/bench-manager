"""Read MariaDB credentials from a Frappe site's ``site_config.json``."""

from __future__ import annotations

import json
import logging
from pathlib import Path
from typing import Any

from services.database import ConnectionParams

logger = logging.getLogger(__name__)

_COMMON_CONFIG_NAME = "common_site_config.json"
_SITE_CONFIG_NAME = "site_config.json"


def _read_json(path: Path) -> dict[str, Any]:
    """Return parsed JSON from *path*, or an empty dict on failure."""
    try:
        return json.loads(path.read_text(encoding="utf-8"))  # type: ignore[no-any-return]
    except (FileNotFoundError, PermissionError, json.JSONDecodeError) as exc:
        logger.debug("Could not read %s: %s", path, exc)
        return {}


def read_site_db_credentials(
    bench_path: str,
    site_name: str,
) -> ConnectionParams:
    """Build :class:`ConnectionParams` for a Frappe site's MariaDB database.

    Credential resolution order (per key):
    1. ``sites/<site>/site_config.json``
    2. ``sites/common_site_config.json``
    3. Hard-coded defaults (``127.0.0.1:3306``, ``root``, empty password)
    """
    bench = Path(bench_path)
    site_cfg = _read_json(bench / "sites" / site_name / _SITE_CONFIG_NAME)
    common_cfg = _read_json(bench / "sites" / _COMMON_CONFIG_NAME)

    host = (
        str(site_cfg.get("db_host", ""))
        or str(common_cfg.get("db_host", ""))
        or "127.0.0.1"
    )
    port_raw = site_cfg.get("db_port") or common_cfg.get("db_port") or 3306
    user = (
        str(site_cfg.get("db_name", ""))
        or str(common_cfg.get("db_name", ""))
    )
    password = str(site_cfg.get("db_password", ""))

    return ConnectionParams(
        host=host,
        user=user,
        password=password,
        port=int(port_raw),
    )


def read_site_db_name(bench_path: str, site_name: str) -> str:
    """Return the MariaDB database name for the given site.

    In Frappe, ``db_name`` in ``site_config.json`` doubles as both the DB
    user and the DB schema name.
    """
    bench = Path(bench_path)
    site_cfg = _read_json(bench / "sites" / site_name / _SITE_CONFIG_NAME)
    common_cfg = _read_json(bench / "sites" / _COMMON_CONFIG_NAME)
    return str(site_cfg.get("db_name", "") or common_cfg.get("db_name", ""))
