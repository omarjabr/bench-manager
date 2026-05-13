"""Server registry CRUD and connection management routes."""

import asyncio
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlmodel import Session, select

from database import engine as db_engine, get_session
from models.server import (
    LOCAL_SERVER_ID,
    Server,
    ServerCreate,
    ServerRead,
    ServerUpdate,
)
from services.executor import create_operation_id
from services.remote import deploy_agent, tunnel_registry

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/servers", tags=["servers"])

SYNTHETIC_LOCAL = ServerRead(
    id=LOCAL_SERVER_ID,
    nickname="Local",
    host="127.0.0.1",
    ssh_user="",
    ssh_key_path="",
    remote_agent_port=0,
    local_tunnel_port=None,
    status="connected",
    agent_deployed=True,
    last_connected_at=None,
    agent_version=None,
    created_at=None,
)


def _to_read(server: Server) -> ServerRead:
    """Convert a Server ORM row to the API response model."""
    status = server.status
    if status not in ("disconnected", "connecting", "connected", "error"):
        status = "disconnected"
    return ServerRead(
        id=server.id,
        nickname=server.nickname,
        host=server.host,
        ssh_user=server.ssh_user,
        ssh_key_path=server.ssh_key_path,
        remote_agent_port=server.remote_agent_port,
        local_tunnel_port=server.local_tunnel_port,
        status=status,  # type: ignore[arg-type]
        agent_deployed=server.agent_deployed,
        last_connected_at=server.last_connected_at,
        agent_version=server.agent_version,
        created_at=server.created_at,
    )


@router.get("", response_model=list[ServerRead])
async def list_servers(
    session: Session = Depends(get_session),
) -> list[ServerRead]:
    """Return all registered servers with the synthetic ``local`` entry first."""
    rows = session.exec(select(Server).order_by(Server.nickname)).all()
    return [SYNTHETIC_LOCAL, *[_to_read(r) for r in rows]]


@router.post("", response_model=ServerRead, status_code=201)
async def create_server(
    body: ServerCreate,
    session: Session = Depends(get_session),
) -> ServerRead:
    """Register a new remote server."""
    if body.id == LOCAL_SERVER_ID:
        raise HTTPException(status_code=400, detail="'local' is a reserved server id.")

    existing = session.get(Server, body.id)
    if existing is not None:
        raise HTTPException(status_code=409, detail=f"Server '{body.id}' already exists.")

    server = Server(
        id=body.id,
        nickname=body.nickname,
        host=body.host,
        ssh_user=body.ssh_user,
        ssh_key_path=body.ssh_key_path,
        remote_agent_port=body.remote_agent_port,
    )
    session.add(server)
    session.commit()
    session.refresh(server)
    return _to_read(server)


@router.get("/{server_id}", response_model=ServerRead)
async def get_server(
    server_id: str,
    session: Session = Depends(get_session),
) -> ServerRead:
    """Return a single server by id."""
    if server_id == LOCAL_SERVER_ID:
        return SYNTHETIC_LOCAL

    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found.")
    return _to_read(server)


@router.put("/{server_id}", response_model=ServerRead)
async def update_server(
    server_id: str,
    body: ServerUpdate,
    session: Session = Depends(get_session),
) -> ServerRead:
    """Update a server's configuration fields."""
    if server_id == LOCAL_SERVER_ID:
        raise HTTPException(status_code=400, detail="Cannot modify the local server.")

    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found.")

    update_data = body.model_dump(exclude_unset=True)
    for key, value in update_data.items():
        setattr(server, key, value)

    session.add(server)
    session.commit()
    session.refresh(server)
    return _to_read(server)


@router.delete("/{server_id}", status_code=204)
async def delete_server(
    server_id: str,
    session: Session = Depends(get_session),
) -> None:
    """Remove a server record. Disconnects the tunnel if active."""
    if server_id == LOCAL_SERVER_ID:
        raise HTTPException(status_code=400, detail="Cannot delete the local server.")

    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found.")

    session.delete(server)
    session.commit()


@router.post("/{server_id}/connect", response_model=ServerRead)
async def connect_server(
    server_id: str,
    session: Session = Depends(get_session),
) -> ServerRead:
    """Open an SSH tunnel to the remote agent."""
    if server_id == LOCAL_SERVER_ID:
        return SYNTHETIC_LOCAL

    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found.")

    server.status = "connecting"
    session.add(server)
    session.commit()
    session.refresh(server)

    try:
        local_port = await tunnel_registry.connect(
            server_id=server.id,
            host=server.host,
            ssh_user=server.ssh_user,
            ssh_key_path=server.ssh_key_path,
            remote_agent_port=server.remote_agent_port,
        )
    except Exception as exc:
        logger.exception("Tunnel connect failed for %s", server_id)
        server.status = "error"
        session.add(server)
        session.commit()
        session.refresh(server)
        raise HTTPException(
            status_code=502,
            detail=f"SSH tunnel failed: {exc}",
        ) from exc

    agent_healthy = await tunnel_registry.health_check(server_id)
    if not agent_healthy:
        await tunnel_registry.disconnect(server_id)
        server.status = "error"
        server.local_tunnel_port = None
        session.add(server)
        session.commit()
        session.refresh(server)
        raise HTTPException(
            status_code=502,
            detail=(
                f"SSH tunnel opened but the remote agent on port "
                f"{server.remote_agent_port} is not responding. "
                f"Deploy the agent first via POST /servers/{server_id}/deploy."
            ),
        )

    server.status = "connected"
    server.local_tunnel_port = local_port
    server.last_connected_at = datetime.now(timezone.utc)
    server.agent_deployed = True
    session.add(server)
    session.commit()
    session.refresh(server)
    return _to_read(server)


@router.post("/{server_id}/disconnect", response_model=ServerRead)
async def disconnect_server(
    server_id: str,
    session: Session = Depends(get_session),
) -> ServerRead:
    """Close the SSH tunnel to the remote agent."""
    if server_id == LOCAL_SERVER_ID:
        return SYNTHETIC_LOCAL

    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found.")

    await tunnel_registry.disconnect(server_id)

    server.status = "disconnected"
    server.local_tunnel_port = None
    session.add(server)
    session.commit()
    session.refresh(server)

    logger.info("Disconnect completed for server %s.", server_id)
    return _to_read(server)


@router.post("/{server_id}/deploy", response_model=dict)
async def deploy_server_agent(
    request: Request,
    server_id: str,
    session: Session = Depends(get_session),
) -> dict[str, str]:
    """Deploy the bench-manager agent to a remote server.

    Returns an ``operation_id`` so the frontend can stream deployment logs
    via ``LogStream``.
    """
    if server_id == LOCAL_SERVER_ID:
        raise HTTPException(status_code=400, detail="Cannot deploy agent to the local server.")

    server = session.get(Server, server_id)
    if server is None:
        raise HTTPException(status_code=404, detail=f"Server '{server_id}' not found.")

    operation_id = create_operation_id()
    ws_manager = request.app.state.ws_manager

    async def _task() -> None:
        try:
            success = await deploy_agent(
                server_id=server.id,
                host=server.host,
                ssh_user=server.ssh_user,
                ssh_key_path=server.ssh_key_path,
                remote_agent_port=server.remote_agent_port,
                operation_id=operation_id,
                ws_manager=ws_manager,
            )
            if success:
                with Session(db_engine) as s:
                    db_server = s.get(Server, server_id)
                    if db_server is not None:
                        db_server.agent_deployed = True
                        s.add(db_server)
                        s.commit()
        except Exception:
            logger.exception("Deploy task failed for server %s", server_id)

    asyncio.create_task(_task())
    return {"operation_id": operation_id}
