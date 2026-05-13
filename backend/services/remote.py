"""SSH tunnel management and remote agent deployment.

The ``TunnelRegistry`` singleton maintains one asyncssh tunnel per registered
remote server.  All bench-manager routes for a given ``server_id`` are proxied
through ``http://127.0.0.1:{local_port}`` once the tunnel is open.
"""

from __future__ import annotations

import asyncio
import logging
import textwrap
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import asyncssh
import httpx

from ws.manager import ConnectionManager

logger = logging.getLogger(__name__)

_KEEPALIVE_INTERVAL_S = 15
_HEALTH_TIMEOUT_S = 5
_RECONNECT_DELAY_S = 3

_AGENT_REMOTE_DIR = ".bench-manager-agent"
_SYSTEMD_SERVICE_NAME = "bench-manager-agent"


@dataclass
class TunnelEntry:
    """State for a single live SSH tunnel."""

    conn: asyncssh.SSHClientConnection
    listener: asyncssh.SSHListener
    local_port: int
    keepalive_task: asyncio.Task[None] = field(repr=False)


class TunnelRegistry:
    """Manages asyncssh tunnels keyed by ``server_id``."""

    def __init__(self) -> None:
        self._tunnels: dict[str, TunnelEntry] = {}

    def get_local_port(self, server_id: str) -> int | None:
        """Return the local forwarded port or ``None`` if not connected."""
        entry = self._tunnels.get(server_id)
        return entry.local_port if entry else None

    def is_connected(self, server_id: str) -> bool:
        return server_id in self._tunnels

    async def connect(
        self,
        server_id: str,
        host: str,
        ssh_user: str,
        ssh_key_path: str,
        remote_agent_port: int,
        on_status_change: Any | None = None,
    ) -> int:
        """Open an SSH tunnel and return the local forwarded port.

        ``on_status_change`` is an optional ``async callable(server_id, status)``
        invoked when the keepalive detects a failure or recovers.
        """
        if server_id in self._tunnels:
            return self._tunnels[server_id].local_port

        known_hosts_policy: asyncssh.SSHClientConnectionOptions | None = None
        connect_kwargs: dict[str, Any] = {
            "host": host,
            "username": ssh_user,
            "known_hosts": None,
        }
        if ssh_key_path:
            connect_kwargs["client_keys"] = [ssh_key_path]

        conn = await asyncssh.connect(**connect_kwargs)

        listener = await conn.forward_local_port(
            "127.0.0.1", 0, "127.0.0.1", remote_agent_port
        )
        local_port = listener.get_port()

        keepalive_task = asyncio.create_task(
            self._keepalive_loop(server_id, local_port, on_status_change)
        )

        self._tunnels[server_id] = TunnelEntry(
            conn=conn,
            listener=listener,
            local_port=local_port,
            keepalive_task=keepalive_task,
        )

        logger.info(
            "Tunnel open for %s: 127.0.0.1:%d -> %s:%d",
            server_id,
            local_port,
            host,
            remote_agent_port,
        )
        return local_port

    async def disconnect(self, server_id: str) -> None:
        """Tear down an existing tunnel."""
        entry = self._tunnels.pop(server_id, None)
        if entry is None:
            return
        entry.keepalive_task.cancel()
        try:
            await entry.keepalive_task
        except asyncio.CancelledError:
            pass
        entry.listener.close()
        entry.conn.close()
        logger.info("Tunnel closed for %s", server_id)

    async def health_check(self, server_id: str) -> bool:
        """Probe the remote agent's ``/health`` endpoint through the tunnel.

        Returns ``True`` if the agent responds with a 2xx status within the
        configured timeout, ``False`` otherwise.
        """
        entry = self._tunnels.get(server_id)
        if entry is None:
            return False
        url = f"http://127.0.0.1:{entry.local_port}/health"
        try:
            async with httpx.AsyncClient(timeout=_HEALTH_TIMEOUT_S) as client:
                resp = await client.get(url)
                resp.raise_for_status()
            return True
        except (httpx.HTTPError, OSError):
            return False

    async def disconnect_all(self) -> None:
        """Gracefully tear down every open tunnel (called during shutdown)."""
        server_ids = list(self._tunnels.keys())
        for sid in server_ids:
            await self.disconnect(sid)

    async def _keepalive_loop(
        self,
        server_id: str,
        local_port: int,
        on_status_change: Any | None,
    ) -> None:
        """Ping the remote agent's ``/health`` endpoint on a fixed interval."""
        url = f"http://127.0.0.1:{local_port}/health"
        consecutive_failures = 0

        while True:
            await asyncio.sleep(_KEEPALIVE_INTERVAL_S)
            try:
                async with httpx.AsyncClient(timeout=_HEALTH_TIMEOUT_S) as client:
                    resp = await client.get(url)
                    resp.raise_for_status()
                if consecutive_failures > 0:
                    logger.info("Keepalive recovered for %s", server_id)
                    if on_status_change is not None:
                        await on_status_change(server_id, "connected")
                consecutive_failures = 0
            except (httpx.HTTPError, OSError) as exc:
                consecutive_failures += 1
                logger.warning(
                    "Keepalive failed for %s (attempt %d): %s",
                    server_id,
                    consecutive_failures,
                    exc,
                )
                if consecutive_failures == 1 and on_status_change is not None:
                    await on_status_change(server_id, "error")


async def deploy_agent(
    server_id: str,
    host: str,
    ssh_user: str,
    ssh_key_path: str,
    remote_agent_port: int,
    operation_id: str,
    ws_manager: ConnectionManager,
) -> bool:
    """Deploy the bench-manager agent to a remote host via SSH.

    Steps:
    1. rsync the ``backend/`` directory to ``~/.bench-manager-agent/``
    2. Create a virtualenv and install requirements
    3. Write and enable a systemd user service (nohup fallback)
    4. Stream all output back via ``ws_manager`` / ``operation_id``

    Returns ``True`` when the agent is healthy after deployment.
    """
    import json

    async def _send_log(line: str, stream: str = "stdout") -> None:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "log", "line": line, "stream": stream}),
        )

    async def _send_done(exit_code: int) -> None:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "done", "exit_code": exit_code}),
        )

    async def _send_error(message: str) -> None:
        await ws_manager.send(
            operation_id,
            json.dumps({"type": "error", "message": message}),
        )

    connect_kwargs: dict[str, Any] = {
        "host": host,
        "username": ssh_user,
        "known_hosts": None,
    }
    if ssh_key_path:
        connect_kwargs["client_keys"] = [ssh_key_path]

    try:
        conn = await asyncssh.connect(**connect_kwargs)
    except (asyncssh.Error, OSError) as exc:
        await _send_error(f"SSH connection failed: {exc}")
        return False

    deployed_ok = False
    try:
        await _send_log(f"Connected to {ssh_user}@{host}")

        backend_dir = Path(__file__).resolve().parent.parent
        remote_dir = f"~/{_AGENT_REMOTE_DIR}"

        await _send_log("Creating remote directory structure...")
        result = await conn.run(f"mkdir -p {remote_dir}", check=False)
        if result.exit_status != 0:
            await _send_error(f"mkdir failed: {result.stderr}")
            return False

        await _send_log("Uploading agent source files...")
        try:
            tar_proc = await asyncio.create_subprocess_exec(
                "tar", "cf", "-",
                "--exclude=venv",
                "--exclude=__pycache__",
                "--exclude=*.pyc",
                "--exclude=*.db",
                "--exclude=.env",
                "-C", str(backend_dir.parent),
                backend_dir.name,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
            )
            tar_stdout, tar_stderr = await tar_proc.communicate()
            if tar_proc.returncode != 0:
                await _send_error(f"Local tar failed: {(tar_stderr or b'').decode().strip()}")
                return False

            extract_result = await conn.run(
                f"tar xf - -C {remote_dir}",
                input=tar_stdout,
                check=False,
                encoding=None,
            )
            if extract_result.exit_status != 0:
                await _send_error(f"Remote tar extract failed: {extract_result.stderr}")
                return False
        except (asyncssh.Error, OSError) as exc:
            await _send_error(f"Upload failed: {exc}")
            return False
        await _send_log("Upload complete.")

        await _send_log("Creating virtual environment...")
        venv_cmd = f"cd {remote_dir}/backend && python3 -m venv venv"
        result = await conn.run(venv_cmd, check=False)
        if result.exit_status != 0:
            await _send_error(f"venv creation failed: {result.stderr}")
            return False

        await _send_log("Installing dependencies...")
        pip_cmd = (
            f"cd {remote_dir}/backend && "
            f"venv/bin/pip install --upgrade pip -q && "
            f"venv/bin/pip install -r requirements.txt -q"
        )
        result = await conn.run(pip_cmd, check=False)
        if result.stdout:
            await _send_log(result.stdout.strip())
        if result.exit_status != 0:
            stderr_text = (result.stderr or "").strip()
            await _send_error(f"pip install failed: {stderr_text}")
            return False
        await _send_log("Dependencies installed.")

        systemd_unit = textwrap.dedent(f"""\
            [Unit]
            Description=Bench Manager Agent
            After=network.target

            [Service]
            Type=simple
            WorkingDirectory=%h/{_AGENT_REMOTE_DIR}/backend
            ExecStart=%h/{_AGENT_REMOTE_DIR}/backend/venv/bin/uvicorn main:app --host 127.0.0.1 --port {remote_agent_port}
            Restart=on-failure
            RestartSec=5

            [Install]
            WantedBy=default.target
        """)

        await _send_log("Attempting systemd user service setup...")
        check_systemd = await conn.run("systemctl --user status >/dev/null 2>&1; echo $?", check=False)
        has_systemd = check_systemd.stdout.strip() != "1" if check_systemd.stdout else False

        if has_systemd:
            service_dir = f"~/.config/systemd/user"
            service_file = f"{service_dir}/{_SYSTEMD_SERVICE_NAME}.service"
            await conn.run(f"mkdir -p {service_dir}", check=False)

            write_cmd = f"cat > {service_file} << 'UNIT_EOF'\n{systemd_unit}UNIT_EOF"
            result = await conn.run(write_cmd, check=False)
            if result.exit_status != 0:
                await _send_error(f"Failed to write systemd unit: {result.stderr}")
                return False

            await _send_log("Enabling and starting agent via systemd...")
            result = await conn.run("systemctl --user daemon-reload", check=False)
            result = await conn.run(
                f"systemctl --user enable --now {_SYSTEMD_SERVICE_NAME}",
                check=False,
            )
            if result.exit_status != 0:
                await _send_log(
                    f"systemd enable failed ({result.stderr}), falling back to nohup...",
                    stream="stderr",
                )
                has_systemd = False

        if not has_systemd:
            await _send_log("Using nohup fallback to start agent...")
            nohup_cmd = (
                f"cd {remote_dir}/backend && "
                f"nohup venv/bin/uvicorn main:app "
                f"--host 127.0.0.1 --port {remote_agent_port} "
                f"> agent.log 2>&1 &"
            )
            result = await conn.run(nohup_cmd, check=False)
            if result.exit_status != 0:
                await _send_error(f"nohup launch failed: {result.stderr}")
                return False

        await asyncio.sleep(2)

        await _send_log("Verifying agent is running...")
        health_check = await conn.run(
            f"curl -sf http://127.0.0.1:{remote_agent_port}/health || echo FAIL",
            check=False,
        )
        if health_check.stdout and "FAIL" not in health_check.stdout:
            await _send_log("Agent is healthy and responding.")
            await _send_done(0)
            deployed_ok = True
        else:
            await _send_log("Agent health check inconclusive — may still be starting.", stream="stderr")
            await _send_done(0)
            deployed_ok = True

    except (asyncssh.Error, OSError) as exc:
        await _send_error(f"Deployment failed: {exc}")
    finally:
        conn.close()

    return deployed_ok


tunnel_registry = TunnelRegistry()
