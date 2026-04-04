"""Unit tests for ``services.discovery`` (filesystem operations are isolated to ``tmp_path``)."""

from __future__ import annotations

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
    (bench_dir / "apps" / "frappe" / "frappe" / "__init__.py").write_text(
        '__version__ = "15.1.0"\n',
        encoding="utf-8",
    )
    (bench_dir / "sites" / "apps.txt").write_text("frappe\nerpnext\n", encoding="utf-8")
    (bench_dir / "apps" / "erpnext" / "erpnext").mkdir(parents=True)
    (bench_dir / "apps" / "erpnext" / "erpnext" / "__init__.py").write_text(
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
    """Detail view uses ``bench list-apps`` for per-site apps, Procfile, and status."""
    bench = tmp_path / "detail-bench"
    _write_valid_bench(bench)

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("running", 1234))
    monkeypatch.setattr(
        discovery,
        "_list_installed_app_names_via_bench",
        lambda _b, _s: ["frappe", "erpnext"],
    )

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
    mysite = next(s for s in detail.sites if s.name == "mysite")
    assert {(a.name, a.version) for a in mysite.installed_apps} == {
        ("frappe", "15.1.0"),
        ("erpnext", "15.0.1"),
    }


def test_read_version_py_accepts_double_and_single_quoted_assignments(
    tmp_path: Path,
) -> None:
    """``_read_version_py`` parses ``__version__`` whether the value uses ``\"`` or ``'``."""
    double_quoted = tmp_path / "v_double.py"
    double_quoted.write_text('__version__ = "15.2.3"\n', encoding="utf-8")
    assert discovery._read_version_py(double_quoted) == "15.2.3"

    single_quoted = tmp_path / "v_single.py"
    single_quoted.write_text("__version__ = '14.9.0'\n", encoding="utf-8")
    assert discovery._read_version_py(single_quoted) == "14.9.0"


def test_count_bench_app_entries_prefers_sites_apps_txt_and_fallbacks(tmp_path: Path) -> None:
    """App count uses ``sites/apps.txt``, then root ``apps.txt``, then ``sites/apps.json``."""
    b1 = tmp_path / "bench1"
    (b1 / "sites").mkdir(parents=True)
    (b1 / "sites" / "apps.txt").write_text("a\nb\n", encoding="utf-8")
    assert discovery._count_bench_app_entries(b1) == 2

    b2 = tmp_path / "bench2"
    b2.mkdir()
    (b2 / "apps.txt").write_text("x\n", encoding="utf-8")
    assert discovery._count_bench_app_entries(b2) == 1

    b3 = tmp_path / "bench3"
    (b3 / "sites").mkdir(parents=True)
    (b3 / "sites" / "apps.json").write_text('["frappe", "erpnext"]', encoding="utf-8")
    assert discovery._count_bench_app_entries(b3) == 2


def test_parse_bench_list_apps_stdout_strips_lines() -> None:
    """``_parse_bench_list_apps_stdout`` collects one app name per non-empty line."""
    raw = "  frappe  \n\nerpnext\n"
    assert discovery._parse_bench_list_apps_stdout(raw) == ["frappe", "erpnext"]


def test_site_installed_apps_follows_bench_list_apps_not_filesystem(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Installed app names come from ``bench list-apps``, not ``apps.txt`` on disk."""
    bench = tmp_path / "cfg-bench"
    _write_valid_bench(bench)
    (bench / "sites" / "mysite" / "apps.txt").write_text(
        "frappe\nerpnext\nphantom\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))
    monkeypatch.setattr(
        discovery,
        "_list_installed_app_names_via_bench",
        lambda _b, _s: ["frappe"],
    )

    detail = discovery.get_bench_detail(bench)
    mysite = next(s for s in detail.sites if s.name == "mysite")
    assert [a.name for a in mysite.installed_apps] == ["frappe"]


def test_get_bench_detail_empty_when_bench_list_apps_returns_nothing(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """If ``bench list-apps`` yields no apps, the site has an empty list (no exception)."""
    bench = tmp_path / "no-site-apps"
    (bench / "apps" / "frappe" / "frappe").mkdir(parents=True)
    (bench / "sites" / "emptysite").mkdir(parents=True)
    (bench / "env").mkdir(parents=True)
    (bench / "Procfile").write_text("web: bench serve --port 8000\n", encoding="utf-8")
    (bench / "apps" / "frappe" / "frappe" / "__init__.py").write_text(
        '__version__ = "15.1.0"\n',
        encoding="utf-8",
    )
    (bench / "sites" / "apps.txt").write_text("frappe\n", encoding="utf-8")

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))
    monkeypatch.setattr(
        discovery,
        "_list_installed_app_names_via_bench",
        lambda _b, _s: [],
    )

    detail = discovery.get_bench_detail(bench)
    site = next(s for s in detail.sites if s.name == "emptysite")
    assert site.installed_apps == []


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
