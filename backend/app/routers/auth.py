"""
Authentication management endpoints.

POST /auth/keys       — create a new API key (admin only)
GET  /auth/keys       — list all keys for the caller's owner_id (admin only)
DELETE /auth/keys/{id} — revoke a key (admin only)
GET  /auth/me         — return caller's principal info (any valid key)
"""
from __future__ import annotations

import secrets
import uuid
from datetime import datetime, timezone
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.auth import hash_key, require_auth, require_role
from app.core.database import get_db
from app.models.api_key import ApiKey

router = APIRouter(prefix="/auth", tags=["Authentication"])

_VALID_ROLES = frozenset({"viewer", "analyst", "approver", "admin"})


class CreateKeyRequest(BaseModel):
    label: str
    roles: list = ["viewer"]
    owner_id: Optional[str] = None


class CreateKeyResponse(BaseModel):
    id: str
    label: str
    roles: list
    owner_id: Optional[str]
    # Plaintext key — shown ONCE at creation; never returned again
    key: str
    created_at: str


class KeyInfoResponse(BaseModel):
    id: str
    label: str
    roles: list
    owner_id: Optional[str]
    is_active: bool
    created_at: str
    last_used_at: Optional[str]


@router.get("/me")
async def get_me(principal: ApiKey = Depends(require_auth)):
    """Return the caller's principal record (key info, roles, owner)."""
    return {
        "id": str(principal.id),
        "label": principal.label,
        "roles": principal.roles,
        "owner_id": principal.owner_id,
        "is_active": principal.is_active,
        "created_at": principal.created_at.isoformat(),
    }


@router.post("/keys", response_model=CreateKeyResponse, status_code=status.HTTP_201_CREATED)
async def create_api_key(
    body: CreateKeyRequest,
    principal: ApiKey = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """
    Create a new API key. The plaintext key is returned ONCE — it cannot be
    retrieved again. Store it securely immediately after creation.

    Requires admin role.
    """
    for role in body.roles:
        if role not in _VALID_ROLES:
            raise HTTPException(
                status_code=422,
                detail=f"Invalid role '{role}'. Must be one of {sorted(_VALID_ROLES)}",
            )

    plaintext = secrets.token_hex(32)   # 256-bit random key
    record = ApiKey(
        id=uuid.uuid4(),
        key_hash=hash_key(plaintext),
        label=body.label,
        roles_csv=",".join(body.roles),
        owner_id=body.owner_id,
        is_active=True,
        created_at=datetime.now(timezone.utc),
    )
    db.add(record)
    await db.commit()

    return CreateKeyResponse(
        id=str(record.id),
        label=record.label,
        roles=record.roles,
        owner_id=record.owner_id,
        key=plaintext,
        created_at=record.created_at.isoformat(),
    )


@router.get("/keys", response_model=list[KeyInfoResponse])
async def list_keys(
    principal: ApiKey = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """List all API keys. Requires admin role. Never returns plaintext keys."""
    rows = (await db.execute(
        select(ApiKey).order_by(ApiKey.created_at.desc())
    )).scalars().all()
    return [
        KeyInfoResponse(
            id=str(r.id),
            label=r.label,
            roles=r.roles,
            owner_id=r.owner_id,
            is_active=r.is_active,
            created_at=r.created_at.isoformat(),
            last_used_at=r.last_used_at.isoformat() if r.last_used_at else None,
        )
        for r in rows
    ]


@router.delete("/keys/{key_id}", status_code=status.HTTP_200_OK)
async def revoke_key(
    key_id: str,
    principal: ApiKey = Depends(require_role("admin")),
    db: AsyncSession = Depends(get_db),
):
    """Revoke (deactivate) an API key. Requires admin role."""
    try:
        uid = uuid.UUID(key_id)
    except ValueError:
        raise HTTPException(status_code=422, detail="Invalid key ID format")

    record = (await db.execute(
        select(ApiKey).where(ApiKey.id == uid)
    )).scalar_one_or_none()
    if record is None:
        raise HTTPException(status_code=404, detail="Key not found")
    if str(record.id) == str(principal.id):
        raise HTTPException(status_code=400, detail="Cannot revoke your own key")

    record.is_active = False
    await db.commit()
    return {"status": "revoked", "key_id": key_id}
