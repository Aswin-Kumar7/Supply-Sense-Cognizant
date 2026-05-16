"""
Clears all SupplySense tables in foreign-key-safe order without dropping them.

Run this before re-seeding to wipe existing data:
    python -m seeders.clear_data

Tables are truncated child-first so FK constraints never block deletion.
"""

import asyncio
import os
from pathlib import Path

# Load .env
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://supplysense:supplysense_dev_2024@localhost:5432/supplysense",
)

# Deletion order: children before parents to satisfy FK constraints
_DELETE_ORDER = [
    "action_cards",          # references suppliers, skus
    "risk_snapshots",        # references suppliers
    "delivery_records",      # references suppliers, skus
    "alternate_suppliers",   # references skus, suppliers
    "supplier_dependencies", # references suppliers twice
    "disruptions",           # references suppliers
    "skus",                  # references suppliers
    "festival_calendar",     # no FK
    "suppliers",             # parent — last
]


async def clear_all():
    from sqlalchemy.ext.asyncio import create_async_engine
    from sqlalchemy import text

    engine = create_async_engine(DATABASE_URL, echo=False)
    async with engine.begin() as conn:
        for table in _DELETE_ORDER:
            result = await conn.execute(text(f"DELETE FROM {table}"))
            print(f"  cleared {table:<25} ({result.rowcount} rows removed)")

    await engine.dispose()
    print("\n✓ All tables cleared. Ready for re-seeding.")


if __name__ == "__main__":
    asyncio.run(clear_all())
