"""SQLModel table for remote servers and Pydantic request/response schemas."""

from datetime import datetime, timezone
from typing import Annotated, Literal

from pydantic import BaseModel, Field
from sqlmodel import Field as SQLField
from sqlmodel import SQLModel

ServerStatus = Literal["disconnected", "connecting", "connected", "error"]

LOCAL_SERVER_ID = "local"


class Server(SQLModel, table=True):
    """A remote server managed via SSH tunnel to a Bench Manager agent."""

    id: str = SQLField(primary_key=True)
    nickname: str = SQLField(index=True)
    host: str
    ssh_user: str
    ssh_key_path: str = SQLField(default="")
    remote_agent_port: int = SQLField(default=8765)
    local_tunnel_port: int | None = SQLField(default=None)
    status: str = SQLField(default="disconnected")
    last_connected_at: datetime | None = SQLField(default=None)
    agent_deployed: bool = SQLField(default=False)
    agent_version: str | None = SQLField(default=None)
    created_at: datetime = SQLField(default_factory=lambda: datetime.now(timezone.utc))


class ServerCreate(BaseModel):
    """Payload for creating a new server entry."""

    id: Annotated[str, Field(min_length=1, max_length=64, pattern=r"^[a-z0-9][a-z0-9\-]*$")]
    nickname: Annotated[str, Field(min_length=1, max_length=128)]
    host: Annotated[str, Field(min_length=1)]
    ssh_user: Annotated[str, Field(min_length=1)]
    ssh_key_path: str = ""
    remote_agent_port: Annotated[int, Field(ge=1, le=65535)] = 8765


class ServerUpdate(BaseModel):
    """Payload for updating an existing server entry."""

    nickname: Annotated[str, Field(min_length=1, max_length=128)] | None = None
    host: Annotated[str, Field(min_length=1)] | None = None
    ssh_user: Annotated[str, Field(min_length=1)] | None = None
    ssh_key_path: str | None = None
    remote_agent_port: Annotated[int, Field(ge=1, le=65535)] | None = None


class ServerRead(BaseModel):
    """API representation of a server record (including the synthetic ``local`` entry)."""

    id: str
    nickname: str
    host: str
    ssh_user: str
    ssh_key_path: str
    remote_agent_port: int
    local_tunnel_port: int | None
    status: ServerStatus
    agent_deployed: bool
    last_connected_at: datetime | None
    agent_version: str | None
    created_at: datetime | None
