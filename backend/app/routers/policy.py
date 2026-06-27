"""
Policy management API.

GET  /policy/{type}/active       — current active policy + version number
GET  /policy/{type}/versions     — full version history
GET  /policy/{type}/version/{v}  — specific version for replay
POST /policy/{type}              — create new (inactive) version
POST /policy/{type}/activate/{v} — activate a version (deactivates current)
POST /policy/{type}/rollback/{v} — alias for activate with rollback semantics
GET  /policy/snapshot            — full snapshot of all active policies
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import require_role
from app.core.database import get_db
from app.models.api_key import ApiKey
from app.schemas.policy import (
    PolicyCreateRequest,
    PolicyResponse,
    PolicyActivateRequest,
    PolicySnapshot,
)
from app.services.policy_service import PolicyService, record_to_response

router = APIRouter(prefix="/policy", tags=["Policy"])

_VALID_TYPES = {"risk", "financial", "action", "review"}


def _check_type(policy_type: str) -> None:
    if policy_type not in _VALID_TYPES:
        raise HTTPException(
            status_code=422,
            detail=f"policy_type must be one of {sorted(_VALID_TYPES)}",
        )


@router.get("/snapshot", response_model=PolicySnapshot)
async def get_policy_snapshot(db: AsyncSession = Depends(get_db)):
    """Full snapshot of all active policies, suitable for embedding in analysis results."""
    svc = PolicyService(db)
    await svc.ensure_defaults_exist()
    return await svc.get_active_snapshot()


@router.get("/{policy_type}/active")
async def get_active_policy(
    policy_type: str,
    db: AsyncSession = Depends(get_db),
):
    """Return the active version number and configuration for the given policy type."""
    _check_type(policy_type)
    svc = PolicyService(db)
    await svc.ensure_defaults_exist()
    version, config = await svc.get_active_policy(policy_type)
    return {"policy_type": policy_type, "version": version, "config": config}


@router.get("/{policy_type}/versions", response_model=list[PolicyResponse])
async def list_versions(
    policy_type: str,
    db: AsyncSession = Depends(get_db),
):
    """List all versions of the given policy type, newest first."""
    _check_type(policy_type)
    svc = PolicyService(db)
    await svc.ensure_defaults_exist()
    records = await svc.list_versions(policy_type)
    return [record_to_response(r) for r in records]


@router.get("/{policy_type}/version/{version}")
async def get_version(
    policy_type: str,
    version: int,
    db: AsyncSession = Depends(get_db),
):
    """Fetch a specific historical policy version for audit replay."""
    _check_type(policy_type)
    svc = PolicyService(db)
    data = await svc.replay_analysis(policy_type, version)
    return data


@router.post("/{policy_type}", response_model=PolicyResponse, status_code=201)
async def create_policy_version(
    policy_type: str,
    req: PolicyCreateRequest,
    principal: ApiKey = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new (inactive) policy version.
    The version is not applied until explicitly activated.
    Validates config against the policy type's Pydantic schema.
    """
    _check_type(policy_type)
    # Ensure policy_type in req matches path
    req_dict = req.model_dump()
    req_dict["policy_type"] = policy_type
    req = PolicyCreateRequest(**req_dict)
    try:
        record = await PolicyService(db).create_version(req)
    except Exception as exc:
        raise HTTPException(status_code=422, detail=str(exc))
    return record_to_response(record)


@router.post("/{policy_type}/activate/{version}", response_model=PolicyResponse)
async def activate_version(
    policy_type: str,
    version: int,
    req: PolicyActivateRequest = PolicyActivateRequest(),
    principal: ApiKey = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Activate a specific policy version.
    All other versions of this type are deactivated.
    The in-process cache is invalidated so the next request uses the new policy.
    """
    _check_type(policy_type)
    try:
        record = await PolicyService(db).activate_version(
            policy_type, version, activated_by=req.activated_by
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return record_to_response(record)


@router.post("/{policy_type}/rollback/{version}", response_model=PolicyResponse)
async def rollback_to_version(
    policy_type: str,
    version: int,
    req: PolicyActivateRequest = PolicyActivateRequest(),
    principal: ApiKey = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Roll back to a previous policy version.
    Semantically identical to activate, but signals intent in audit logs.
    """
    _check_type(policy_type)
    try:
        record = await PolicyService(db).rollback_to_version(
            policy_type, version, rolled_back_by=req.activated_by
        )
    except ValueError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return record_to_response(record)
