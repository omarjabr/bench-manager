"""Server-aware request dispatcher.

Every bench-manager route reads a ``server`` query parameter (default ``"local"``).
When the value is ``"local"`` the handler executes in-process as usual.  For any
other ``server_id`` the request is forwarded through the SSH tunnel to the
corresponding remote agent via :func:`call_remote`, and WebSocket frames are
relayed via :func:`proxy_websocket`.
"""

from __future__ import annotations

import asyncio
import json
import logging
from typing import Any

import httpx
from fastapi import HTTPException, Query, WebSocket
from starlette.websockets import WebSocketDisconnect

from models.server import LOCAL_SERVER_ID
from services.remote import tunnel_registry

logger = logging.getLogger(__name__)

_HTTP_TIMEOUT = 30.0


def get_server_id(server: str = Query(default=LOCAL_SERVER_ID)) -> str:
    """FastAPI dependency that extracts the ``?server=`` query parameter."""
    return server


def is_local(server_id: str) -> bool:
    """Return ``True`` when the request targets the local machine."""
    return server_id == LOCAL_SERVER_ID


def _agent_base_url(server_id: str) -> str:
    """Resolve the base URL for a remote agent's tunnelled port."""
    port = tunnel_registry.get_local_port(server_id)
    if port is None:
        raise HTTPException(
            status_code=502,
            detail=f"No active tunnel for server '{server_id}'. Connect first.",
        )
    return f"http://127.0.0.1:{port}"


async def call_remote(
    server_id: str,
    method: str,
    path: str,
    body: Any | None = None,
    params: dict[str, Any] | None = None,
) -> Any:
    """Forward an HTTP request to a remote agent and return the JSON response.

    The remote agent exposes the same REST API as the local backend, so *path*
    is the full route (e.g. ``/api/benches``).  The ``?server=`` query parameter
    is stripped so the remote agent treats it as a local call.
    """
    base = _agent_base_url(server_id)
    url = f"{base}{path}"

    cleaned_params = dict(params) if params else {}
    cleaned_params.pop("server", None)

    try:
        async with httpx.AsyncClient(timeout=_HTTP_TIMEOUT) as client:
            resp = await client.request(
                method=method.upper(),
                url=url,
                json=body,
                params=cleaned_params or None,
            )
    except (httpx.HTTPError, OSError) as exc:
        logger.warning("Remote call to %s %s failed: %s", method, url, exc)
        raise HTTPException(
            status_code=502,
            detail=f"Remote agent unreachable: {exc}",
        ) from exc

    if resp.status_code >= 400:
        try:
            detail = resp.json().get("detail", resp.text)
        except Exception:
            detail = resp.text
        raise HTTPException(status_code=resp.status_code, detail=detail)

    if resp.status_code == 204:
        return None

    return resp.json()


async def proxy_websocket(
    server_id: str,
    path: str,
    client_ws: WebSocket,
) -> None:
    """Relay WebSocket frames between the browser and a remote agent.

    Opens a client WebSocket to the remote agent through the SSH tunnel and
    shuttles text frames bidirectionally until one side disconnects.
    """
    port = tunnel_registry.get_local_port(server_id)
    if port is None:
        await client_ws.close(
            code=4502,
            reason=f"No active tunnel for server '{server_id}'.",
        )
        return

    remote_url = f"ws://127.0.0.1:{port}{path}"

    await client_ws.accept()

    import websockets

    try:
        async with websockets.connect(remote_url) as remote_ws:

            async def _browser_to_remote() -> None:
                try:
                    while True:
                        data = await client_ws.receive_text()
                        await remote_ws.send(data)
                except WebSocketDisconnect:
                    pass

            async def _remote_to_browser() -> None:
                async for message in remote_ws:
                    if isinstance(message, str):
                        await client_ws.send_text(message)
                    elif isinstance(message, bytes):
                        await client_ws.send_bytes(message)

            done, pending = await asyncio.wait(
                [
                    asyncio.create_task(_browser_to_remote()),
                    asyncio.create_task(_remote_to_browser()),
                ],
                return_when=asyncio.FIRST_COMPLETED,
            )
            for task in pending:
                task.cancel()

    except (OSError, websockets.exceptions.WebSocketException) as exc:
        logger.warning("WebSocket proxy for %s failed: %s", server_id, exc)
    except WebSocketDisconnect:
        pass
