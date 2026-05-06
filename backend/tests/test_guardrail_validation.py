"""Tests for the validate_with_guardrail utility function."""

import pytest
from unittest.mock import patch, MagicMock, AsyncMock

from app.core.bedrock import validate_with_guardrail


@pytest.mark.asyncio
async def test_passthrough_when_guardrail_not_configured():
    """When bedrock_guardrail_id is not set, fields pass through unchanged."""
    text_fields = {"title": "Test Title", "summary": "Test Summary"}

    with patch("app.core.bedrock.settings") as mock_settings:
        mock_settings.bedrock_guardrail_id = None
        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    assert result_fields == text_fields
    assert was_blocked is False


@pytest.mark.asyncio
async def test_passthrough_when_guardrail_id_empty_string():
    """When bedrock_guardrail_id is empty string, fields pass through unchanged."""
    text_fields = {"title": "Test Title"}

    with patch("app.core.bedrock.settings") as mock_settings:
        mock_settings.bedrock_guardrail_id = ""
        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    assert result_fields == text_fields
    assert was_blocked is False


@pytest.mark.asyncio
async def test_passthrough_when_client_not_available():
    """When Bedrock client is None, fields pass through unchanged."""
    text_fields = {"title": "Test Title"}

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_bedrock._client = None
        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    assert result_fields == text_fields
    assert was_blocked is False


@pytest.mark.asyncio
async def test_fields_pass_when_guardrail_allows():
    """When guardrail allows all fields, they pass through unchanged."""
    text_fields = {"title": "Safe Title", "summary": "Safe Summary"}

    mock_client = MagicMock()
    mock_client.apply_guardrail.return_value = {"action": "NONE"}

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_settings.bedrock_guardrail_version = "DRAFT"
        mock_bedrock._client = mock_client

        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    assert result_fields == text_fields
    assert was_blocked is False
    assert mock_client.apply_guardrail.call_count == 2


@pytest.mark.asyncio
async def test_blocked_field_replaced_with_empty_string():
    """When guardrail blocks a field, it is replaced with empty string."""
    text_fields = {"title": "Bad Content", "summary": "Safe Summary"}

    mock_client = MagicMock()
    # First call blocks, second allows
    mock_client.apply_guardrail.side_effect = [
        {"action": "GUARDRAIL_INTERVENED"},
        {"action": "NONE"},
    ]

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_settings.bedrock_guardrail_version = "DRAFT"
        mock_bedrock._client = mock_client

        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    assert result_fields["title"] == ""
    assert result_fields["summary"] == "Safe Summary"
    assert was_blocked is True


@pytest.mark.asyncio
async def test_multiple_fields_blocked():
    """When multiple fields are blocked, all are replaced."""
    text_fields = {
        "title": "Bad Title",
        "summary": "Bad Summary",
        "reasoning": "Safe Reasoning",
    }

    mock_client = MagicMock()
    mock_client.apply_guardrail.side_effect = [
        {"action": "GUARDRAIL_INTERVENED"},
        {"action": "GUARDRAIL_INTERVENED"},
        {"action": "NONE"},
    ]

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_settings.bedrock_guardrail_version = "DRAFT"
        mock_bedrock._client = mock_client

        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    assert result_fields["title"] == ""
    assert result_fields["summary"] == ""
    assert result_fields["reasoning"] == "Safe Reasoning"
    assert was_blocked is True


@pytest.mark.asyncio
async def test_empty_fields_skipped():
    """Empty or None field values are skipped without calling the API."""
    text_fields = {"title": "Valid Title", "summary": "", "notes": None}

    mock_client = MagicMock()
    mock_client.apply_guardrail.return_value = {"action": "NONE"}

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_settings.bedrock_guardrail_version = "DRAFT"
        mock_bedrock._client = mock_client

        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    # Only "title" should trigger an API call (summary is empty, notes is None)
    assert mock_client.apply_guardrail.call_count == 1
    assert was_blocked is False


@pytest.mark.asyncio
async def test_api_exception_fails_open():
    """When the API call raises an exception, the field passes through (fail-open)."""
    text_fields = {"title": "Some Title", "summary": "Some Summary"}

    mock_client = MagicMock()
    mock_client.apply_guardrail.side_effect = Exception("Network error")

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_settings.bedrock_guardrail_version = "DRAFT"
        mock_bedrock._client = mock_client

        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    # Fields should pass through unchanged on error
    assert result_fields == text_fields
    assert was_blocked is False


@pytest.mark.asyncio
async def test_correct_api_parameters():
    """Verify the correct parameters are passed to apply_guardrail."""
    text_fields = {"title": "My Title"}

    mock_client = MagicMock()
    mock_client.apply_guardrail.return_value = {"action": "NONE"}

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "my-guardrail-123"
        mock_settings.bedrock_guardrail_version = "1"
        mock_bedrock._client = mock_client

        await validate_with_guardrail(text_fields)

    mock_client.apply_guardrail.assert_called_once_with(
        guardrailIdentifier="my-guardrail-123",
        guardrailVersion="1",
        source="OUTPUT",
        content=[{"text": {"text": "My Title"}}],
    )


@pytest.mark.asyncio
async def test_original_dict_not_mutated():
    """The original text_fields dict should not be mutated."""
    text_fields = {"title": "Bad Content"}

    mock_client = MagicMock()
    mock_client.apply_guardrail.return_value = {"action": "GUARDRAIL_INTERVENED"}

    with patch("app.core.bedrock.settings") as mock_settings, \
         patch("app.core.bedrock.bedrock") as mock_bedrock:
        mock_settings.bedrock_guardrail_id = "test-guardrail-id"
        mock_settings.bedrock_guardrail_version = "DRAFT"
        mock_bedrock._client = mock_client

        result_fields, was_blocked = await validate_with_guardrail(text_fields)

    # Original should be unchanged
    assert text_fields["title"] == "Bad Content"
    # Result should have the blocked field cleared
    assert result_fields["title"] == ""
    assert was_blocked is True
