"""Application settings loaded from environment variables and optional `.env` file."""

import json
from functools import lru_cache
from pathlib import Path

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

_ENV_FILE_PATH = Path(__file__).resolve().parent / ".env"


class Settings(BaseSettings):
    """Runtime configuration for the Bench Manager backend."""

    model_config = SettingsConfigDict(
        env_file=str(_ENV_FILE_PATH),
        env_file_encoding="utf-8",
        extra="ignore",
    )

    root_scan_dir: Path = Field(default_factory=Path.home)
    excluded_paths: list[str] = Field(
        default_factory=lambda: ["*/venv/*", "*/node_modules/*", "*/.cache/*"],
    )
    scan_interval_seconds: int = Field(default=60, ge=1)
    backend_host: str = Field(default="127.0.0.1")
    backend_port: int = Field(default=8000, ge=1, le=65535)

    db_host: str = Field(default="127.0.0.1")
    db_user: str = Field(default="root")
    db_password: str = Field(default="")

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


@lru_cache
def get_settings() -> Settings:
    """Return a cached settings instance (reload server to pick up `.env` changes)."""
    return Settings()


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
    ]
    _ENV_FILE_PATH.write_text("\n".join(lines) + "\n", encoding="utf-8")
    get_settings.cache_clear()
