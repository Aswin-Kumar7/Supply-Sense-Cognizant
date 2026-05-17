"""
Async database engine and session management.
Uses SQLAlchemy 2.0 async patterns with asyncpg driver.
Supports local Postgres and AWS Aurora (SSL via global-bundle.pem).
"""

import os
import ssl
from pathlib import Path

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

    # ── Aurora / RDS SSL configuration ────────────────────────────────────────
    # asyncpg requires ssl.SSLContext — sslmode= in the URL is NOT supported.
    # Only apply SSL when NOT connecting to localhost (avoids 'rejected SSL upgrade').
    _is_remote = "localhost" not in settings.database_url and "127.0.0.1" not in settings.database_url
    _ssl_mode = settings.db_ssl_mode.lower()

    if _is_remote and _ssl_mode in ("require", "verify-ca", "verify-full"):
        cert_file = Path(settings.db_ssl_cert_path) if settings.db_ssl_cert_path else None
        if cert_file and cert_file.exists():
            ssl_ctx = ssl.create_default_context(cafile=str(cert_file))
            ssl_ctx.check_hostname = False  # Aurora uses wildcard SANs
            ssl_ctx.verify_mode = ssl.CERT_REQUIRED
        else:
            # Cert file not found — still encrypt, skip verification
            ssl_ctx = ssl.create_default_context()
            ssl_ctx.check_hostname = False
            ssl_ctx.verify_mode = ssl.CERT_NONE
        engine_kwargs["connect_args"] = {"ssl": ssl_ctx}

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
    """Create all tables. Used for development/demo startup."""
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)


async def close_db():
    """Dispose engine connections on shutdown."""
    await engine.dispose()
