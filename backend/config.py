"""Application settings loaded from environment variables and optional `.env` file."""

import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE_PATH = Path(__file__).resolve().parent / ".env"

DEFAULT_APP_REGISTRY: list[dict[str, str]] = [
    {"name": "ERPNext", "repo_url": "https://github.com/frappe/erpnext", "default_branch": "version-15"},
    {"name": "HRMS", "repo_url": "https://github.com/frappe/hrms", "default_branch": "version-15"},
    {"name": "Payments", "repo_url": "https://github.com/frappe/payments", "default_branch": "version-15"},
    {"name": "LMS", "repo_url": "https://github.com/frappe/lms", "default_branch": "develop"},
    {"name": "Helpdesk", "repo_url": "https://github.com/frappe/helpdesk", "default_branch": "main"},
    {"name": "CRM", "repo_url": "https://github.com/frappe/crm", "default_branch": "main"},
    {"name": "Insights", "repo_url": "https://github.com/frappe/insights", "default_branch": "develop"},
    {"name": "Print Designer", "repo_url": "https://github.com/frappe/print_designer", "default_branch": "main"},
    {"name": "Builder", "repo_url": "https://github.com/frappe/builder", "default_branch": "main"},
    {"name": "WhatsApp", "repo_url": "https://github.com/frappe/frappe_whatsapp", "default_branch": "main"},
]


class Settings(BaseSettings):
    """Runtime configuration for the Bench Manager backend."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    root_scan_dir: Path = Field(default_factory=Path.home)
    excluded_paths: list[str] = Field(
        default_factory=lambda: [
            "*/venv/*",
            "*/node_modules/*",
            "*/.cache/*",
            "*/bench-manager/*",
        ],
    )
    scan_interval_seconds: int = Field(default=60, ge=10, le=3600)
    backend_host: str = Field(default="127.0.0.1")
    backend_port: int = Field(default=8000, ge=1, le=65535)

    db_host: str = Field(default="127.0.0.1")
    db_user: str = Field(default="root")
    db_password: str = Field(default="")

    app_registry: list[dict[str, str]] = Field(
        default_factory=lambda: list(DEFAULT_APP_REGISTRY),
    )

    @field_validator("root_scan_dir", mode="before")
    @classmethod
    def parse_root_scan_dir(cls, value: str | Path) -> Path:
        """Coerce string env values to an expanded absolute path."""
        path = Path(value).expanduser()
        return path.resolve()

    @field_validator("excluded_paths", mode="before")
    @classmethod
    def parse_excluded_paths(cls, value: object) -> list[str]:
        """Allow list or JSON string (from ``.env``) for excluded path globs."""
        if isinstance(value, list):
            return [str(item) for item in value]
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return [str(item) for item in json.loads(stripped)]
            return [part.strip() for part in stripped.split(",") if part.strip()]
        raise TypeError("excluded_paths must be a list or string")

    @field_validator("app_registry", mode="before")
    @classmethod
    def parse_app_registry(cls, value: object) -> list[dict[str, str]]:
        """Allow list or JSON string (from ``.env``) for app registry entries."""
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            stripped = value.strip()
            if stripped.startswith("["):
                return json.loads(stripped)
            return list(DEFAULT_APP_REGISTRY)
        return list(DEFAULT_APP_REGISTRY)


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance (reload server to pick up `.env` changes)."""
    settings = Settings()
    if not settings.app_registry:
        settings.app_registry = list(DEFAULT_APP_REGISTRY)
    return settings


def persist_settings(settings: Settings) -> None:
    """Write ``settings`` to ``backend/.env`` and clear the cached :func:`get_settings`."""
    payload = settings.model_dump(mode="json")
    root_dir = Path(str(payload["root_scan_dir"]))
    lines = [
        f"ROOT_SCAN_DIR={root_dir}",
        f"EXCLUDED_PATHS={json.dumps(payload['excluded_paths'])}",
        f"SCAN_INTERVAL_SECONDS={payload['scan_interval_seconds']}",
        f"BACKEND_HOST={payload['backend_host']}",
        f"BACKEND_PORT={payload['backend_port']}",
        f"DB_HOST={payload['db_host']}",
        f"DB_USER={payload['db_user']}",
        f"DB_PASSWORD={payload['db_password']}",
        f"APP_REGISTRY={json.dumps(payload['app_registry'])}",
    ]
    _ENV_FILE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    get_settings.cache_clear()
