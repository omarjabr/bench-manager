"""System readiness report and auto-fix endpoints."""

from __future__ import annotations

import asyncio
import logging
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, Request

from models.system_check import FixRequest, SystemCheckReport
from routes.operations import OperationIdResponse
from services.dispatcher import call_remote, get_server_id, is_local
from services.executor import create_operation_id, run_operation
from services.system_check import collect_system_check_report

logger = logging.getLogger(__name__)

router = APIRouter(tags=["system-check"])

# pip gained --break-system-packages in 23.0.1. Older pips (e.g. Ubuntu 22.04's
# 22.0.2) reject the flag and also don't enforce PEP 668, so we only pass the
# flag when the local pip advertises support for it.
_PIP_BREAK_SUFFIX = (
    "$(pip3 install --help 2>/dev/null | "
    "grep -q -- --break-system-packages && echo --break-system-packages)"
)

_ALLOWED_FIX_COMMANDS: dict[str, str] = {
    "apt_packages": (
        "export DEBIAN_FRONTEND=noninteractive && "
        "apt-get update && "
        "apt-get -y --fix-broken install && "
        "apt-get install -y "
        "-o Dpkg::Options::=--force-confdef "
        "-o Dpkg::Options::=--force-confold "
        "git python3-dev python3-setuptools python3-pip "
        "software-properties-common curl xvfb libfontconfig wkhtmltopdf "
        "redis-server mariadb-server"
    ),
    "python_venv": (
        "PY_MINOR=$(python3 -c \"import sys;print(f'{sys.version_info.major}.{sys.version_info.minor}')\") "
        "&& apt-get install -y python${PY_MINOR}-venv"
    ),
    "npm_apt": "apt-get install -y npm",
    "yarn_global": "npm install -g yarn",
    "frappe_bench": f"pip3 install frappe-bench {_PIP_BREAK_SUFFIX}",
    "ansible": f"pip3 install ansible {_PIP_BREAK_SUFFIX}",
    "mariadb_running": "systemctl start mariadb && systemctl enable mariadb",
    "mariadb_charset": (
        "cp /etc/mysql/my.cnf /etc/mysql/my.cnf.bm.bak && "
        "tee -a /etc/mysql/my.cnf >/dev/null <<'EOF'\n"
        "[mysqld]\n"
        "character-set-client-handshake = FALSE\n"
        "character-set-server = utf8mb4\n"
        "collation-server = utf8mb4_unicode_ci\n"
        "[mysql]\n"
        "default-character-set = utf8mb4\n"
        "EOF\n"
        "systemctl restart mariadb"
    ),
    "redis_running": "systemctl start redis-server && systemctl enable redis-server",
}


@router.get("/system-check", response_model=SystemCheckReport)
async def get_system_check_report(
    server_id: str = Depends(get_server_id),
) -> SystemCheckReport:
    """Return readiness results for all required local system prerequisites."""
    if not is_local(server_id):
        report = await call_remote(server_id, "GET", "/api/system-check")
        return SystemCheckReport.model_validate(report)
    return await collect_system_check_report()


@router.post("/system-check/fix/{group_id}", response_model=OperationIdResponse)
async def run_system_fix(
    group_id: str,
    body: FixRequest,
    request: Request,
    server_id: str = Depends(get_server_id),
) -> OperationIdResponse:
    """Run a whitelisted sudo fix command and stream logs via operation WebSocket."""
    if not is_local(server_id):
        return await call_remote(
            server_id,
            "POST",
            f"/api/system-check/fix/{group_id}",
            body=body.model_dump(),
        )

    command = _ALLOWED_FIX_COMMANDS.get(group_id)
    if command is None:
        raise HTTPException(
            status_code=404, detail=f"Unknown fix group: {group_id}")

    sudo_cmd = ["sudo", "-S", "-p", "", "bash", "-lc", command]
    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    async def _task() -> None:
        try:
            await run_operation(
                operation_id,
                sudo_cmd,
                Path.cwd(),
                ws_manager,
                stdin_input=body.sudo_password,
            )
        except Exception:
            logger.exception(
                "System check fix failed unexpectedly for group_id=%s operation_id=%s",
                group_id,
                operation_id,
            )

    asyncio.create_task(_task())
    return OperationIdResponse(operation_id=operation_id)
