"""Pytest configuration for backend tests.

Ensures the correct .env file is loaded and clears the settings cache
so tests don't fail due to extra environment variables from the root .env.
"""

import os
import sys
from functools import lru_cache

# Ensure backend/ is on the path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# Override env file path to use backend/.env specifically
os.environ.setdefault("DATABASE_URL", "postgresql+asyncpg://localhost:5432/test")
os.environ.setdefault("AWS_REGION", "us-east-1")

# Clear the lru_cache on get_settings so it re-reads with our env
from app.core.config import get_settings
get_settings.cache_clear()
