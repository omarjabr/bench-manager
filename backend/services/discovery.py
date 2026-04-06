"""Filesystem discovery for Frappe bench installations."""

import fnmatch
import json
import logging
import re
import subprocess
from collections import OrderedDict
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


def _first_app_name_token(line: str) -> str | None:
    """
    Return the first whitespace-delimited token from a line, or ``None`` if the line is empty,
    a comment, or has no tokens.

    Some ``apps.txt`` and ``bench list-apps`` lines include version or branch metadata after
    the app name; only the first token is the app name.
    """
    stripped = line.strip()
    if not stripped or stripped.startswith("#"):
        return None
    parts = stripped.split()
    if not parts:
        return None
    return parts[0]


def _parse_site_apps_txt(text: str) -> list[str]:
    """
    Parse ``sites/<site>/apps.txt``-style lines: one app name per line (first token only;
    comments and blanks ignored).
    """
    names: list[str] = []
    for line in text.splitlines():
        token = _first_app_name_token(line)
        if token is None:
            continue
        names.append(token)
    return names


def _read_lines_from_site_apps_txt(bench_dir: Path, site_name: str) -> list[str]:
    """Read app names from ``sites/<site_name>/apps.txt`` (missing file → ``[]``)."""
    path = bench_dir / "sites" / site_name / "apps.txt"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.debug("No apps.txt for site %s at %s", site_name, _safe_resolve(path))
        return []
    except (PermissionError, OSError) as exc:
        logger.warning("Could not read site apps.txt %s: %s", path, exc)
        return []
    raw_lines = text.splitlines()
    logger.debug(
        "Site %s apps.txt raw lines before parse: %r",
        site_name,
        raw_lines,
    )
    return _parse_site_apps_txt(text)


def _read_lines_from_bench_sites_apps_txt(bench_dir: Path) -> list[str]:
    """Read app names from bench-level ``sites/apps.txt`` (available apps on the bench)."""
    path = bench_dir / "sites" / "apps.txt"
    try:
        text = path.read_text(encoding="utf-8")
    except FileNotFoundError:
        logger.debug("Bench-level sites/apps.txt not found at %s", _safe_resolve(path))
        return []
    except (PermissionError, OSError) as exc:
        logger.warning("Could not read sites/apps.txt %s: %s", path, exc)
        return []
    return _parse_site_apps_txt(text)


def _merge_ordered_unique_app_names(first: list[str], second: list[str]) -> list[str]:
    """Preserve order: all of ``first``, then names from ``second`` not already seen."""
    seen: set[str] = set()
    out: list[str] = []
    for name in first + second:
        if name in seen:
            continue
        seen.add(name)
        out.append(name)
    return out


def _dedupe_app_names_ordered(names: list[str]) -> list[str]:
    """Return ``names`` with duplicates removed; first occurrence of each app name wins."""
    ordered = OrderedDict.fromkeys(names)
    return list(ordered.keys())


def _list_apps_from_bench_cli(bench_dir: Path, site_name: str) -> list[str]:
    """
    Run ``bench --site <site> list-apps`` and parse stdout (one app name per line).

    Used when per-site ``apps.txt`` is missing or empty. Returns ``[]`` on failure.
    """
    try:
        bench_exe = process.resolve_bench_executable()
    except RuntimeError as exc:
        logger.warning("Could not resolve bench for list-apps: %s", exc)
        return []
    try:
        resolved = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved = bench_dir
    try:
        result = subprocess.run(
            [str(bench_exe), "--site", site_name, "list-apps"],
            cwd=str(resolved),
            capture_output=True,
            text=True,
            timeout=120,
            check=False,
        )
    except (OSError, subprocess.SubprocessError) as exc:
        logger.warning("list-apps subprocess failed for site %s: %s", site_name, exc)
        return []
    if result.returncode != 0:
        logger.warning(
            "list-apps exited %s for site %s: %s",
            result.returncode,
            site_name,
            (result.stderr or "")[:500],
        )
        return []
    names: list[str] = []
    for line in (result.stdout or "").splitlines():
        token = _first_app_name_token(line)
        if token is None:
            continue
        names.append(token)
    return _dedupe_app_names_ordered(names)


def _ensure_frappe_app_name(bench_dir: Path, names: list[str]) -> list[str]:
    """Prepend ``frappe`` if the bench has the Frappe app but the name list omits it."""
    if "frappe" in names:
        return names
    try:
        resolved = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved = bench_dir
    if (resolved / "apps" / "frappe").is_dir():
        return ["frappe", *names]
    return names


def _installed_app_name_list(bench_dir: Path, site_name: str) -> list[str]:
    """
    Resolve installed app names for a site: per-site ``apps.txt``, merged with
    ``sites/apps.txt``; if per-site file is missing or yields no names, use
    ``bench list-apps`` output.

    Names are always single tokens (no inline version text). After merging all sources,
    duplicates are removed so each app name appears once.
    """
    per_site = _read_lines_from_site_apps_txt(bench_dir, site_name)
    bench_level = _read_lines_from_bench_sites_apps_txt(bench_dir)
    if len(per_site) == 0:
        names = _list_apps_from_bench_cli(bench_dir, site_name)
    else:
        names = _merge_ordered_unique_app_names(per_site, bench_level)
    names = _ensure_frappe_app_name(bench_dir, names)
    return _dedupe_app_names_ordered(names)


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
    """
    Resolve installed apps from per-site ``apps.txt`` merged with ``sites/apps.txt``,
    or from ``bench list-apps`` when per-site data is absent.

    Each ``AppInfo.version`` comes from ``apps/<name>/<name>/__init__.py`` via
    :func:`_read_app_version`.
    """
    try:
        resolved_bench = bench_dir.resolve()
    except (OSError, RuntimeError):
        resolved_bench = bench_dir
    app_names = _installed_app_name_list(resolved_bench, site_name)
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
