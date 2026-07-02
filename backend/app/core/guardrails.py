"""
Application-level input & output guardrails for SupplySense.

These run in-process and need NO AWS Bedrock Guardrail resource (none is
provisioned on this account). They are the first line of defense for the
free-text surfaces (chat). For STRUCTURED AI output the authoritative checks
remain the Pydantic contracts (`schemas/ai_contracts.py`, extra="forbid") plus
rupee grounding (`core/evidence.py`); this module complements those.

Layers:
  Input  — length cap + prompt-injection / role-reassignment detection.
  Output — length cap + system-prompt / instruction-leak detection.

Blocked calls short-circuit BEFORE hitting Bedrock, so they also save tokens.
"""
from __future__ import annotations

import re

# ── Input guardrail ──────────────────────────────────────────────────────────

MAX_INPUT_CHARS = 1000

# Patterns that indicate an attempt to override the system prompt, reassign the
# agent's role, or exfiltrate instructions. Kept deliberately tight to avoid
# false-positives on legitimate supply-chain questions.
_INJECTION_PATTERNS = [
    r"ignore\s+(all\s+|the\s+|your\s+|any\s+)?(previous|prior|above|earlier)\s+(instruction|prompt|message|rule)",
    r"disregard\s+(all\s+|the\s+|your\s+|any\s+)?(previous|prior|above|earlier)",
    r"forget\s+(everything|all|your\s+(instructions|rules|prompt))",
    r"you\s+are\s+now\s+(a|an|the)\b",
    r"(reveal|show|print|repeat|tell\s+me)\s+(your\s+)?(the\s+)?(system\s+)?(prompt|instructions)",
    r"</?\s*(system|instruction|prompt)\s*>",
    r"\bdeveloper\s+mode\b",
    r"\bjailbreak\b",
    r"\bDAN\b",
    r"pretend\s+(to\s+be|you\s+are)",
]
_INJECTION_RE = re.compile("|".join(_INJECTION_PATTERNS), re.IGNORECASE)


def sanitize_user_input(text: str) -> tuple[str, bool, str]:
    """
    Validate/clean free-text user input before it reaches an LLM.

    Returns (clean_text, blocked, reason):
      - blocked=True  → caller should refuse without calling the model.
      - reason ∈ {"empty", "prompt_injection", ""}
    """
    if not text or not text.strip():
        return "", True, "empty"
    clean = text.strip()
    if len(clean) > MAX_INPUT_CHARS:
        clean = clean[:MAX_INPUT_CHARS].rstrip()
    if _INJECTION_RE.search(clean):
        return clean, True, "prompt_injection"
    return clean, False, ""


# ── Output guardrail ─────────────────────────────────────────────────────────

MAX_OUTPUT_CHARS = 4000

# Markers that should NEVER appear in a user-facing answer — they indicate the
# model echoed its system prompt or the operational-data delimiters.
_LEAK_PATTERNS = [
    r"CRITICAL RULES",
    r"\[BEGIN OPERATIONAL DATA",
    r"\[END OPERATIONAL DATA\]",
    r"_AGENT_SYSTEM_SUFFIX",
    r"You are the (Conversational Advisor|Risk Assessment|Prescriptive Action|Supervisor|Signal Intelligence) Agent",
]
_LEAK_RE = re.compile("|".join(_LEAK_PATTERNS), re.IGNORECASE)


def validate_ai_output(text: str) -> tuple[str, bool]:
    """
    Check a free-text AI answer before returning it to the user.

    Returns (clean_text, blocked):
      - blocked=True → the output leaked the prompt/instructions; caller should
        replace it with a safe message.
      - otherwise the text is returned, length-capped.
    """
    if not text:
        return "", False
    if _LEAK_RE.search(text):
        return "", True
    if len(text) > MAX_OUTPUT_CHARS:
        text = text[:MAX_OUTPUT_CHARS].rstrip() + "…"
    return text, False
