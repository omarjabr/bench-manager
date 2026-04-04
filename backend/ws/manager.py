"""Shared WebSocket connection registry for operations streaming and bench broadcasts."""

from fastapi import WebSocket


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
        """Send a text frame to a single client."""
        connection = self._connections.get(client_id)
        if connection is None:
            return
        await connection.send_text(message)

    async def broadcast(self, message: str) -> None:
        """Send a text frame to every connected client."""
        for connection in list(self._connections.values()):
            await connection.send_text(message)
