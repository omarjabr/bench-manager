"""Filesystem discovery for Frappe bench installations."""

import asyncio
import fnmatch
import json
import logging
import re
from pathlib import Path

from config import get_settings
from models.bench import AppInfo, BenchDetail, BenchSummary, SiteInfo
from services import process

logger = logging.getLogger(__name__)

# Match __version__ = "x.y" or __version__ = 'x.y' (single or double quotes).
_VERSION_PATTERN = re.compile(
    r"""__version__\s*=\s*(["'])(?P<ver>[^"']+)\1""",
    re.MULTILINE,
)


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


def _safe_resolve(path: Path) -> Path:
    """Return ``path.resolve()`` or ``path`` if resolution fails."""
    try:
        return path.resolve()
    except (OSError, RuntimeError):
        return path


def _read_version_py(version_file: Path) -> str:
    """Parse a top-level ``__version__ = "…"`` assignment from a Python module file (e.g. ``__init__.py``)."""
    resolved = _safe_resolve(version_file)
    try:
        text = resolved.read_text(encoding="utf-8")
    except UnicodeDecodeError as exc:
        logger.warning("Could not decode version file as UTF-8: %s (%s)", resolved, exc)
        return "unknown"
    text = text.lstrip("\ufeff")
    match = _VERSION_PATTERN.search(text)
    if match:
        return match.group("ver")
    logger.debug("No __version__ assignment matched in %s", resolved)
    return "unknown"


def _read_frappe_version(bench_dir: Path) -> str:
    """Read the Frappe framework version for a bench from ``apps/frappe/frappe/__init__.py``."""
    try:
        resolved_bench = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved_bench = bench_dir
    version_file = resolved_bench / "apps" / "frappe" / "frappe" / "__init__.py"
    resolved_version_path = _safe_resolve(version_file)
    try:
        return _read_version_py(version_file)
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning("Could not read Frappe version in %s: %s", resolved_bench, exc)
        logger.debug(
            "Frappe __init__.py path attempted (resolved): %s",
            resolved_version_path,
        )
        return "unknown"


def _count_non_empty_app_lines(text: str) -> int:
    """Count non-empty, non-comment lines in an ``apps.txt``-style file."""
    count = 0
    for line in text.splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        count += 1
    return count


def _count_apps_from_apps_json(path: Path) -> int | None:
    """Return app count from ``sites/apps.json`` if present and valid JSON, else ``None``."""
    try:
        raw = path.read_text(encoding="utf-8")
    except (FileNotFoundError, PermissionError, OSError):
        return None
    try:
        data = json.loads(raw)
    except json.JSONDecodeError as exc:
        logger.warning("Invalid JSON in %s: %s", path, exc)
        return None
    if isinstance(data, list):
        return sum(1 for item in data if isinstance(item, str) and item.strip())
    if isinstance(data, dict):
        return len(data)
    return None


def _count_bench_app_entries(bench_dir: Path) -> int:
    """
    Count apps installed on the bench.

    Tries, in order: ``sites/apps.txt`` (current bench layout), legacy ``apps.txt`` at the bench
    root, then ``sites/apps.json``. Missing files are skipped without a warning; only permission
    errors and invalid JSON produce warnings.
    """
    try:
        resolved = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved = bench_dir
    sites_dir = resolved / "sites"

    for path in (sites_dir / "apps.txt", resolved / "apps.txt"):
        try:
            text = path.read_text(encoding="utf-8")
            return _count_non_empty_app_lines(text)
        except FileNotFoundError:
            logger.debug("Bench app list not found: %s", _safe_resolve(path))
            continue
        except (PermissionError, OSError) as exc:
            logger.warning("Could not read bench app list %s: %s", path, exc)
            return 0

    json_count = _count_apps_from_apps_json(sites_dir / "apps.json")
    if json_count is not None:
        return json_count

    logger.debug(
        "No sites/apps.txt, apps.txt, or sites/apps.json for app count under %s",
        resolved,
    )
    return 0


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
    """Read ``__version__`` from ``apps/<name>/<name>/__init__.py``."""
    try:
        resolved_bench = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved_bench = bench_dir
    version_file = resolved_bench / "apps" / app_name / app_name / "__init__.py"
    resolved_version_path = _safe_resolve(version_file)
    try:
        return _read_version_py(version_file)
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning(
            "Could not read version for app %s in %s: %s",
            app_name,
            resolved_bench,
            exc,
        )
        logger.debug(
            "App __init__.py path attempted (resolved): %s",
            resolved_version_path,
        )
        return "unknown"


def _parse_bench_list_apps_stdout(stdout: str) -> list[str]:
    """Turn ``bench list-apps`` stdout into a list of app names (one non-empty line per app)."""
    names: list[str] = []
    for line in stdout.splitlines():
        name = line.strip()
        if name:
            names.append(name)
    return names


async def _bench_list_app_names_async(bench_dir: Path, site_name: str) -> list[str]:
    """Run ``bench --site <site> list-apps`` in ``bench_dir`` and return app names from stdout."""
    try:
        resolved_bench = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved_bench = bench_dir
    try:
        proc = await asyncio.create_subprocess_exec(
            "bench",
            "--site",
            site_name,
            "list-apps",
            cwd=str(resolved_bench),
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except (FileNotFoundError, PermissionError, OSError) as exc:
        logger.warning(
            "Could not start bench list-apps for site %s in %s: %s",
            site_name,
            resolved_bench,
            exc,
        )
        return []
    try:
        stdout_b, stderr_b = await asyncio.wait_for(proc.communicate(), timeout=120.0)
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        logger.warning(
            "bench list-apps timed out for site %s in %s",
            site_name,
            resolved_bench,
        )
        return []
    if proc.returncode != 0:
        err = stderr_b.decode("utf-8", errors="replace").strip()
        logger.warning(
            "bench list-apps failed for site %s (exit %s): %s",
            site_name,
            proc.returncode,
            err,
        )
        return []
    text = stdout_b.decode("utf-8", errors="replace")
    return _parse_bench_list_apps_stdout(text)


def _list_installed_app_names_via_bench(bench_dir: Path, site_name: str) -> list[str]:
    """Synchronous wrapper for :func:`_bench_list_app_names_async` (uses ``asyncio.run``)."""
    try:
        return asyncio.run(_bench_list_app_names_async(bench_dir, site_name))
    except RuntimeError as exc:
        if "asyncio.run() cannot be called from a running event loop" in str(exc):
            logger.warning(
                "bench list-apps skipped for site %s (nested event loop): %s",
                site_name,
                exc,
            )
            return []
        raise


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
    """Resolve installed apps for a site via ``bench --site <site> list-apps`` and read each version."""
    try:
        resolved_bench = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved_bench = bench_dir
    app_names = _list_installed_app_names_via_bench(resolved_bench, site_name)
    apps: list[AppInfo] = []
    for name in app_names:
        version = _read_app_version(resolved_bench, name)
        apps.append(AppInfo(name=name, version=version))
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
            app_count = _count_bench_app_entries(child)
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
    app_count = _count_bench_app_entries(resolved)
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
