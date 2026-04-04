"""Filesystem discovery for Frappe bench installations."""

import fnmatch
import json
import logging
import re
from pathlib import Path

from config import get_settings
from models.bench import AppInfo, BenchDetail, BenchSummary, SiteInfo
from services import process

logger = logging.getLogger(__name__)

_VERSION_PATTERN = re.compile(r"__version__\s*=\s*[\"']([^\"']+)[\"']")


def _path_matches_excluded(target: Path, patterns: list[str]) -> bool:
    """Return True if ``target`` matches any glob in ``patterns``."""
    try:
        normalized = target.resolve().as_posix()
    except (OSError, RuntimeError):
        return False
    for pattern in patterns:
        if fnmatch.fnmatch(normalized, pattern):
            return True
    return False


def _is_valid_bench_layout(bench_dir: Path) -> bool:
    """Return True if ``bench_dir`` has the expected bench top-level layout."""
    return (
        (bench_dir / "apps").is_dir()
        and (bench_dir / "sites").is_dir()
        and (bench_dir / "env").is_dir()
        and (bench_dir / "Procfile").is_file()
    )


def _read_version_py(version_file: Path) -> str:
    """Parse ``__version__`` from a Frappe-style ``__version__.py`` file."""
    text = version_file.read_text(encoding="utf-8")
    match = _VERSION_PATTERN.search(text)
    if match:
        return match.group(1)
    return "unknown"


def _read_frappe_version(bench_dir: Path) -> str:
    """Read the Frappe framework version for a bench."""
    version_file = bench_dir / "apps" / "frappe" / "frappe" / "__version__.py"
    try:
        return _read_version_py(version_file)
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not read Frappe version in %s: %s", bench_dir, exc)
        return "unknown"


def _count_apps_from_apps_txt(bench_dir: Path) -> int:
    """Count non-empty, non-comment lines in ``apps.txt``."""
    apps_txt = bench_dir / "apps.txt"
    try:
        text = apps_txt.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not read apps.txt in %s: %s", bench_dir, exc)
        return 0
    count = 0
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        count += 1
    return count


def _list_site_names(bench_dir: Path) -> list[str]:
    """List site directory names under ``sites/``, excluding ``assets``."""
    sites_root = bench_dir / "sites"
    names: list[str] = []
    try:
        for child in sites_root.iterdir():
            try:
                if child.is_dir() and child.name != "assets":
                    names.append(child.name)
            except (FileNotFoundError, PermissionError, OSError) as exc:
                logger.warning("Skipping entry under sites in %s: %s", bench_dir, exc)
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not list sites directory %s: %s", sites_root, exc)
    return sorted(names)


def _read_app_version(bench_dir: Path, app_name: str) -> str:
    """Read version string for an app under ``apps/<name>/``."""
    version_file = bench_dir / "apps" / app_name / app_name / "__version__.py"
    try:
        return _read_version_py(version_file)
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not read version for app %s in %s: %s", app_name, bench_dir, exc)
        return "unknown"


def _parse_procfile(procfile_path: Path) -> dict[str, str]:
    """Parse ``Procfile`` lines into a mapping of process name to command string."""
    try:
        text = procfile_path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not read Procfile %s: %s", procfile_path, exc)
        return {}
    ports: dict[str, str] = {}
    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if ":" not in line:
            continue
        name, _, command = line.partition(":")
        ports[name.strip()] = command.strip()
    return ports


def _site_installed_apps(bench_dir: Path, site_name: str) -> list[AppInfo]:
    """Load ``installed_apps`` from ``site_config.json`` for a site."""
    config_path = bench_dir / "sites" / site_name / "site_config.json"
    try:
        raw = config_path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not read site_config.json for %s: %s", site_name, exc)
        return []
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("Invalid JSON in %s: %s", config_path, exc)
        return []
    installed = data.get("installed_apps")
    if not isinstance(installed, list):
        return []
    apps: list[AppInfo] = []
    for item in installed:
        if not isinstance(item, str):
            continue
        version = _read_app_version(bench_dir, item)
        apps.append(AppInfo(name=item, version=version))
    return apps


def _all_bench_apps(bench_dir: Path) -> list[AppInfo]:
    """Enumerate apps under ``apps/`` and read each app's version."""
    apps_root = bench_dir / "apps"
    result: list[AppInfo] = []
    try:
        for child in sorted(apps_root.iterdir(), key=lambda p: p.name):
            try:
                if not child.is_dir():
                    continue
                if child.name.startswith("."):
                    continue
                version = _read_app_version(bench_dir, child.name)
                result.append(AppInfo(name=child.name, version=version))
            except (FileNotFoundError, PermissionError, OSError) as exc:
                logger.warning("Skipping app directory in %s: %s", bench_dir, exc)
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not list apps directory %s: %s", apps_root, exc)
    return result


def scan_for_benches(root: Path) -> list[BenchSummary]:
    """
    Scan ``root`` one level deep for valid bench directories.

    Valid benches contain ``apps/``, ``sites/``, ``env/``, and ``Procfile``. Paths matching
    ``excluded_paths`` from settings are skipped. Errors on individual directories are logged
    and skipped.
    """
    settings = get_settings()
    excluded = settings.excluded_paths
    summaries: list[BenchSummary] = []

    try:
        candidates = list(root.iterdir())
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not list scan root %s: %s", root, exc)
        return []

    for child in candidates:
        try:
            if _path_matches_excluded(child, excluded):
                continue
            if not child.is_dir():
                continue
            if not _is_valid_bench_layout(child):
                continue

            name = child.name
            path_str = str(child.resolve())
            frappe_version = _read_frappe_version(child)
            site_names = _list_site_names(child)
            site_count = len(site_names)
            app_count = _count_apps_from_apps_txt(child)
            status, _pid = process.get_bench_status(child)

            summaries.append(
                BenchSummary(
                    name=name,
                    path=path_str,
                    frappe_version=frappe_version,
                    status=status,
                    site_count=site_count,
                    app_count=app_count,
                )
            )
        except (FileNotFoundError, PermissionError, OSError) as exc:
            logger.warning("Skipping bench candidate %s: %s", child, exc)
            continue

    return sorted(summaries, key=lambda s: s.name)


def get_bench_detail(bench_path: Path) -> BenchDetail:
    """Read detailed metadata for a single bench directory."""
    resolved = bench_path.resolve()
    name = resolved.name

    frappe_version = _read_frappe_version(resolved)
    site_names = _list_site_names(resolved)
    site_count = len(site_names)
    app_count = _count_apps_from_apps_txt(resolved)
    status, pid = process.get_bench_status(resolved)

    sites = [
        SiteInfo(name=site_name, installed_apps=_site_installed_apps(resolved, site_name))
        for site_name in site_names
    ]
    apps = _all_bench_apps(resolved)
    ports = _parse_procfile(resolved / "Procfile")

    return BenchDetail(
        name=name,
        path=str(resolved),
        frappe_version=frappe_version,
        status=status,
        site_count=site_count,
        app_count=app_count,
        sites=sites,
        apps=apps,
        pid=pid,
        ports=ports,
    )
