"""System analytics metrics endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Depends

from models.system_analytics import SystemAnalyticsSnapshot
from services.dispatcher import call_remote, get_server_id, is_local
from services.system_analytics import collect_system_analytics

router = APIRouter(tags=["system-analytics"])


@router.get("/system-analytics", response_model=SystemAnalyticsSnapshot)
async def get_system_analytics(
    server_id: str = Depends(get_server_id),
) -> SystemAnalyticsSnapshot:
    """
    Return a snapshot of current system resource metrics.

    Includes CPU, memory, disk, network utilization, boot time,
    and process count for the target server.
    """
    if not is_local(server_id):
        data = await call_remote(server_id, "GET", "/api/system-analytics")
        return SystemAnalyticsSnapshot.model_validate(data)
    return await collect_system_analytics()
