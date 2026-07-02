"""
Evidence packages for grounding AI output against deterministic facts.

An EvidencePackage captures the authoritative facts produced by deterministic
engines at the moment an AI call is made. It provides:
  - A stable snapshot_id for audit-trail correlation.
  - allowed_amounts: the exact rupee figures the AI is permitted to reference.
  - allowed_entities: supplier/SKU names the AI is permitted to mention.

Grounding validation (validate_grounding) checks that AI narrative output
does not contain rupee figures or entity names that were not in the evidence
package. This is a LOCAL factual check — distinct from Bedrock Guardrails,
which is a content-safety check that cannot verify numerical accuracy.
"""
from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from datetime import datetime, timezone
from uuid import uuid4


@dataclass
class EvidencePackage:
    """Immutable snapshot of deterministic facts used to ground AI output."""
    snapshot_id: str
    supplier_id: str
    supplier_name: str
    risk_score: float
    risk_level: str
    exposure_inr: float
    days_to_stockout: int
    sku_count: int
    facts_hash: str
    created_at: str
    allowed_amounts: frozenset[float] = field(default_factory=frozenset)
    allowed_entities: frozenset[str] = field(default_factory=frozenset)

    def to_dict(self) -> dict:
        return {
            "snapshot_id": self.snapshot_id,
            "supplier_id": self.supplier_id,
            "supplier_name": self.supplier_name,
            "risk_score": self.risk_score,
            "risk_level": self.risk_level,
            "exposure_inr": self.exposure_inr,
            "days_to_stockout": self.days_to_stockout,
            "sku_count": self.sku_count,
            "facts_hash": self.facts_hash,
            "created_at": self.created_at,
        }


def build_evidence_package(
    supplier_id: str,
    supplier_name: str,
    risk_score: float,
    risk_level: str,
    exposure_inr: float,
    days_to_stockout: int,
    sku_count: int,
    extra_amounts: list[float] | None = None,
    extra_entities: list[str] | None = None,
) -> EvidencePackage:
    """
    Build an immutable evidence package from deterministic engine outputs.
    The facts_hash uniquely identifies this combination of inputs so that
    historical analysis can be reproduced given the same snapshot.
    """
    facts = {
        "supplier_id": supplier_id,
        "supplier_name": supplier_name,
        "risk_score": round(risk_score, 4),
        "risk_level": risk_level,
        "exposure_inr": round(exposure_inr, 2),
        "days_to_stockout": days_to_stockout,
        "sku_count": sku_count,
    }
    facts_json = json.dumps(facts, sort_keys=True)
    facts_hash = hashlib.sha256(facts_json.encode()).hexdigest()[:16]

    # Permitted rupee amounts — AI may reference these; any other figure is a violation.
    base_amounts: set[float] = {exposure_inr}
    if extra_amounts:
        base_amounts.update(extra_amounts)

    # Permitted entity names (case-insensitive match used during validation).
    base_entities: set[str] = {supplier_name.lower()}
    if extra_entities:
        base_entities.update(e.lower() for e in extra_entities)

    return EvidencePackage(
        snapshot_id=str(uuid4()),
        supplier_id=supplier_id,
        supplier_name=supplier_name,
        risk_score=risk_score,
        risk_level=risk_level,
        exposure_inr=exposure_inr,
        days_to_stockout=days_to_stockout,
        sku_count=sku_count,
        facts_hash=facts_hash,
        created_at=datetime.now(timezone.utc).isoformat(),
        allowed_amounts=frozenset(base_amounts),
        allowed_entities=frozenset(base_entities),
    )


# ── Rupee amount pattern: ₹1,23,456  or  ₹1234567.89 ─────────────────────────
_RUPEE_RE = re.compile(r'₹\s*([\d,]+(?:\.\d+)?)')
_TOLERANCE = 0.02   # 2 % — covers rounding/reformatting in model output


def _parse_inr(digits: str) -> float:
    return float(digits.replace(",", ""))


@dataclass
class GroundingResult:
    passed: bool
    violations: list[str]
    grounding_status: str   # "grounded" | "violation" | "skipped"


def validate_grounding(
    narrative_fields: dict[str, str],
    evidence: EvidencePackage,
) -> GroundingResult:
    """
    Check that narrative text does not contain rupee amounts that were not
    present in the evidence package.

    This is intentionally strict: any ₹ figure above ₹100 that is not
    within 2 % of a known allowed amount is flagged as a violation.
    The caller decides whether to reject the output or log and continue.
    """
    violations: list[str] = []

    for field_name, text in narrative_fields.items():
        if not text:
            continue
        for match in _RUPEE_RE.finditer(text):
            amount = _parse_inr(match.group(1))
            if amount < 100:   # below ₹100 is not a material financial claim
                continue
            supported = any(
                abs(amount - allowed) <= max(allowed * _TOLERANCE, 1.0)
                for allowed in evidence.allowed_amounts
            )
            if not supported:
                violations.append(
                    f"field='{field_name}' unsupported_amount='{match.group(0)}' "
                    f"snapshot_id='{evidence.snapshot_id}'"
                )

    return GroundingResult(
        passed=len(violations) == 0,
        violations=violations,
        grounding_status="grounded" if not violations else "violation",
    )
