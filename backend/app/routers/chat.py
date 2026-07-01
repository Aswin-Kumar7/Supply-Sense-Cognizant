"""
What-If Chat endpoint.

POST /api/v1/chat
- Accepts a message + optional session_id
- Keeps multi-turn context in a bounded in-process session store
- Calls the LangGraph tool-using advisor (falls back to the Strands advisor if the
  LangGraph stack is unavailable)
- Returns: answer, session_id, sources
"""

import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.core.logging import logger
from app.core.guardrails import sanitize_user_input, validate_ai_output
from app.agents.langgraph_advisor import LangGraphAdvisor, LANGGRAPH_AVAILABLE
from app.agents.strands_agents import ConversationalAdvisorAgent

# Safe canned replies for guardrail-blocked turns (no LLM call made)
_INPUT_REFUSAL = (
    "I can only help with supply-chain questions about your suppliers, risk, "
    "inventory, and procurement decisions. Please rephrase your question around that."
)
_OUTPUT_REFUSAL = (
    "I wasn't able to produce a safe answer for that. Please try rephrasing your "
    "supply-chain question."
)

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
    session_id, history = _get_or_create_session(request.session_id)

    # ── Input guardrail — refuse injection/empty BEFORE calling Bedrock ──────
    clean_message, blocked, reason = sanitize_user_input(request.message)
    if blocked:
        logger.warning(f"Chat [{session_id[:8]}]: input guardrail blocked ({reason})")
        _append_turn(session_id, "user", request.message[:200])
        _append_turn(session_id, "assistant", _INPUT_REFUSAL)
        return ChatResponse(answer=_INPUT_REFUSAL, session_id=session_id, sources=[])

    logger.info(f"Chat [{session_id[:8]}]: {clean_message[:80]}")

    # Prefer the LangGraph tool-using advisor; fall back to the Strands advisor if
    # the LangGraph stack isn't installed. Snapshot history before appending this
    # turn so the agent doesn't see the current question twice.
    advisor = LangGraphAdvisor(db) if LANGGRAPH_AVAILABLE else ConversationalAdvisorAgent(db)
    result = await advisor.chat(
        message=clean_message, history=list(history), session_id=session_id
    )

    answer = result.get("answer", "Unable to process your question at this time.")
    sources = result.get("sources", [])

    # ── Output guardrail — block prompt/instruction leaks ────────────────────
    answer, leaked = validate_ai_output(answer)
    if leaked:
        logger.warning(f"Chat [{session_id[:8]}]: output guardrail blocked a prompt leak")
        answer = _OUTPUT_REFUSAL
        sources = []

    # Persist turn (bounded in-process store)
    _append_turn(session_id, "user", clean_message)
    _append_turn(session_id, "assistant", answer)

    return ChatResponse(
        answer=answer,
        session_id=session_id,
        sources=sources,
    )
