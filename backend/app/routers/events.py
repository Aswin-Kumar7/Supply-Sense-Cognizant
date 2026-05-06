"""
Server-Sent Events (SSE) endpoint for real-time dashboard updates.

Architecture:
- Each client connection subscribes to the central EventBus
- Events are serialized as JSON and streamed via SSE
- Auto-cleanup on client disconnect
- Supports event type filtering via query params

Why SSE over WebSockets:
- Unidirectional (server→client) is all we need for monitoring
- Auto-reconnect built into browser EventSource API
- Works through HTTP proxies and load balancers
- Simpler to scale: stateless connections, no upgrade handshake
- Future: can add WebSocket for bidirectional agent chat
"""

import asyncio
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.logging import logger
from app.agents.strands_agents import _AGENT_TRACE, STRANDS_AVAILABLE

router = APIRouter(prefix="/events", tags=["Events"])


async def _event_stream(request: Request, event_types: str | None = None):
    """
    Generator that yields events from the bus.
    Cleans up subscription on client disconnect.
    """
    queue = await event_bus.subscribe()
    type_filter = set(event_types.split(",")) if event_types else None

    try:
        while True:
            # Check if client disconnected
            if await request.is_disconnected():
                break

            try:
                # Wait for next event with timeout (enables disconnect check)
                event: SupplyChainEvent = await asyncio.wait_for(
                    queue.get(), timeout=30.0
                )

                # Apply type filter if specified
                if type_filter and event.event_type not in type_filter:
                    continue

                yield event.to_json()

            except asyncio.TimeoutError:
                # Send keepalive comment to prevent connection timeout
                yield ": keepalive\n\n"

    except asyncio.CancelledError:
        pass
    finally:
        await event_bus.unsubscribe(queue)


@router.get("/stream")
async def stream_events(
    request: Request,
    types: str | None = None,
):
    """
    SSE endpoint for real-time supply chain events.
    
    Query params:
    - types: comma-separated event types to filter
             (e.g., ?types=disruption_alert,supplier_risk)
    """
    return EventSourceResponse(_event_stream(request, types))


@router.get("/status")
async def event_status():
    """Get current event streaming status."""
    return {
        "active_subscribers": event_bus.subscriber_count,
        "total_events_published": event_bus.total_events_published,
    }


@router.get("/agent-trace")
async def get_agent_trace(limit: int = 20):
    """
    Return the most recent agent tool call trace entries (circular buffer, max 50).
    Each entry: {tool, input, output} — DEBUG observability only.
    """
    entries = list(_AGENT_TRACE)[-min(limit, 50):]
    return {
        "count": len(entries),
        "strands_available": STRANDS_AVAILABLE,
        "trace": entries,
    }
