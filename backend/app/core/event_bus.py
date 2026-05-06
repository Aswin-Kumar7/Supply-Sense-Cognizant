"""
Central Event Bus for SupplySense.

Architecture: Pub/Sub pattern using asyncio.Queue.
- Publishers push events (synthetic engine, scenario triggers, services)
- Subscribers receive events (SSE connections)
- Each SSE client gets its own queue to avoid blocking

Why this design:
- Decouples event producers from consumers
- Supports multiple simultaneous SSE connections
- Non-blocking: slow clients don't affect others
- Future-ready: can swap for Redis Pub/Sub when scaling to multiple instances
"""

import asyncio
import json
from datetime import datetime
from uuid import uuid4
from typing import Any
from dataclasses import dataclass, field, asdict

from app.core.logging import logger


@dataclass
class SupplyChainEvent:
    """Typed event structure for all supply chain signals."""
    event_type: str  # risk_update, stockout_warning, disruption_alert, etc.
    severity: str  # low, medium, high, critical
    message: str
    data: dict = field(default_factory=dict)
    id: str = field(default_factory=lambda: str(uuid4()))
    timestamp: str = field(default_factory=lambda: datetime.utcnow().isoformat())

    def to_json(self) -> str:
        return json.dumps(asdict(self))


class EventBus:
    """
    Async event bus with fan-out to multiple subscribers.
    Thread-safe via asyncio primitives.
    """

    def __init__(self):
        self._subscribers: list[asyncio.Queue] = []
        self._event_count: int = 0
        self._lock = asyncio.Lock()

    async def subscribe(self) -> asyncio.Queue:
        """Register a new subscriber. Returns a queue to read events from."""
        queue: asyncio.Queue = asyncio.Queue(maxsize=100)
        async with self._lock:
            self._subscribers.append(queue)
        logger.info(f"SSE client connected. Active subscribers: {len(self._subscribers)}")
        return queue

    async def unsubscribe(self, queue: asyncio.Queue):
        """Remove a subscriber when SSE connection closes."""
        async with self._lock:
            if queue in self._subscribers:
                self._subscribers.remove(queue)
        logger.info(f"SSE client disconnected. Active subscribers: {len(self._subscribers)}")

    async def publish(self, event: SupplyChainEvent):
        """Broadcast event to all subscribers. Non-blocking for slow consumers."""
        self._event_count += 1
        async with self._lock:
            dead_queues = []
            for queue in self._subscribers:
                try:
                    queue.put_nowait(event)
                except asyncio.QueueFull:
                    # Drop events for slow consumers rather than blocking
                    dead_queues.append(queue)
                    logger.warning("Dropping event for slow SSE consumer")

            # Clean up dead queues
            for q in dead_queues:
                self._subscribers.remove(q)

    @property
    def subscriber_count(self) -> int:
        return len(self._subscribers)

    @property
    def total_events_published(self) -> int:
        return self._event_count


# Singleton instance - shared across the application
event_bus = EventBus()
