"""Tests for system analytics metrics collection."""

from __future__ import annotations

from typing import Any
from unittest.mock import MagicMock

import pytest

from services import system_analytics


class _FakeVirtualMemory:
    """Mock for psutil.virtual_memory() result."""

    def __init__(self) -> None:
        self.used = 8_000_000_000
        self.total = 16_000_000_000
        self.percent = 50.0


class _FakeDiskUsage:
    """Mock for psutil.disk_usage() result."""

    def __init__(self) -> None:
        self.used = 100_000_000_000
        self.total = 500_000_000_000
        self.percent = 20.0


class _FakeNetIOCounters:
    """Mock for psutil.net_io_counters() result."""

    def __init__(self) -> None:
        self.bytes_sent = 1_000_000
        self.bytes_recv = 5_000_000


@pytest.mark.asyncio
async def test_collect_system_analytics_returns_snapshot(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify that collect_system_analytics returns a valid snapshot."""
    monkeypatch.setattr("psutil.cpu_percent", MagicMock(return_value=25.5))
    monkeypatch.setattr("psutil.virtual_memory", MagicMock(return_value=_FakeVirtualMemory()))
    monkeypatch.setattr("psutil.disk_usage", MagicMock(return_value=_FakeDiskUsage()))
    monkeypatch.setattr("psutil.net_io_counters", MagicMock(return_value=_FakeNetIOCounters()))
    monkeypatch.setattr("psutil.boot_time", MagicMock(return_value=1700000000.0))
    monkeypatch.setattr("psutil.pids", MagicMock(return_value=list(range(150))))

    snapshot = await system_analytics.collect_system_analytics()

    assert snapshot.cpu_percent == 25.5
    assert snapshot.memory_used_bytes == 8_000_000_000
    assert snapshot.memory_total_bytes == 16_000_000_000
    assert snapshot.memory_percent == 50.0
    assert snapshot.disk_used_bytes == 100_000_000_000
    assert snapshot.disk_total_bytes == 500_000_000_000
    assert snapshot.disk_percent == 20.0
    assert snapshot.network_bytes_sent == 1_000_000
    assert snapshot.network_bytes_recv == 5_000_000
    assert snapshot.boot_time == 1700000000.0
    assert snapshot.process_count == 150


@pytest.mark.asyncio
async def test_collect_snapshot_sync_uses_correct_psutil_calls(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Verify that _collect_snapshot_sync calls the correct psutil functions."""
    cpu_mock = MagicMock(return_value=10.0)
    vm_mock = MagicMock(return_value=_FakeVirtualMemory())
    disk_mock = MagicMock(return_value=_FakeDiskUsage())
    net_mock = MagicMock(return_value=_FakeNetIOCounters())
    boot_mock = MagicMock(return_value=1700000000.0)
    pids_mock = MagicMock(return_value=[1, 2, 3])

    monkeypatch.setattr("psutil.cpu_percent", cpu_mock)
    monkeypatch.setattr("psutil.virtual_memory", vm_mock)
    monkeypatch.setattr("psutil.disk_usage", disk_mock)
    monkeypatch.setattr("psutil.net_io_counters", net_mock)
    monkeypatch.setattr("psutil.boot_time", boot_mock)
    monkeypatch.setattr("psutil.pids", pids_mock)

    snapshot = system_analytics._collect_snapshot_sync()  # noqa: SLF001

    cpu_mock.assert_called_once_with(interval=None)
    vm_mock.assert_called_once()
    disk_mock.assert_called_once_with("/")
    net_mock.assert_called_once()
    boot_mock.assert_called_once()
    pids_mock.assert_called_once()

    assert snapshot.process_count == 3
