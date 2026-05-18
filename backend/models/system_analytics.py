"""Pydantic models for system analytics metrics."""

from pydantic import BaseModel, Field


class SystemAnalyticsSnapshot(BaseModel):
    """
    A point-in-time snapshot of system resource metrics.

    Contains CPU, memory, disk, network, and process information
    collected via psutil.
    """

    cpu_percent: float = Field(
        description="Current CPU utilization as a percentage (0-100)"
    )
    memory_used_bytes: int = Field(
        description="Currently used memory in bytes"
    )
    memory_total_bytes: int = Field(
        description="Total system memory in bytes"
    )
    memory_percent: float = Field(
        description="Memory utilization as a percentage (0-100)"
    )
    disk_used_bytes: int = Field(
        description="Currently used disk space in bytes on root partition"
    )
    disk_total_bytes: int = Field(
        description="Total disk space in bytes on root partition"
    )
    disk_percent: float = Field(
        description="Disk utilization as a percentage (0-100)"
    )
    network_bytes_sent: int = Field(
        description="Total bytes sent over all network interfaces since boot"
    )
    network_bytes_recv: int = Field(
        description="Total bytes received over all network interfaces since boot"
    )
    boot_time: float = Field(
        description="System boot time as a Unix timestamp"
    )
    process_count: int = Field(
        description="Total number of running processes"
    )
