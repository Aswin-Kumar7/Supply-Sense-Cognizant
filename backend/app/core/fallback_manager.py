"""
Manages per-request fallback approval for when Strands agents are unavailable.
Publishes SSE events requesting user confirmation before falling back to Bedrock/rule-based.
"""

import asyncio
from uuid import uuid4
from datetime import datetime, timezone

from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.logging import logger

# Pending fallback requests: request_id -> asyncio.Event
_pending_approvals: dict[str, asyncio.Event] = {}
_approval_results: dict[str, bool] = {}  # True = approved, False = denied


async def request_fallback_approval(
    agent_name: str,
    operation: str,
    reason: str,
    timeout: float = 60.0,
) -> bool:
    """
    Request user approval to fall back to Bedrock/rule-based when Strands fails.
    Publishes an SSE event and waits for user response via the approval endpoint.
    Returns True if approved, False if denied or timed out.
    """
    request_id = str(uuid4())
    event = asyncio.Event()
    _pending_approvals[request_id] = event

    # Publish SSE event to dashboard
    await event_bus.publish(SupplyChainEvent(
        event_type="strands_fallback_request",
        severity="high",
        message=f"Strands agent '{agent_name}' unavailable. Approve fallback to alternative source?",
        data={
            "request_id": request_id,
            "agent_name": agent_name,
            "operation": operation,
            "reason": reason,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        },
    ))

    logger.warning(f"Strands fallback requested: agent={agent_name}, op={operation}, reason={reason}")

    # Wait for user response or timeout
    try:
        await asyncio.wait_for(event.wait(), timeout=timeout)
        approved = _approval_results.pop(request_id, False)
    except asyncio.TimeoutError:
        approved = False
        logger.warning(f"Fallback request {request_id} timed out after {timeout}s")
    finally:
        _pending_approvals.pop(request_id, None)
        _approval_results.pop(request_id, None)

    return approved


def approve_fallback(request_id: str, approved: bool) -> bool:
    """Called by the API endpoint when user responds to a fallback request."""
    if request_id not in _pending_approvals:
        return False
    _approval_results[request_id] = approved
    _pending_approvals[request_id].set()
    return True


def get_pending_requests() -> list[str]:
    """Return list of pending fallback request IDs."""
    return list(_pending_approvals.keys())
