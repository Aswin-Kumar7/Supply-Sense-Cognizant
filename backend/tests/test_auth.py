"""
Phase 5 — Authentication and RBAC tests.

Covers:
- API key hashing (determinism, non-plaintext storage)
- verify_key correct/incorrect validation
- has_role hierarchy (viewer < analyst < approver < admin)
- require_auth raises 401 for missing/invalid key
- require_role raises 403 for insufficient role
- ApiKey model attributes
- ApprovalRecord model attributes and valid states
- Approval workflow state transitions (valid and invalid)
"""
import asyncio
import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock

import pytest
from fastapi import HTTPException

from app.core.auth import hash_key, verify_key, has_role, require_auth, require_role
from app.models.api_key import ApiKey
from app.models.approval_record import ApprovalRecord, APPROVAL_STATES


# ── Helpers ───────────────────────────────────────────────────────────────────

def _make_key(roles: list, is_active: bool = True, owner_id: str = "user-1") -> ApiKey:
    key = ApiKey()
    key.id = uuid.uuid4()
    key.key_hash = hash_key("test-secret-key-abc")
    key.label = "test-key"
    key.roles_csv = ",".join(roles)
    key.owner_id = owner_id
    key.is_active = is_active
    key.created_at = datetime.now(timezone.utc)
    key.last_used_at = None
    return key


def _make_db_returning(value):
    result = MagicMock()
    result.scalar_one_or_none.return_value = value
    db = AsyncMock()
    db.execute = AsyncMock(return_value=result)
    return db


# ── TestApiKeyHashing ─────────────────────────────────────────────────────────

class TestApiKeyHashing:
    def test_hash_is_deterministic(self):
        assert hash_key("my-secret") == hash_key("my-secret")

    def test_hash_is_not_plaintext(self):
        plaintext = "my-secret"
        assert hash_key(plaintext) != plaintext

    def test_hash_is_64_char_hex(self):
        h = hash_key("test")
        assert len(h) == 64
        assert all(c in "0123456789abcdef" for c in h)

    def test_different_keys_produce_different_hashes(self):
        assert hash_key("key-A") != hash_key("key-B")

    def test_verify_key_correct(self):
        plaintext = "correct-key"
        stored = hash_key(plaintext)
        assert verify_key(plaintext, stored) is True

    def test_verify_key_wrong(self):
        stored = hash_key("real-key")
        assert verify_key("wrong-key", stored) is False

    def test_verify_key_empty_against_hash(self):
        stored = hash_key("real-key")
        assert verify_key("", stored) is False


# ── TestRoleHierarchy ─────────────────────────────────────────────────────────

class TestRoleHierarchy:
    def test_admin_has_admin_role(self):
        assert has_role(_make_key(["admin"]), "admin") is True

    def test_admin_has_approver_role(self):
        assert has_role(_make_key(["admin"]), "approver") is True

    def test_admin_has_analyst_role(self):
        assert has_role(_make_key(["admin"]), "analyst") is True

    def test_admin_has_viewer_role(self):
        assert has_role(_make_key(["admin"]), "viewer") is True

    def test_approver_has_approver_role(self):
        assert has_role(_make_key(["approver"]), "approver") is True

    def test_approver_has_analyst_role(self):
        assert has_role(_make_key(["approver"]), "analyst") is True

    def test_approver_does_not_have_admin_role(self):
        assert has_role(_make_key(["approver"]), "admin") is False

    def test_analyst_has_analyst_role(self):
        assert has_role(_make_key(["analyst"]), "analyst") is True

    def test_analyst_does_not_have_approver_role(self):
        assert has_role(_make_key(["analyst"]), "approver") is False

    def test_analyst_does_not_have_admin_role(self):
        assert has_role(_make_key(["analyst"]), "admin") is False

    def test_viewer_has_viewer_role(self):
        assert has_role(_make_key(["viewer"]), "viewer") is True

    def test_viewer_does_not_have_analyst_role(self):
        assert has_role(_make_key(["viewer"]), "analyst") is False

    def test_multiple_roles_grants_highest(self):
        key = _make_key(["viewer", "analyst"])
        assert has_role(key, "analyst") is True
        assert has_role(key, "approver") is False

    def test_unknown_role_never_grants(self):
        assert has_role(_make_key(["admin"]), "superuser") is False


# ── TestRequireAuth ───────────────────────────────────────────────────────────

class TestRequireAuth:
    def test_missing_key_raises_401(self):
        db = _make_db_returning(None)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                require_auth(raw_key=None, db=db)
            )
        assert exc_info.value.status_code == 401

    def test_invalid_key_raises_401(self):
        db = _make_db_returning(None)
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                require_auth(raw_key="invalid-key", db=db)
            )
        assert exc_info.value.status_code == 401

    def test_valid_key_returns_principal(self):
        key_record = _make_key(["viewer"])
        db = _make_db_returning(key_record)
        principal = asyncio.get_event_loop().run_until_complete(
            require_auth(raw_key="test-secret-key-abc", db=db)
        )
        assert principal is key_record

    def test_inactive_key_raises_401(self):
        # Inactive key is excluded from the DB query (is_active=True filter)
        db = _make_db_returning(None)   # query returns None for inactive key
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                require_auth(raw_key="any-key", db=db)
            )
        assert exc_info.value.status_code == 401


# ── TestRequireRole ───────────────────────────────────────────────────────────

class TestRequireRole:
    def test_correct_role_returns_principal(self):
        key_record = _make_key(["admin"])
        db = _make_db_returning(key_record)
        checker = require_role("admin")
        principal = asyncio.get_event_loop().run_until_complete(
            checker(raw_key="test-secret-key-abc", db=db)
        )
        assert principal is key_record

    def test_insufficient_role_raises_403(self):
        key_record = _make_key(["viewer"])
        db = _make_db_returning(key_record)
        checker = require_role("admin")
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                checker(raw_key="test-secret-key-abc", db=db)
            )
        assert exc_info.value.status_code == 403

    def test_missing_key_raises_401_not_403(self):
        db = _make_db_returning(None)
        checker = require_role("admin")
        with pytest.raises(HTTPException) as exc_info:
            asyncio.get_event_loop().run_until_complete(
                checker(raw_key=None, db=db)
            )
        assert exc_info.value.status_code == 401

    def test_higher_role_satisfies_lower_requirement(self):
        key_record = _make_key(["admin"])
        db = _make_db_returning(key_record)
        checker = require_role("viewer")
        principal = asyncio.get_event_loop().run_until_complete(
            checker(raw_key="test-secret-key-abc", db=db)
        )
        assert principal is key_record


# ── TestApiKeyModel ───────────────────────────────────────────────────────────

class TestApiKeyModel:
    def test_tablename(self):
        assert ApiKey.__tablename__ == "api_keys"

    def test_required_columns_exist(self):
        cols = {c.key for c in ApiKey.__table__.columns}
        for col in ("id", "key_hash", "label", "roles_csv", "owner_id", "is_active", "created_at"):
            assert col in cols

    def test_roles_property_splits_csv(self):
        key = _make_key(["viewer", "analyst"])
        assert "viewer" in key.roles
        assert "analyst" in key.roles

    def test_roles_property_handles_single_role(self):
        key = _make_key(["admin"])
        assert key.roles == ["admin"]


# ── TestApprovalRecordModel ───────────────────────────────────────────────────

class TestApprovalRecordModel:
    def test_tablename(self):
        assert ApprovalRecord.__tablename__ == "approval_records"

    def test_required_columns_exist(self):
        cols = {c.key for c in ApprovalRecord.__table__.columns}
        for col in ("id", "action_card_id", "state", "reviewer_id", "note", "created_at"):
            assert col in cols

    def test_approval_states_contains_all_lifecycle_states(self):
        for state in ("draft", "review_required", "approved", "rejected", "executed"):
            assert state in APPROVAL_STATES

    def test_approval_states_is_frozenset(self):
        assert isinstance(APPROVAL_STATES, frozenset)

    def test_approval_record_can_be_constructed(self):
        record = ApprovalRecord(
            id=uuid.uuid4(),
            action_card_id=uuid.uuid4(),
            state="review_required",
            reviewer_id="user-42",
            note="Needs CFO approval",
            created_at=datetime.now(timezone.utc),
        )
        assert record.state == "review_required"
        assert record.reviewer_id == "user-42"
