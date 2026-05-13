"""SQLite engine and SQLModel session helpers."""

import logging
from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine, text

_BACKEND_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{(_BACKEND_DIR / 'bench_manager.db').as_posix()}"

connect_args = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, connect_args=connect_args)

logger = logging.getLogger(__name__)


def _run_migrations() -> None:
    """Apply lightweight schema migrations for new columns on existing tables."""
    migrations: list[tuple[str, str, str]] = [
        ("server", "agent_deployed", "ALTER TABLE server ADD COLUMN agent_deployed BOOLEAN DEFAULT 0 NOT NULL"),
    ]
    with Session(engine) as session:
        for table, column, ddl in migrations:
            result = session.exec(
                text(f"SELECT COUNT(*) FROM pragma_table_info('{table}') WHERE name='{column}'")
            )
            exists = result.one()[0] > 0
            if not exists:
                session.exec(text(ddl))
                session.commit()
                logger.info("Migration: added column %s.%s", table, column)


def create_db_and_tables() -> None:
    """Create database tables if they do not exist."""
    from models import server, template  # noqa: F401

    SQLModel.metadata.create_all(engine)
    _run_migrations()


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a short-lived database session."""
    with Session(engine) as session:
        yield session
