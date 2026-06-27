"""
Authentication and role-based access control.

Authentication: API key in X-API-Key header.
Keys are stored as SHA-256 hashes — the plaintext is never persisted.

RBAC hierarchy (each role includes all lower roles):
  viewer   — read-only access to all data
  analyst  — viewer + can trigger syncs and simulations
  approver — analyst + can approve/reject action cards
  admin    — approver + can manage keys, activate policies, bust caches

Usage in endpoint:

    from app.core.auth import require_auth, require_role

    @router.post("/admin-only")
    async def endpoint(principal = Depends(require_role("admin"))):
        ...

    @router.get("/read-only")
    async def endpoint(principal = Depends(require_auth)):
        ...
"""
from __future__ import annotations

import hashlib
from typing import Optional

from fastapi import Depends, HTTPException, Security, status
from fastapi.security import APIKeyHeader
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database import get_db
from app.models.api_key import ApiKey

# Ordered hierarchy — each position includes all roles below it
_ROLE_HIERARCHY: dict[str, int] = {
    "viewer": 0,
    "analyst": 1,
    "approver": 2,
    "admin": 3,
}

_api_key_header = APIKeyHeader(name="X-API-Key", auto_error=False)


def hash_key(plaintext: str) -> str:
    """Return the SHA-256 hex digest of a plaintext API key."""
    return hashlib.sha256(plaintext.encode()).hexdigest()


def verify_key(plaintext: str, stored_hash: str) -> bool:
    """Constant-time comparison of a plaintext key against its stored hash."""
    return hashlib.sha256(plaintext.encode()).hexdigest() == stored_hash


def has_role(principal: ApiKey, required_role: str) -> bool:
    """
    Return True if principal holds the required role or any higher role.

    An admin can do everything an approver can, an approver can do everything
    an analyst can, etc.
    """
    required_level = _ROLE_HIERARCHY.get(required_role, 999)
    for role in principal.roles:
        if _ROLE_HIERARCHY.get(role, -1) >= required_level:
            return True
    return False


async def _lookup_key(
    raw_key: Optional[str],
    db: AsyncSession,
) -> ApiKey:
    """
    Look up a principal by raw API key.

    Raises 401 if the key is missing, unknown, or inactive.
    """
    if not raw_key:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="X-API-Key header is required",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    key_hash = hash_key(raw_key)
    record = (await db.execute(
        select(ApiKey).where(
            ApiKey.key_hash == key_hash,
            ApiKey.is_active == True,
        )
    )).scalar_one_or_none()
    if record is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or inactive API key",
            headers={"WWW-Authenticate": "ApiKey"},
        )
    return record


async def require_auth(
    raw_key: Optional[str] = Security(_api_key_header),
    db: AsyncSession = Depends(get_db),
) -> ApiKey:
    """FastAPI dependency: require any valid API key."""
    return await _lookup_key(raw_key, db)


def require_role(required_role: str):
    """
    FastAPI dependency factory: require a specific role (or higher).

    Usage:
        @router.post("/admin-only")
        async def endpoint(principal = Depends(require_role("admin"))):
            ...
    """
    async def _check(
        raw_key: Optional[str] = Security(_api_key_header),
        db: AsyncSession = Depends(get_db),
    ) -> ApiKey:
        principal = await _lookup_key(raw_key, db)
        if not has_role(principal, required_role):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Role '{required_role}' or higher is required",
            )
        return principal
    return _check
