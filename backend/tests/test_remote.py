"""Tests for ``services.remote`` — TunnelRegistry with mocked asyncssh."""

from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest

from services.remote import TunnelRegistry


@pytest.fixture
def registry() -> TunnelRegistry:
    return TunnelRegistry()


@pytest.fixture
def mock_asyncssh_connect() -> MagicMock:
    """Patch ``asyncssh.connect`` to return a mock connection with a mock listener."""
    conn = AsyncMock()

    listener = MagicMock()
    listener.get_port.return_value = 54321
    listener.close = MagicMock()

    conn.forward_local_port = AsyncMock(return_value=listener)
    conn.close = MagicMock()

    with patch("services.remote.asyncssh") as mock_ssh:
        mock_ssh.connect = AsyncMock(return_value=conn)
        mock_ssh.Error = Exception
        yield mock_ssh


@pytest.mark.asyncio
async def test_connect_opens_tunnel_and_returns_port(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    port = await registry.connect(
        server_id="staging",
        host="staging.example.com",
        ssh_user="deploy",
        ssh_key_path="/home/deploy/.ssh/id_rsa",
        remote_agent_port=8765,
    )

    assert port == 54321
    assert registry.is_connected("staging")
    assert registry.get_local_port("staging") == 54321

    mock_asyncssh_connect.connect.assert_awaited_once()
    call_kwargs = mock_asyncssh_connect.connect.call_args[1]
    assert call_kwargs["host"] == "staging.example.com"
    assert call_kwargs["username"] == "deploy"

    await registry.disconnect("staging")


@pytest.mark.asyncio
async def test_connect_reuses_existing_tunnel(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    port1 = await registry.connect(
        server_id="prod",
        host="prod.example.com",
        ssh_user="deploy",
        ssh_key_path="",
        remote_agent_port=8765,
    )
    port2 = await registry.connect(
        server_id="prod",
        host="prod.example.com",
        ssh_user="deploy",
        ssh_key_path="",
        remote_agent_port=8765,
    )

    assert port1 == port2
    assert mock_asyncssh_connect.connect.await_count == 1

    await registry.disconnect("prod")


@pytest.mark.asyncio
async def test_disconnect_cleans_up(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    await registry.connect(
        server_id="test",
        host="test.example.com",
        ssh_user="user",
        ssh_key_path="",
        remote_agent_port=8000,
    )
    assert registry.is_connected("test")

    await registry.disconnect("test")

    assert not registry.is_connected("test")
    assert registry.get_local_port("test") is None


@pytest.mark.asyncio
async def test_disconnect_nonexistent_is_noop(registry: TunnelRegistry) -> None:
    await registry.disconnect("nonexistent")


@pytest.mark.asyncio
async def test_disconnect_all(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    await registry.connect(
        server_id="a", host="a.com", ssh_user="u", ssh_key_path="", remote_agent_port=8000
    )
    await registry.connect(
        server_id="b", host="b.com", ssh_user="u", ssh_key_path="", remote_agent_port=8000
    )

    assert registry.is_connected("a")
    assert registry.is_connected("b")

    await registry.disconnect_all()

    assert not registry.is_connected("a")
    assert not registry.is_connected("b")


@pytest.mark.asyncio
async def test_connect_without_ssh_key_omits_client_keys(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    await registry.connect(
        server_id="nokey",
        host="host.example.com",
        ssh_user="deploy",
        ssh_key_path="",
        remote_agent_port=8765,
    )

    call_kwargs = mock_asyncssh_connect.connect.call_args[1]
    assert "client_keys" not in call_kwargs

    await registry.disconnect("nokey")


@pytest.mark.asyncio
async def test_health_check_returns_true_on_success(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    await registry.connect(
        server_id="healthy",
        host="h.example.com",
        ssh_user="u",
        ssh_key_path="",
        remote_agent_port=8765,
    )

    mock_response = MagicMock()
    mock_response.raise_for_status = MagicMock()

    with patch("services.remote.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(return_value=mock_response)
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await registry.health_check("healthy")

    assert result is True
    await registry.disconnect("healthy")


@pytest.mark.asyncio
async def test_health_check_returns_false_on_failure(
    registry: TunnelRegistry, mock_asyncssh_connect: MagicMock
) -> None:
    await registry.connect(
        server_id="unhealthy",
        host="u.example.com",
        ssh_user="u",
        ssh_key_path="",
        remote_agent_port=8765,
    )

    with patch("services.remote.httpx.AsyncClient") as mock_client_cls:
        mock_client = AsyncMock()
        mock_client.get = AsyncMock(side_effect=httpx.ConnectError("refused"))
        mock_client_cls.return_value.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client_cls.return_value.__aexit__ = AsyncMock(return_value=False)

        result = await registry.health_check("unhealthy")

    assert result is False
    await registry.disconnect("unhealthy")


@pytest.mark.asyncio
async def test_health_check_returns_false_when_not_connected(
    registry: TunnelRegistry,
) -> None:
    result = await registry.health_check("nonexistent")
    assert result is False
