"""Shared WebSocket connection registry for operations streaming and bench broadcasts."""

import logging

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class ConnectionManager:
    """Tracks active WebSocket connections keyed by client id."""

    def __init__(self) -> None:
        self._connections: dict[str, WebSocket] = {}

    async def connect(self, websocket: WebSocket, client_id: str) -> None:
        """Accept the socket and store it under ``client_id``."""
        await websocket.accept()
        self._connections[client_id] = websocket

    def disconnect(self, client_id: str) -> None:
        """Remove a connection if present."""
        self._connections.pop(client_id, None)

    async def send(self, client_id: str, message: str) -> None:
        """Send a text frame to a single client; drop silently if the client is gone."""
        connection = self._connections.get(client_id)
        if connection is None:
            return
        try:
            await connection.send_text(message)
        except Exception:
            logger.debug("Dropping stale WebSocket for client %s", client_id, exc_info=True)
            self._connections.pop(client_id, None)

    async def broadcast(self, message: str) -> None:
        """Send a text frame to every connected client; drop failures silently."""
        for client_id in list(self._connections.keys()):
            await self.send(client_id, message)


connection_manager = ConnectionManager()
