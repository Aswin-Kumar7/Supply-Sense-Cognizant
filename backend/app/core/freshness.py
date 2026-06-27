"""
Data provenance and freshness utilities.

Content-addressable cache keys ensure that:
  - changing the policy version automatically routes past stale cached results;
  - different evidence snapshots produce different cache keys;
  - model/prompt version changes invalidate all prior cached AI narratives.

FreshnessMetadata is attached to every API response so consumers can see
exactly how old the data is and whether it has passed its freshness budget.
"""
from __future__ import annotations

import hashlib
import json
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Optional


# Current prompt/schema version — bump when prompt wording changes significantly.
PROMPT_VERSION = "1"

# Default max-age (seconds) before a result is considered stale.
DEFAULT_STALE_AFTER = 600


def build_cache_key(
    evidence_hash: str,
    risk_policy_version: int,
    financial_policy_version: int,
    model_version: str = "anthropic.claude-3-haiku-20240307-v1:0",
    prompt_version: str = PROMPT_VERSION,
) -> str:
    """
    Content-addressable cache key.

    Same evidence + same policies + same model + same prompt = same key → cache hit.
    Any change in evidence OR policy version produces a new key, automatically
    routing clients past stale cached results without requiring explicit invalidation.

    Returns a 32-character lowercase hex string.
    """
    components = {
        "evidence_hash": evidence_hash,
        "risk_policy_version": risk_policy_version,
        "financial_policy_version": financial_policy_version,
        "model_version": model_version,
        "prompt_version": prompt_version,
    }
    key_json = json.dumps(components, sort_keys=True)
    return hashlib.sha256(key_json.encode()).hexdigest()[:32]


@dataclass
class FreshnessMetadata:
    """Freshness information attached to every cached API response."""
    generated_at: str            # ISO-8601 UTC timestamp when result was produced
    cache_age_seconds: float     # Seconds since generation
    stale: bool                  # True if age > stale_after_seconds
    stale_after_seconds: int     # Configured max-age budget
    stale_reason: Optional[str]  # Populated only when stale=True

    def to_dict(self) -> dict:
        return {
            "generated_at": self.generated_at,
            "cache_age_seconds": self.cache_age_seconds,
            "stale": self.stale,
            "stale_after_seconds": self.stale_after_seconds,
            "stale_reason": self.stale_reason,
        }


def compute_freshness(
    generated_at: datetime,
    stale_after_seconds: int = DEFAULT_STALE_AFTER,
) -> FreshnessMetadata:
    """
    Compute freshness metadata from a generation timestamp.

    Handles both timezone-aware and naive (assumed UTC) datetimes.
    A result is stale when cache_age_seconds > stale_after_seconds.
    """
    now = datetime.now(timezone.utc)
    if generated_at.tzinfo is None:
        generated_at = generated_at.replace(tzinfo=timezone.utc)
    age = max(0.0, (now - generated_at).total_seconds())
    stale = age > stale_after_seconds
    return FreshnessMetadata(
        generated_at=generated_at.isoformat(),
        cache_age_seconds=round(age, 1),
        stale=stale,
        stale_after_seconds=stale_after_seconds,
        stale_reason="exceeded_max_age" if stale else None,
    )
