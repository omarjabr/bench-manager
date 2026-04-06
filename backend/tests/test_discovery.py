"""Unit tests for ``services.discovery`` (filesystem operations are isolated to ``tmp_path``)."""

from __future__ import annotations

import logging
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
    (bench_dir / "sites" / "mysite" / "apps.txt").write_text(
        "frappe\nerpnext\n",
        encoding="utf-8",
    )
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
    """Detail view uses ``sites/<site>/apps.txt`` for per-site apps, Procfile, and status."""
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


def test_parse_site_apps_txt_strips_lines_and_skips_comments() -> None:
    """``_parse_site_apps_txt`` uses the first token per line; skips comments and blanks."""
    raw = "  frappe  \n\nerpnext\n# ignored\n"
    assert discovery._parse_site_apps_txt(raw) == ["frappe", "erpnext"]


def test_parse_site_apps_txt_first_token_strips_inline_version() -> None:
    """Inline version or branch text after the app name is ignored."""
    raw = "frappe 15.103.3 version-15\nerpnext 15.103.1 version-15\n"
    assert discovery._parse_site_apps_txt(raw) == ["frappe", "erpnext"]


def test_read_lines_from_site_apps_txt_logs_raw_lines_at_debug(
    tmp_path: Path,
    caplog: pytest.LogCaptureFixture,
) -> None:
    """Debug log includes split raw lines from ``apps.txt`` before parsing."""
    bench = tmp_path / "log-bench"
    (bench / "sites" / "s1").mkdir(parents=True)
    (bench / "sites" / "s1" / "apps.txt").write_text(
        "frappe\nerpnext\n",
        encoding="utf-8",
    )
    caplog.set_level(logging.DEBUG)
    names = discovery._read_lines_from_site_apps_txt(bench, "s1")
    assert names == ["frappe", "erpnext"]
    assert "raw lines before parse" in caplog.text
    assert "frappe" in caplog.text and "erpnext" in caplog.text


def test_get_bench_detail_site_apps_txt_lists_all_named_apps(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Installed app names come from ``sites/<site>/apps.txt`` in order."""
    bench = tmp_path / "cfg-bench"
    _write_valid_bench(bench)
    (bench / "sites" / "mysite" / "apps.txt").write_text(
        "frappe\nerpnext\nphantom\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    detail = discovery.get_bench_detail(bench)
    mysite = next(s for s in detail.sites if s.name == "mysite")
    assert [a.name for a in mysite.installed_apps] == ["frappe", "erpnext", "phantom"]
    phantom = next(a for a in mysite.installed_apps if a.name == "phantom")
    assert phantom.version == "unknown"


def test_get_bench_detail_site_apps_txt_bare_names_only(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Per-site ``apps.txt`` yields AppInfo names that are bare app tokens only."""
    bench = tmp_path / "bare-names-bench"
    _write_valid_bench(bench)
    (bench / "sites" / "mysite" / "apps.txt").write_text("frappe\nerpnext\n", encoding="utf-8")

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    detail = discovery.get_bench_detail(bench)
    mysite = next(s for s in detail.sites if s.name == "mysite")
    by_name = {a.name: a.version for a in mysite.installed_apps}
    assert set(by_name) == {"frappe", "erpnext"}
    for name in by_name:
        assert name == name.strip()
        assert " " not in name
        assert "\t" not in name
    assert by_name["frappe"] == "15.1.0"
    assert by_name["erpnext"] == "15.0.1"


def test_get_bench_detail_frappe_only_when_site_apps_empty_and_list_apps_fails(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When list-apps yields nothing, ``frappe`` is still added if present under ``apps/``."""
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
    (bench / "sites" / "emptysite" / "apps.txt").write_text("", encoding="utf-8")

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))
    monkeypatch.setattr(discovery, "_list_apps_from_bench_cli", lambda _b, _s: [])

    detail = discovery.get_bench_detail(bench)
    site = next(s for s in detail.sites if s.name == "emptysite")
    assert len(site.installed_apps) == 1
    assert site.installed_apps[0].name == "frappe"
    assert site.installed_apps[0].version == "15.1.0"


def test_get_bench_detail_fallback_list_apps_when_site_apps_txt_empty(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When per-site ``apps.txt`` is empty, list-apps supplies installed app names."""
    bench = tmp_path / "fallback-bench"
    (bench / "apps" / "frappe" / "frappe").mkdir(parents=True)
    (bench / "apps" / "erpnext" / "erpnext").mkdir(parents=True)
    (bench / "sites" / "s1").mkdir(parents=True)
    (bench / "env").mkdir(parents=True)
    (bench / "Procfile").write_text("web: bench serve --port 8000\n", encoding="utf-8")
    (bench / "apps" / "frappe" / "frappe" / "__init__.py").write_text(
        '__version__ = "15.1.0"\n',
        encoding="utf-8",
    )
    (bench / "apps" / "erpnext" / "erpnext" / "__init__.py").write_text(
        '__version__ = "15.0.1"\n',
        encoding="utf-8",
    )
    (bench / "sites" / "s1" / "apps.txt").write_text("", encoding="utf-8")

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))
    monkeypatch.setattr(
        discovery,
        "_list_apps_from_bench_cli",
        lambda _b, _s: ["frappe", "erpnext"],
    )

    detail = discovery.get_bench_detail(bench)
    site = next(s for s in detail.sites if s.name == "s1")
    assert [a.name for a in site.installed_apps] == ["frappe", "erpnext"]
    assert {(a.name, a.version) for a in site.installed_apps} == {
        ("frappe", "15.1.0"),
        ("erpnext", "15.0.1"),
    }


def test_get_bench_detail_merges_per_site_and_bench_level_apps_txt(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Per-site ``apps.txt`` is merged with ``sites/apps.txt`` (ordered, deduped)."""
    bench = tmp_path / "merge-bench"
    (bench / "apps" / "frappe" / "frappe").mkdir(parents=True)
    (bench / "apps" / "erpnext" / "erpnext").mkdir(parents=True)
    (bench / "sites" / "s1").mkdir(parents=True)
    (bench / "env").mkdir(parents=True)
    (bench / "Procfile").write_text("web: bench serve --port 8000\n", encoding="utf-8")
    (bench / "apps" / "frappe" / "frappe" / "__init__.py").write_text(
        '__version__ = "15.1.0"\n',
        encoding="utf-8",
    )
    (bench / "apps" / "erpnext" / "erpnext" / "__init__.py").write_text(
        '__version__ = "15.0.1"\n',
        encoding="utf-8",
    )
    (bench / "sites" / "s1" / "apps.txt").write_text("frappe\n", encoding="utf-8")
    (bench / "sites" / "apps.txt").write_text("frappe\nerpnext\n", encoding="utf-8")

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    detail = discovery.get_bench_detail(bench)
    site = next(s for s in detail.sites if s.name == "s1")
    assert [a.name for a in site.installed_apps] == ["frappe", "erpnext"]


def test_list_apps_from_bench_cli_extracts_first_token_per_line(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """``bench list-apps`` lines with metadata yield only the app name token."""
    bench = tmp_path / "cli-bench"
    bench.mkdir()

    def fake_run(
        *_args: object,
        **_kwargs: object,
    ) -> object:
        result = MagicMock()
        result.returncode = 0
        result.stdout = "frappe 15.103.3 version-15\nerpnext 15.103.1 version-15\n"
        result.stderr = ""
        return result

    monkeypatch.setattr(discovery.subprocess, "run", fake_run)
    monkeypatch.setattr(
        discovery.process,
        "resolve_bench_executable",
        lambda: tmp_path / "bench",
    )

    names = discovery._list_apps_from_bench_cli(bench, "demo.site")
    assert names == ["frappe", "erpnext"]


def test_get_bench_detail_installed_apps_unique_names_with_cli_style_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """Merged / CLI paths yield each app name once; versions come from ``apps/*/`` on disk."""
    bench = tmp_path / "uniq-bench"
    (bench / "apps" / "frappe" / "frappe").mkdir(parents=True)
    (bench / "apps" / "erpnext" / "erpnext").mkdir(parents=True)
    (bench / "sites" / "s1").mkdir(parents=True)
    (bench / "env").mkdir(parents=True)
    (bench / "Procfile").write_text("web: bench serve --port 8000\n", encoding="utf-8")
    (bench / "apps" / "frappe" / "frappe" / "__init__.py").write_text(
        '__version__ = "15.103.3"\n',
        encoding="utf-8",
    )
    (bench / "apps" / "erpnext" / "erpnext" / "__init__.py").write_text(
        '__version__ = "15.103.1"\n',
        encoding="utf-8",
    )
    (bench / "sites" / "s1" / "apps.txt").write_text(
        "frappe 15.103.3 version-15\nfrappe\nerpnext 15.103.1 version-15\n",
        encoding="utf-8",
    )
    (bench / "sites" / "apps.txt").write_text(
        "frappe 15.103.3 version-15\nerpnext\n",
        encoding="utf-8",
    )

    monkeypatch.setattr(discovery.process, "get_bench_status", lambda _p: ("stopped", None))

    detail = discovery.get_bench_detail(bench)
    site = next(s for s in detail.sites if s.name == "s1")
    names = [a.name for a in site.installed_apps]
    assert names == ["frappe", "erpnext"]
    assert len(names) == len(set(names))
    by_name = {a.name: a.version for a in site.installed_apps}
    assert by_name["frappe"] == "15.103.3"
    assert by_name["erpnext"] == "15.103.1"


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
