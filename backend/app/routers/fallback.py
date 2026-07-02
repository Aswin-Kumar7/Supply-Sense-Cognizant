"""
Fallback approval endpoints — removed.

The human-in-the-loop fallback approval flow was dead code: fallback_manager.py
was never called by any agent, and FallbackApprovalBanner.tsx could never fire.
Agents now fail-fast with explicit error dicts (status: "error") instead of
presenting a fake approval UI. These stubs keep existing API clients from 500ing.
"""

from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/agents", tags=["Agent Fallback"])


class FallbackApprovalRequest(BaseModel):
    request_id: str
    approved: bool


@router.post("/fallback/approve")
async def approve_agent_fallback(request: FallbackApprovalRequest):
    """Removed — fallback approval flow was dead code."""
    return {"status": "removed", "detail": "Fallback approval flow has been removed. Agents fail-fast with error status instead."}


@router.get("/fallback/pending")
async def get_pending_fallbacks():
    """Removed — no pending fallback requests are ever queued."""
    return {"pending": []}
