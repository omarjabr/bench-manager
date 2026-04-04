"""Unit tests for ``services.discovery`` (filesystem operations are isolated to ``tmp_path``)."""

from __future__ import annotations

import json
from pathlib import Path
from unittest.mock import MagicMock

import pytest

from services import discovery


def _write_valid_bench(bench_dir: Path) -> None:
    """Create a minimal valid bench layout under ``bench_dir``."""
    (bench_dir / "apps" / "frappe" / "frappe").mkdir(parents=True)
    (bench_dir / "sites" / "mysite").mkdir(parents=True)
    (bench_dir / "env").mkdir(parents=True)
    (bench_dir / "Procfile").write_text("web: bench serve --port 8000\n", encoding="utf-8")
    (bench_dir / "apps" / "frappe" / "frappe" / "__version__.py").write_text(
        '__version__ = "15.1.0"\n',
        encoding="utf-8",
    )
    (bench_dir / "apps.txt").write_text("frappe\nerpnext\n", encoding="utf-8")
    (bench_dir / "sites" / "mysite" / "site_config.json").write_text(
        json.dumps({"installed_apps": ["frappe", "erpnext"]}),
        encoding="utf-8",
    )
    (bench_dir / "apps" / "erpnext" / "erpnext").mkdir(parents=True)
    (bench_dir / "apps" / "erpnext" / "erpnext" / "__version__.py").write_text(
        '__version__ = "15.0.1"\n',
        encoding="utf-8",
    )


def test_scan_for_benches_finds_valid_bench(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """A top-level directory with the required layout is returned as a summary."""
    bench = tmp_path / "my-bench"
    _write_valid_bench(bench)

    class _Settings:
        excluded_paths = ["*/venv/*", "*/node_modules/*", "*/.cache/*"]

    monkeypatch.setattr(discovery, "get_settings", lambda: _Settings())
    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    result = discovery.scan_for_benches(tmp_path)
    assert len(result) == 1
    summary = result[0]
    assert summary.name == "my-bench"
    assert summary.frappe_version == "15.1.0"
    assert summary.site_count == 1
    assert summary.app_count == 2
    assert summary.status == "stopped"


def test_scan_for_benches_respects_excluded_paths(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Candidates whose path matches an excluded glob are skipped."""
    bench = tmp_path / "skipped-bench"
    _write_valid_bench(bench)

    class _Settings:
        excluded_paths = ["*/venv/*", "*/node_modules/*", "*/.cache/*"]

    monkeypatch.setattr(discovery, "get_settings", lambda: _Settings())
    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))
    monkeypatch.setattr(discovery, "_path_matches_excluded", lambda *_args, **_kwargs: True)

    assert discovery.scan_for_benches(tmp_path) == []


def test_path_matches_excluded_uses_configured_globs() -> None:
    """``_path_matches_excluded`` mirrors ``fnmatch`` against resolved paths."""
    assert discovery._path_matches_excluded(
        Path("/home/user/project/venv/myenv"),
        ["*/venv/*"],
    ) is True
    assert discovery._path_matches_excluded(
        Path("/home/user/my-bench"),
        ["*/venv/*"],
    ) is False


def test_scan_for_benches_skips_incomplete_layout(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Directories missing required bench files are ignored."""
    incomplete = tmp_path / "not-a-bench"
    incomplete.mkdir()
    (incomplete / "apps").mkdir()
    (incomplete / "sites").mkdir()

    class _Settings:
        excluded_paths = ["*/venv/*", "*/node_modules/*", "*/.cache/*"]

    monkeypatch.setattr(discovery, "get_settings", lambda: _Settings())
    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    assert discovery.scan_for_benches(tmp_path) == []


def test_get_bench_detail_reads_sites_apps_and_procfile(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Detail view aggregates site config, app versions, Procfile, and process status."""
    bench = tmp_path / "detail-bench"
    _write_valid_bench(bench)

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("running", 1234))

    detail = discovery.get_bench_detail(bench)
    assert detail.name == "detail-bench"
    assert detail.frappe_version == "15.1.0"
    assert detail.site_count == 1
    assert detail.app_count == 2
    assert detail.status == "running"
    assert detail.pid == 1234
    assert detail.ports["web"] == "bench serve --port 8000"
    assert {site.name for site in detail.sites} == {"mysite"}
    assert {app.name for app in detail.apps} == {"frappe", "erpnext"}


def test_scan_for_benches_logs_and_skips_on_permission_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """PermissionError while inspecting a candidate is swallowed (warning logged)."""
    bench = tmp_path / "bad-bench"
    _write_valid_bench(bench)

    class _Settings:
        excluded_paths = ["*/venv/*", "*/node_modules/*", "*/.cache/*"]

    monkeypatch.setattr(discovery, "get_settings", lambda: _Settings())
    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    real_is_dir = Path.is_dir

    def flaky_is_dir(self: Path) -> bool:
        if self.name == "bad-bench" and self.parent == tmp_path:
            raise PermissionError("denied")
        return real_is_dir(self)

    monkeypatch.setattr(Path, "is_dir", flaky_is_dir)

    log_mock = MagicMock()
    monkeypatch.setattr(discovery.logger, "warning", log_mock)

    assert discovery.scan_for_benches(tmp_path) == []
    assert log_mock.called
