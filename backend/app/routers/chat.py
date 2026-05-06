"""
What-If Chat endpoint.

POST /api/v1/chat
- Accepts a message + optional session_id
- Uses Bedrock AgentCore (boto3 session storage fallback) for context persistence
- Calls the ConversationalAdvisorAgent from strands_agents.py
- Returns: answer, session_id, sources
"""

import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import logger
from app.agents.strands_agents import ConversationalAdvisorAgent

router = APIRouter(prefix="/chat", tags=["What-If Chat"])

# ── In-process session store (fallback when AgentCore unavailable) ─────────
# Maps session_id → list of {"role": str, "content": str}
_SESSION_STORE: dict[str, list[dict]] = {}
_MAX_HISTORY = 20  # max turns kept per session
_MAX_SESSIONS = 200  # evict oldest when exceeded


def _get_or_create_session(session_id: Optional[str]) -> tuple[str, list[dict]]:
    """Return (session_id, history). Creates new session if id is None or unknown."""
    if not session_id or session_id not in _SESSION_STORE:
        session_id = str(uuid.uuid4())
        _SESSION_STORE[session_id] = []
        # Evict oldest session if over cap
        if len(_SESSION_STORE) > _MAX_SESSIONS:
            oldest = next(iter(_SESSION_STORE))
            del _SESSION_STORE[oldest]
    return session_id, _SESSION_STORE[session_id]


def _append_turn(session_id: str, role: str, content: str):
    history = _SESSION_STORE.setdefault(session_id, [])
    history.append({"role": role, "content": content})
    # Trim to last N turns
    if len(history) > _MAX_HISTORY:
        _SESSION_STORE[session_id] = history[-_MAX_HISTORY:]


# ── AgentCore session storage (optional) ─────────────────────────────────
# When boto3 + agentcore are available, persist history server-side.
# Falls back silently to the in-process store above.
try:
    import boto3
    _agentcore_client = boto3.client("bedrock-agent-runtime", region_name="us-east-1")
    _AGENTCORE_AVAILABLE = True
except Exception:
    _agentcore_client = None
    _AGENTCORE_AVAILABLE = False


async def _agentcore_get_history(session_id: str) -> list[dict]:
    """Try to retrieve session history from AgentCore; fall back to local store."""
    if not _AGENTCORE_AVAILABLE:
        return _SESSION_STORE.get(session_id, [])
    try:
        import asyncio
        response = await asyncio.to_thread(
            _agentcore_client.get_session,
            sessionIdentifier=session_id,
        )
        raw = response.get("sessionMetadata", {}).get("conversationHistory", "[]")
        return json.loads(raw) if isinstance(raw, str) else raw
    except Exception:
        return _SESSION_STORE.get(session_id, [])


async def _agentcore_save_history(session_id: str, history: list[dict]):
    """Try to persist history via AgentCore; silently fall back to local store."""
    _SESSION_STORE[session_id] = history  # always keep local copy
    if not _AGENTCORE_AVAILABLE:
        return
    try:
        import asyncio
        await asyncio.to_thread(
            _agentcore_client.update_session,
            sessionIdentifier=session_id,
            sessionMetadata={"conversationHistory": json.dumps(history[-_MAX_HISTORY:])},
        )
    except Exception:
        pass  # local store already updated


# ── Request / Response schemas ────────────────────────────────────────────

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None


class ChatResponse(BaseModel):
    answer: str
    session_id: str
    sources: list[str] = []


# ── Endpoint ──────────────────────────────────────────────────────────────

@router.post("", response_model=ChatResponse)
async def chat(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """
    Conversational what-if analysis endpoint.
    Maintains session context across turns for multi-turn reasoning.
    """
    session_id, _ = _get_or_create_session(request.session_id)
    history = await _agentcore_get_history(session_id)

    logger.info(f"Chat [{session_id[:8]}]: {request.message[:80]}")

    # Call the Conversational Advisor Agent
    advisor = ConversationalAdvisorAgent(db)
    result = await advisor.chat(
        message=request.message, history=history, session_id=session_id
    )

    answer = result.get("answer", "Unable to process your question at this time.")
    sources = result.get("sources", [])

    # Persist turn
    history.append({"role": "user", "content": request.message})
    history.append({"role": "assistant", "content": answer})
    await _agentcore_save_history(session_id, history)

    return ChatResponse(
        answer=answer,
        session_id=session_id,
        sources=sources,
    )
