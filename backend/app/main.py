"""
SupplySense FastAPI Application Entry Point.
Enterprise-grade supply chain resilience platform.

Module 2: Real-time operational visibility and live monitoring.
"""

from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import get_settings
from app.core.database import init_db, close_db
from app.core.exceptions import SupplySenseException, supplysense_exception_handler
from app.core.logging import logger
from app.services.synthetic_engine import synthetic_engine
from app.routers import suppliers, skus, disruptions, dashboard, action_cards, events, health, scenarios, risk, procurement, chat
from app.routers.fallback import router as fallback_router

settings = get_settings()


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifecycle: startup and shutdown."""
    logger.info(f"Starting {settings.app_name} v{settings.app_version}")
    logger.info(f"Environment: {settings.environment}")
    try:
        await init_db()
        logger.info("Database tables initialized")
    except Exception as exc:
        logger.warning(f"Database init failed (will retry on first request): {exc}")

    # Start synthetic event engine
    await synthetic_engine.start()
    logger.info("Synthetic disruption engine started")

    yield

    # Graceful shutdown
    await synthetic_engine.stop()
    await close_db()
    logger.info("Application shutdown complete")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    description="AI-powered retail supply chain resilience platform",
    lifespan=lifespan,
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Exception handlers
app.add_exception_handler(SupplySenseException, supplysense_exception_handler)

# Register routers under /api/v1 prefix
API_PREFIX = "/api/v1"
app.include_router(suppliers.router, prefix=API_PREFIX)
app.include_router(skus.router, prefix=API_PREFIX)
app.include_router(disruptions.router, prefix=API_PREFIX)
app.include_router(dashboard.router, prefix=API_PREFIX)
app.include_router(action_cards.router, prefix=API_PREFIX)
app.include_router(events.router, prefix=API_PREFIX)
app.include_router(health.router, prefix=API_PREFIX)
app.include_router(scenarios.router, prefix=API_PREFIX)
app.include_router(risk.router, prefix=API_PREFIX)
app.include_router(procurement.router, prefix=API_PREFIX)
app.include_router(chat.router, prefix=API_PREFIX)
app.include_router(fallback_router, prefix=API_PREFIX)
