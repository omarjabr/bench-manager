"""Local system readiness probes for bench prerequisites."""

from __future__ import annotations

import asyncio
from pathlib import Path

from models.system_check import SystemCheckItem, SystemCheckReport

_COMMAND_TIMEOUT_SECONDS = 5
_APT_PACKAGES = (
    "git",
    "python3-dev",
    "python3-setuptools",
    "python3-pip",
    "software-properties-common",
    "curl",
    "xvfb",
    "libfontconfig",
    "wkhtmltopdf",
    "redis-server",
    "mariadb-server",
)

_MARIADB_REQUIRED_LINES = (
    "[mysqld]",
    "character-set-client-handshake = FALSE",
    "character-set-server = utf8mb4",
    "collation-server = utf8mb4_unicode_ci",
    "[mysql]",
    "default-character-set = utf8mb4",
)


class CommandResult:
    """Process execution result returned by async shell probes."""

    def __init__(self, returncode: int | None, stdout: str, stderr: str) -> None:
        self.returncode = returncode
        self.stdout = stdout.strip()
        self.stderr = stderr.strip()

    @property
    def ok(self) -> bool:
        return self.returncode == 0


async def _run_command(command: list[str]) -> CommandResult:
    """Run a command with timeout and capture output without blocking the loop."""
    try:
        proc = await asyncio.create_subprocess_exec(
            *command,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
        )
    except OSError as exc:
        return CommandResult(None, "", str(exc))

    try:
        stdout, stderr = await asyncio.wait_for(
            proc.communicate(), timeout=_COMMAND_TIMEOUT_SECONDS
        )
    except asyncio.TimeoutError:
        proc.kill()
        await proc.wait()
        return CommandResult(None, "", f"timed out after {_COMMAND_TIMEOUT_SECONDS}s")

    return CommandResult(
        int(proc.returncode),
        stdout.decode("utf-8", errors="replace"),
        stderr.decode("utf-8", errors="replace"),
    )


def _status_for_result(result: CommandResult) -> str:
    if result.returncode is None:
        return "unknown"
    return "pass" if result.ok else "fail"


async def _is_apt_package_installed(package_name: str) -> bool:
    result = await _run_command(
        ["dpkg-query", "-W", "-f=${Status}", package_name]
    )
    return result.ok and "install ok installed" in result.stdout


async def _probe_apt_packages() -> SystemCheckItem:
    checks = await asyncio.gather(
        *[_is_apt_package_installed(pkg) for pkg in _APT_PACKAGES]
    )
    missing = [pkg for pkg, installed in zip(_APT_PACKAGES, checks) if not installed]
    if not missing:
        return SystemCheckItem(
            id="apt_packages",
            label="Required apt packages",
            status="pass",
            details="All required packages are installed.",
            fix_kind="auto",
        )
    return SystemCheckItem(
        id="apt_packages",
        label="Required apt packages",
        status="fail",
        details=f"Missing packages: {', '.join(missing)}",
        fix_kind="auto",
    )


async def _probe_python_venv() -> SystemCheckItem:
    version_result = await _run_command(
        [
            "python3",
            "-c",
            "import sys;print(f'{sys.version_info.major}.{sys.version_info.minor}')",
        ]
    )
    if not version_result.ok or not version_result.stdout:
        return SystemCheckItem(
            id="python_venv",
            label="Python venv package",
            status="unknown",
            details="Could not detect active Python 3 minor version.",
            fix_kind="auto",
        )
    minor = version_result.stdout
    package_name = f"python{minor}-venv"
    installed = await _is_apt_package_installed(package_name)
    return SystemCheckItem(
        id="python_venv",
        label="Python venv package",
        status="pass" if installed else "fail",
        details=(
            f"{package_name} is installed."
            if installed
            else f"{package_name} is missing."
        ),
        fix_kind="auto",
    )


async def _probe_npm_apt() -> SystemCheckItem:
    installed = await _is_apt_package_installed("npm")
    return SystemCheckItem(
        id="npm_apt",
        label="npm (apt package)",
        status="pass" if installed else "fail",
        details="npm is installed." if installed else "npm apt package is missing.",
        fix_kind="auto",
    )


async def _probe_binary(binary_name: str) -> CommandResult:
    return await _run_command(["which", binary_name])


async def _probe_yarn() -> SystemCheckItem:
    result = await _probe_binary("yarn")
    return SystemCheckItem(
        id="yarn_global",
        label="Yarn global install",
        status=_status_for_result(result),
        details="yarn is available in PATH." if result.ok else "yarn is not in PATH.",
        fix_kind="auto",
    )


async def _probe_frappe_bench() -> SystemCheckItem:
    which_result = await _probe_binary("bench")
    show_result = await _run_command(["pip3", "show", "frappe-bench"])
    ok = which_result.ok and show_result.ok
    return SystemCheckItem(
        id="frappe_bench",
        label="frappe-bench CLI",
        status="pass" if ok else "fail",
        details=(
            "bench command and frappe-bench package are available."
            if ok
            else "bench command or frappe-bench package is missing."
        ),
        fix_kind="auto",
    )


async def _probe_ansible() -> SystemCheckItem:
    result = await _probe_binary("ansible")
    return SystemCheckItem(
        id="ansible",
        label="Ansible CLI",
        status=_status_for_result(result),
        details=(
            "ansible is available in PATH."
            if result.ok
            else "ansible is not available in PATH."
        ),
        fix_kind="auto",
    )


async def _probe_mariadb_running() -> SystemCheckItem:
    systemctl_result = await _run_command(["systemctl", "is-active", "mariadb"])
    running = systemctl_result.ok and systemctl_result.stdout == "active"
    if not running:
        pgrep_result = await _run_command(["pgrep", "-x", "mariadbd"])
        running = pgrep_result.ok
    return SystemCheckItem(
        id="mariadb_running",
        label="MariaDB service running",
        status="pass" if running else "fail",
        details=(
            "MariaDB service is active."
            if running
            else "MariaDB service is not running."
        ),
        fix_kind="auto",
    )


def _parse_mariadb_charset_config(text: str) -> bool:
    normalized_lines = [line.strip() for line in text.splitlines() if line.strip()]
    normalized_text = "\n".join(normalized_lines)
    return all(line in normalized_text for line in _MARIADB_REQUIRED_LINES)


async def _probe_mariadb_charset() -> SystemCheckItem:
    config_path = Path("/etc/mysql/my.cnf")
    try:
        content = await asyncio.to_thread(config_path.read_text, encoding="utf-8")
    except FileNotFoundError:
        return SystemCheckItem(
            id="mariadb_charset",
            label="MariaDB utf8mb4 config",
            status="fail",
            details="/etc/mysql/my.cnf not found.",
            fix_kind="auto",
        )
    except PermissionError:
        return SystemCheckItem(
            id="mariadb_charset",
            label="MariaDB utf8mb4 config",
            status="unknown",
            details="Permission denied while reading /etc/mysql/my.cnf.",
            fix_kind="auto",
        )
    except OSError as exc:
        return SystemCheckItem(
            id="mariadb_charset",
            label="MariaDB utf8mb4 config",
            status="unknown",
            details=f"Could not read /etc/mysql/my.cnf: {exc}",
            fix_kind="auto",
        )

    config_ok = _parse_mariadb_charset_config(content)
    return SystemCheckItem(
        id="mariadb_charset",
        label="MariaDB utf8mb4 config",
        status="pass" if config_ok else "fail",
        details=(
            "Required utf8mb4 settings are present in my.cnf."
            if config_ok
            else "my.cnf is missing one or more required utf8mb4 settings."
        ),
        fix_kind="auto",
    )


async def _probe_redis_running() -> SystemCheckItem:
    result = await _run_command(["redis-cli", "-t", "2", "ping"])
    pong = result.ok and "PONG" in result.stdout
    return SystemCheckItem(
        id="redis_running",
        label="Redis service running",
        status="pass" if pong else "fail",
        details="Redis responds with PONG." if pong else "Redis ping did not return PONG.",
        fix_kind="auto",
    )


async def _probe_nvm_installed() -> SystemCheckItem:
    nvm_path = Path.home() / ".nvm" / "nvm.sh"
    exists = await asyncio.to_thread(nvm_path.is_file)
    return SystemCheckItem(
        id="nvm_installed",
        label="NVM installed",
        status="pass" if exists else "fail",
        details=(
            "NVM script exists at ~/.nvm/nvm.sh."
            if exists
            else "NVM script was not found at ~/.nvm/nvm.sh."
        ),
        fix_kind="manual",
        manual_commands=[
            "curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash",
            "source ~/.nvm/nvm.sh",
        ],
    )


async def _probe_node_18() -> SystemCheckItem:
    result = await _run_command(
        ["bash", "-lc", "source ~/.nvm/nvm.sh 2>/dev/null; node --version"]
    )
    if not result.ok:
        return SystemCheckItem(
            id="node_18",
            label="Node.js >= 18",
            status="fail",
            details="Could not execute node --version in an nvm-enabled shell.",
            fix_kind="manual",
            manual_commands=[
                "source ~/.nvm/nvm.sh",
                "nvm install 18",
                "nvm alias default 18",
            ],
        )
    version = result.stdout.lstrip("v")
    major_token = version.split(".", maxsplit=1)[0]
    try:
        major = int(major_token)
    except ValueError:
        major = 0
    ok = major >= 18
    return SystemCheckItem(
        id="node_18",
        label="Node.js >= 18",
        status="pass" if ok else "fail",
        details=(
            f"Detected node {result.stdout}."
            if ok
            else f"Detected node {result.stdout}; version 18+ is required."
        ),
        fix_kind="manual",
        manual_commands=[
            "source ~/.nvm/nvm.sh",
            "nvm install 18",
            "nvm alias default 18",
            "node --version",
        ],
    )


def _manual_mysql_secure_item() -> SystemCheckItem:
    return SystemCheckItem(
        id="mysql_secured",
        label="mysql_secure_installation",
        status="warn",
        details="Manual hardening step required and tracked only in the UI.",
        fix_kind="manual",
        manual_commands=[
            "sudo mysql_secure_installation",
            "Answer prompts for root auth, anonymous users, test DB, and remote root login.",
        ],
    )


async def collect_system_check_report() -> SystemCheckReport:
    """Run all prerequisite probes and return an aggregate readiness report."""
    items = [
        await _probe_apt_packages(),
        await _probe_python_venv(),
        await _probe_npm_apt(),
        await _probe_yarn(),
        await _probe_frappe_bench(),
        await _probe_ansible(),
        await _probe_mariadb_running(),
        await _probe_mariadb_charset(),
        await _probe_redis_running(),
        await _probe_nvm_installed(),
        await _probe_node_18(),
        _manual_mysql_secure_item(),
    ]
    auto_items = [item for item in items if item.fix_kind == "auto"]
    ready = all(item.status == "pass" for item in auto_items)
    return SystemCheckReport(items=items, ready=ready)

