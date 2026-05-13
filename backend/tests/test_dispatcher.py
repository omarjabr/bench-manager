"""Tests for ``services.dispatcher`` — remote call fan-out and helpers."""

from __future__ import annotations

from unittest.mock import AsyncMock, MagicMock, patch

import httpx
import pytest
from fastapi import HTTPException

from services.dispatcher import (
    _agent_base_url,
    call_remote,
    get_server_id,
    is_local,
)


class TestIsLocal:
    def test_local_string(self) -> None:
        assert is_local("local") is True

    def test_remote_string(self) -> None:
        assert is_local("staging") is False


class TestGetServerIdDefault:
    def test_returns_provided_value(self) -> None:
        assert get_server_id("staging") == "staging"

    def test_returns_local_when_given_explicitly(self) -> None:
        assert get_server_id("local") == "local"


class TestAgentBaseUrl:
    def test_raises_when_no_tunnel(self) -> None:
        with patch("services.dispatcher.tunnel_registry") as mock_reg:
            mock_reg.get_local_port.return_value = None
            with pytest.raises(HTTPException) as exc_info:
                _agent_base_url("staging")
            assert exc_info.value.status_code == 502

    def test_returns_localhost_url(self) -> None:
        with patch("services.dispatcher.tunnel_registry") as mock_reg:
            mock_reg.get_local_port.return_value = 55555
            url = _agent_base_url("staging")
            assert url == "http://127.0.0.1:55555"


@pytest.mark.asyncio
async def test_call_remote_forwards_get_request() -> None:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = [{"name": "bench-a"}]

    with patch("services.dispatcher.tunnel_registry") as mock_reg:
        mock_reg.get_local_port.return_value = 12345
        with patch("services.dispatcher.httpx.AsyncClient") as mock_client_cls:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=mock_response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = instance

            result = await call_remote("staging", "GET", "/api/benches")

    assert result == [{"name": "bench-a"}]
    instance.request.assert_awaited_once()
    call_kwargs = instance.request.call_args
    assert call_kwargs[1]["method"] == "GET"
    assert "12345" in call_kwargs[1]["url"]


@pytest.mark.asyncio
async def test_call_remote_strips_server_param() -> None:
    mock_response = MagicMock()
    mock_response.status_code = 200
    mock_response.json.return_value = {}

    with patch("services.dispatcher.tunnel_registry") as mock_reg:
        mock_reg.get_local_port.return_value = 12345
        with patch("services.dispatcher.httpx.AsyncClient") as mock_client_cls:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=mock_response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = instance

            await call_remote(
                "staging",
                "GET",
                "/api/benches",
                params={"server": "staging", "page": "1"},
            )

    call_kwargs = instance.request.call_args[1]
    params = call_kwargs.get("params", {})
    assert "server" not in (params or {})
    assert params.get("page") == "1"


@pytest.mark.asyncio
async def test_call_remote_raises_on_4xx() -> None:
    mock_response = MagicMock()
    mock_response.status_code = 404
    mock_response.json.return_value = {"detail": "Not found"}
    mock_response.text = "Not found"

    with patch("services.dispatcher.tunnel_registry") as mock_reg:
        mock_reg.get_local_port.return_value = 12345
        with patch("services.dispatcher.httpx.AsyncClient") as mock_client_cls:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=mock_response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = instance

            with pytest.raises(HTTPException) as exc_info:
                await call_remote("staging", "GET", "/api/benches/missing")
            assert exc_info.value.status_code == 404


@pytest.mark.asyncio
async def test_call_remote_returns_none_on_204() -> None:
    mock_response = MagicMock()
    mock_response.status_code = 204

    with patch("services.dispatcher.tunnel_registry") as mock_reg:
        mock_reg.get_local_port.return_value = 12345
        with patch("services.dispatcher.httpx.AsyncClient") as mock_client_cls:
            instance = AsyncMock()
            instance.request = AsyncMock(return_value=mock_response)
            instance.__aenter__ = AsyncMock(return_value=instance)
            instance.__aexit__ = AsyncMock(return_value=None)
            mock_client_cls.return_value = instance

            result = await call_remote("staging", "POST", "/api/benches/b/stop")
            assert result is None
