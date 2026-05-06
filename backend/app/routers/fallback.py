"""API endpoints for managing Strands fallback approvals."""

from fastapi import APIRouter
from pydantic import BaseModel

from app.core.fallback_manager import approve_fallback, get_pending_requests

router = APIRouter(prefix="/agents", tags=["Agent Fallback"])


class FallbackApprovalRequest(BaseModel):
    request_id: str
    approved: bool


@router.post("/fallback/approve")
async def approve_agent_fallback(request: FallbackApprovalRequest):
    """Approve or deny a Strands fallback request."""
    success = approve_fallback(request.request_id, request.approved)
    if not success:
        return {"status": "error", "message": "Request not found or already resolved"}
    action = "approved" if request.approved else "denied"
    return {"status": action, "request_id": request.request_id}


@router.get("/fallback/pending")
async def get_pending_fallbacks():
    """Get list of pending fallback approval requests."""
    return {"pending": get_pending_requests()}
