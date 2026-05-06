"""
Structured logging configuration for SupplySense.
"""

import logging
import sys
from app.core.config import get_settings


def setup_logging():
    settings = get_settings()
    log_level = getattr(logging, settings.log_level.upper(), logging.INFO)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-8s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    root_logger = logging.getLogger("supplysense")
    root_logger.setLevel(log_level)
    root_logger.addHandler(handler)

    # Suppress noisy libraries but keep access logs visible
    logging.getLogger("sqlalchemy.engine").setLevel(logging.WARNING)
    logging.getLogger("uvicorn.access").setLevel(logging.INFO)

    return root_logger


logger = setup_logging()
