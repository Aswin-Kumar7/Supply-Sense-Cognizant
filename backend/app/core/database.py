"""
Async database engine and session management.
Uses SQLAlchemy 2.0 async patterns with asyncpg driver.
"""

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase

from app.core.config import get_settings

settings = get_settings()

_is_sqlite = settings.database_url.startswith("sqlite")

engine_kwargs = {
    "echo": settings.environment == "development",
}

if _is_sqlite:
    engine_kwargs["connect_args"] = {"check_same_thread": False}
else:
    engine_kwargs.update(
        {
            "pool_size": 20,
            "max_overflow": 10,
            "pool_pre_ping": True,
        }
    )

engine = create_async_engine(settings.database_url, **engine_kwargs)

AsyncSessionLocal = async_sessionmaker(
    engine,
    class_=AsyncSession,
    expire_on_commit=False,
)


class Base(DeclarativeBase):
    """Base class for all SQLAlchemy models."""
    pass


async def get_db() -> AsyncSession:
    """Dependency injection for database sessions."""
    async with AsyncSessionLocal() as session:
        try:
            yield session
            await session.commit()
        except Exception:
            await session.rollback()
            raise
        finally:
            await session.close()


async def init_db():
    """Create all tables and run lightweight column migrations on startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # Add resolution_note column if it was added after initial schema creation.
        # PostgreSQL: ADD COLUMN IF NOT EXISTS is safe to run on every startup.
        if not _is_sqlite:
            await conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE action_cards ADD COLUMN IF NOT EXISTS resolution_note TEXT"
                )
            )
        else:
            # SQLite doesn't support IF NOT EXISTS on ADD COLUMN — check first
            from sqlalchemy import text, inspect
            cols = await conn.run_sync(
                lambda sync_conn: [c["name"] for c in inspect(sync_conn).get_columns("action_cards")]
            )
            if "resolution_note" not in cols:
                await conn.execute(text("ALTER TABLE action_cards ADD COLUMN resolution_note TEXT"))


async def close_db():
    """Dispose engine connections on shutdown."""
    await engine.dispose()
