"""
Policy service — load, create, activate, and rollback versioned policies.

Every analysis engine reads its configuration from the active policy instead
of using hardcoded constants. Results include the policy_version so that
any historical output can be reproduced with the same policy snapshot.

Default policies (version 1) match the original hardcoded constants exactly,
so the system is backward-compatible on first deployment.
"""

import uuid
from datetime import datetime, timezone
from functools import lru_cache
from typing import TypeVar

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.logging import logger
from app.models.policy import PolicyRecord
from app.schemas.policy import (
    RiskPolicyConfig,
    FinancialPolicyConfig,
    ActionPolicyConfig,
    ReviewPolicyConfig,
    PolicySnapshot,
    PolicyCreateRequest,
    PolicyResponse,
)


# ── Default policy configs (mirror original hardcoded constants) ──────────────

_DEFAULT_RISK_CONFIG = RiskPolicyConfig()
_DEFAULT_FINANCIAL_CONFIG = FinancialPolicyConfig()
_DEFAULT_ACTION_CONFIG = ActionPolicyConfig()
_DEFAULT_REVIEW_CONFIG = ReviewPolicyConfig()


# ── In-process policy cache ───────────────────────────────────────────────────
# Keyed by policy_type. Cleared by activate/rollback operations.
_ACTIVE_POLICY_CACHE: dict[str, tuple[int, object]] = {}
#                                                      ^version ^config


def _invalidate_cache(policy_type: str | None = None) -> None:
    if policy_type:
        _ACTIVE_POLICY_CACHE.pop(policy_type, None)
    else:
        _ACTIVE_POLICY_CACHE.clear()


# ── Default seeds ─────────────────────────────────────────────────────────────

_DEFAULTS: dict[str, tuple[str, object]] = {
    "risk": (
        "Default risk policy — mirrors original hardcoded weights and thresholds",
        _DEFAULT_RISK_CONFIG,
    ),
    "financial": (
        "Default financial policy — mirrors original hardcoded SLA rates and multipliers",
        _DEFAULT_FINANCIAL_CONFIG,
    ),
    "action": (
        "Default action policy — standard escalation rules and spend limits",
        _DEFAULT_ACTION_CONFIG,
    ),
    "review": (
        "Default review policy — 60% confidence threshold for human review",
        _DEFAULT_REVIEW_CONFIG,
    ),
}


# ── Service ───────────────────────────────────────────────────────────────────

class PolicyService:

    def __init__(self, db: AsyncSession):
        self.db = db

    async def ensure_defaults_exist(self) -> None:
        """Create default version-1 policies if they don't exist yet."""
        for policy_type, (description, config) in _DEFAULTS.items():
            result = await self.db.execute(
                select(PolicyRecord).where(
                    PolicyRecord.policy_type == policy_type,
                    PolicyRecord.version == 1,
                )
            )
            if result.scalar_one_or_none() is None:
                record = PolicyRecord(
                    id=uuid.uuid4(),
                    policy_type=policy_type,
                    version=1,
                    name=f"Default {policy_type} policy",
                    description=description,
                    config=config.model_dump(),
                    is_active=True,
                    is_default=True,
                    created_at=datetime.now(timezone.utc),
                    activated_at=datetime.now(timezone.utc),
                    created_by="system",
                )
                self.db.add(record)
        await self.db.commit()

    async def get_active_policy(self, policy_type: str) -> tuple[int, dict]:
        """
        Return (version, config_dict) for the active policy of the given type.
        Falls back to the in-memory default if the DB is unavailable.
        """
        if policy_type in _ACTIVE_POLICY_CACHE:
            return _ACTIVE_POLICY_CACHE[policy_type]

        try:
            result = await self.db.execute(
                select(PolicyRecord)
                .where(
                    PolicyRecord.policy_type == policy_type,
                    PolicyRecord.is_active == True,  # noqa: E712
                )
                .order_by(PolicyRecord.version.desc())
                .limit(1)
            )
            record = result.scalar_one_or_none()
        except Exception as exc:
            logger.warning(f"Policy DB read failed for {policy_type}: {exc}")
            record = None

        if record is None:
            logger.warning(f"No active {policy_type} policy found, using default")
            _ACTIVE_POLICY_CACHE[policy_type] = (1, _DEFAULTS[policy_type][1].model_dump())
            return _ACTIVE_POLICY_CACHE[policy_type]

        _ACTIVE_POLICY_CACHE[policy_type] = (record.version, record.config)
        return _ACTIVE_POLICY_CACHE[policy_type]

    async def get_active_risk_policy(self) -> tuple[int, RiskPolicyConfig]:
        version, config = await self.get_active_policy("risk")
        return version, RiskPolicyConfig.model_validate(config)

    async def get_active_financial_policy(self) -> tuple[int, FinancialPolicyConfig]:
        version, config = await self.get_active_policy("financial")
        return version, FinancialPolicyConfig.model_validate(config)

    async def get_active_action_policy(self) -> tuple[int, ActionPolicyConfig]:
        version, config = await self.get_active_policy("action")
        return version, ActionPolicyConfig.model_validate(config)

    async def get_active_review_policy(self) -> tuple[int, ReviewPolicyConfig]:
        version, config = await self.get_active_policy("review")
        return version, ReviewPolicyConfig.model_validate(config)

    async def get_active_snapshot(self) -> PolicySnapshot:
        """Build a complete policy snapshot for embedding in analysis results."""
        rv, rp = await self.get_active_risk_policy()
        fv, fp = await self.get_active_financial_policy()
        av, ap = await self.get_active_action_policy()
        wv, wp = await self.get_active_review_policy()
        return PolicySnapshot(
            risk_version=rv,
            financial_version=fv,
            action_version=av,
            review_version=wv,
            risk=rp,
            financial=fp,
            action=ap,
            review=wp,
            captured_at=datetime.now(timezone.utc).isoformat(),
        )

    async def get_policy_by_version(
        self, policy_type: str, version: int
    ) -> PolicyRecord | None:
        result = await self.db.execute(
            select(PolicyRecord).where(
                PolicyRecord.policy_type == policy_type,
                PolicyRecord.version == version,
            )
        )
        return result.scalar_one_or_none()

    async def list_versions(self, policy_type: str) -> list[PolicyRecord]:
        result = await self.db.execute(
            select(PolicyRecord)
            .where(PolicyRecord.policy_type == policy_type)
            .order_by(PolicyRecord.version.desc())
        )
        return list(result.scalars().all())

    async def create_version(self, req: PolicyCreateRequest) -> PolicyRecord:
        """Create a new (inactive) policy version. Does not activate it."""
        # Validate config against the correct schema
        _config_models = {
            "risk": RiskPolicyConfig,
            "financial": FinancialPolicyConfig,
            "action": ActionPolicyConfig,
            "review": ReviewPolicyConfig,
        }
        model_cls = _config_models.get(req.policy_type)
        if model_cls is None:
            raise ValueError(f"Unknown policy_type: {req.policy_type!r}")
        # This will raise ValidationError if config is invalid
        validated = model_cls.model_validate(req.config)

        # Get next version number
        result = await self.db.execute(
            select(PolicyRecord.version)
            .where(PolicyRecord.policy_type == req.policy_type)
            .order_by(PolicyRecord.version.desc())
            .limit(1)
        )
        row = result.scalar_one_or_none()
        next_version = (row or 0) + 1

        record = PolicyRecord(
            id=uuid.uuid4(),
            policy_type=req.policy_type,
            version=next_version,
            name=req.name,
            description=req.description,
            config=validated.model_dump(),
            is_active=False,
            is_default=False,
            created_at=datetime.now(timezone.utc),
            created_by=req.created_by,
        )
        self.db.add(record)
        await self.db.commit()
        await self.db.refresh(record)
        logger.info(f"Created {req.policy_type} policy version {next_version}")
        return record

    async def activate_version(
        self, policy_type: str, version: int, activated_by: str = "system"
    ) -> PolicyRecord:
        """
        Activate a specific policy version.
        Deactivates all other versions of the same type atomically.
        """
        target = await self.get_policy_by_version(policy_type, version)
        if target is None:
            raise ValueError(f"No {policy_type} policy version {version} found")

        # Deactivate all versions of this type
        await self.db.execute(
            update(PolicyRecord)
            .where(PolicyRecord.policy_type == policy_type)
            .values(is_active=False)
        )
        # Activate target
        target.is_active = True
        target.activated_at = datetime.now(timezone.utc)
        await self.db.commit()
        await self.db.refresh(target)

        # Clear cache
        _invalidate_cache(policy_type)
        logger.info(
            f"{policy_type} policy version {version} activated by {activated_by}"
        )
        return target

    async def rollback_to_version(
        self, policy_type: str, version: int, rolled_back_by: str = "system"
    ) -> PolicyRecord:
        """Rollback: activate a previous version (delegates to activate_version)."""
        logger.warning(
            f"Policy rollback: {policy_type} → version {version} by {rolled_back_by}"
        )
        return await self.activate_version(policy_type, version, activated_by=rolled_back_by)

    async def replay_analysis(
        self, policy_type: str, version: int
    ) -> dict:
        """
        Return the policy config for a specific historical version.
        Use this to reproduce an analysis using the exact policy that was active.
        """
        record = await self.get_policy_by_version(policy_type, version)
        if record is None:
            raise ValueError(f"No {policy_type} policy version {version}")
        return {
            "policy_type": record.policy_type,
            "version": record.version,
            "name": record.name,
            "config": record.config,
            "activated_at": record.activated_at.isoformat() if record.activated_at else None,
        }


def record_to_response(r: PolicyRecord) -> PolicyResponse:
    return PolicyResponse(
        id=str(r.id),
        policy_type=r.policy_type,
        version=r.version,
        name=r.name,
        description=r.description,
        is_active=r.is_active,
        is_default=r.is_default,
        created_at=r.created_at.isoformat(),
        activated_at=r.activated_at.isoformat() if r.activated_at else None,
        created_by=r.created_by,
    )
