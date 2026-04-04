"""SQLite engine and SQLModel session helpers."""

from collections.abc import Generator
from pathlib import Path

from sqlmodel import Session, SQLModel, create_engine

_BACKEND_DIR = Path(__file__).resolve().parent
DATABASE_URL = f"sqlite:///{(_BACKEND_DIR / 'bench_manager.db').as_posix()}"

connect_args = {"check_same_thread": False}
engine = create_engine(DATABASE_URL, connect_args=connect_args)


def create_db_and_tables() -> None:
    """Create database tables if they do not exist."""
    # Import models so SQLModel registers them on metadata.
    from models import template  # noqa: F401

    SQLModel.metadata.create_all(engine)


def get_session() -> Generator[Session, None, None]:
    """FastAPI dependency that yields a short-lived database session."""
    with Session(engine) as session:
        yield session
