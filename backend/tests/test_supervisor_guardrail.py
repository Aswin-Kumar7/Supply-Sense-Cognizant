"""Tests for guardrail integration in the Supervisor Agent pipeline."""

import pytest
from unittest.mock import patch, AsyncMock, MagicMock

from app.agents.strands_agents import SupervisorAgent


@pytest.fixture
def mock_db():
    """Create a mock async database session."""
    return AsyncMock()


@pytest.fixture
def sample_event():
    """Sample disruption event for testing."""
    return {
        "supplier_id": "test-supplier-123",
        "supplier_name": "Acme Supplies",
        "severity": "high",
        "disruption_type": "logistics",
        "region": "Maharashtra",
        "city": "Mumbai",
        "state": "Maharashtra",
        "estimated_impact_inr": 500000,
        "days_to_stockout": 5,
        "sku_count": 3,
    }


@pytest.mark.asyncio
async def test_guardrail_passes_all_fields(mock_db, sample_event):
    """When guardrail allows all fields, action_card retains AI-generated content."""
    with patch("app.agents.strands_agents.validate_with_guardrail") as mock_guardrail, \
         patch.object(SupervisorAgent, "__init__", lambda self, db: None):

        agent = SupervisorAgent.__new__(SupervisorAgent)
        agent.db = mock_db

        # Mock the sub-agents
        agent.signal_agent = AsyncMock()
        agent.signal_agent.analyze = AsyncMock(return_value={
            "event_type": "logistics",
            "severity": "high",
            "confidence": 0.85,
            "affected_region": "Maharashtra",
            "estimated_duration_days": 5,
            "affected_supplier_ids": ["test-supplier-123"],
            "requires_human_review": False,
        })

        agent.risk_agent = AsyncMock()
        agent.risk_agent.assess = AsyncMock(return_value={
            "overall_score": 0.75,
            "risk_level": "high",
            "confidence": 0.8,
            "cascade_affected": 2,
        })

        agent.action_agent = AsyncMock()
        agent.action_agent.recommend = AsyncMock(return_value={
            "title": "AI Generated Title",
            "description": "AI Generated Description",
            "reasoning": "AI reasoning text",
            "urgency_narrative": "AI urgency text",
            "recommended_action": "AI recommended action",
            "alternate_supplier_rationale": "AI alternate rationale",
            "action_type": "reorder",
        })

        # Guardrail passes all fields through
        mock_guardrail.return_value = (
            {
                "title": "AI Generated Title",
                "description": "AI Generated Description",
                "reasoning": "AI reasoning text",
                "urgency_narrative": "AI urgency text",
                "recommended_action": "AI recommended action",
                "alternate_supplier_rationale": "AI alternate rationale",
            },
            False,  # was_blocked = False
        )

        with patch("app.agents.strands_agents.event_bus") as mock_bus:
            mock_bus.publish = AsyncMock()
            result = await agent.process_disruption_event(sample_event)

        assert result["title"] == "AI Generated Title"
        assert result["description"] == "AI Generated Description"
        assert result["reasoning"] == "AI reasoning text"
        assert result["guardrail_intervened"] is False
        mock_guardrail.assert_called_once()


@pytest.mark.asyncio
async def test_guardrail_blocks_fields_triggers_fallback(mock_db, sample_event):
    """When guardrail blocks fields, they are replaced with rule-based fallback text."""
    with patch("app.agents.strands_agents.validate_with_guardrail") as mock_guardrail, \
         patch.object(SupervisorAgent, "__init__", lambda self, db: None):

        agent = SupervisorAgent.__new__(SupervisorAgent)
        agent.db = mock_db

        agent.signal_agent = AsyncMock()
        agent.signal_agent.analyze = AsyncMock(return_value={
            "event_type": "logistics",
            "severity": "high",
            "confidence": 0.85,
            "affected_region": "Maharashtra",
            "estimated_duration_days": 5,
            "affected_supplier_ids": ["test-supplier-123"],
            "requires_human_review": False,
        })

        agent.risk_agent = AsyncMock()
        agent.risk_agent.assess = AsyncMock(return_value={
            "overall_score": 0.75,
            "risk_level": "high",
            "confidence": 0.8,
            "cascade_affected": 2,
        })

        agent.action_agent = AsyncMock()
        agent.action_agent.recommend = AsyncMock(return_value={
            "title": "Blocked Title",
            "description": "Blocked Description",
            "reasoning": "Blocked reasoning",
            "urgency_narrative": "Blocked urgency",
            "recommended_action": "Blocked action",
            "alternate_supplier_rationale": "Blocked rationale",
            "action_type": "reorder",
        })

        # Guardrail blocks title and reasoning (empty string = blocked)
        mock_guardrail.return_value = (
            {
                "title": "",  # blocked
                "description": "Blocked Description",  # not blocked (kept)
                "reasoning": "",  # blocked
                "urgency_narrative": "Blocked urgency",  # not blocked
                "recommended_action": "",  # blocked
                "alternate_supplier_rationale": "",  # blocked
            },
            True,  # was_blocked = True
        )

        with patch("app.agents.strands_agents.event_bus") as mock_bus:
            mock_bus.publish = AsyncMock()
            result = await agent.process_disruption_event(sample_event)

        # Blocked fields should have rule-based fallback text
        assert result["title"] == "Alert: Acme Supplies — logistics disruption"
        assert result["description"] == "Blocked Description"  # not blocked, kept as-is
        assert result["reasoning"] == "Automated alert based on logistics signal."
        assert result["urgency_narrative"] == "Blocked urgency"  # not blocked
        assert result["recommended_action"] == "Review supplier status and initiate contingency plan."
        assert result["alternate_supplier_rationale"] == ""
        assert result["guardrail_intervened"] is True


@pytest.mark.asyncio
async def test_guardrail_exception_fails_open(mock_db, sample_event):
    """When guardrail validation raises an exception, pipeline continues without guardrail."""
    with patch("app.agents.strands_agents.validate_with_guardrail") as mock_guardrail, \
         patch.object(SupervisorAgent, "__init__", lambda self, db: None):

        agent = SupervisorAgent.__new__(SupervisorAgent)
        agent.db = mock_db

        agent.signal_agent = AsyncMock()
        agent.signal_agent.analyze = AsyncMock(return_value={
            "event_type": "weather",
            "severity": "critical",
            "confidence": 0.9,
            "affected_region": "Tamil Nadu",
            "estimated_duration_days": 3,
            "affected_supplier_ids": [],
            "requires_human_review": False,
        })

        agent.risk_agent = AsyncMock()
        agent.risk_agent.assess = AsyncMock(return_value={
            "overall_score": 0.9,
            "risk_level": "critical",
            "confidence": 0.85,
            "cascade_affected": 5,
        })

        agent.action_agent = AsyncMock()
        agent.action_agent.recommend = AsyncMock(return_value={
            "title": "Original Title",
            "description": "Original Description",
            "reasoning": "Original reasoning",
            "urgency_narrative": "Original urgency",
            "recommended_action": "Original action",
            "action_type": "switch_supplier",
        })

        # Guardrail raises an exception
        mock_guardrail.side_effect = RuntimeError("Guardrail service unavailable")

        with patch("app.agents.strands_agents.event_bus") as mock_bus:
            mock_bus.publish = AsyncMock()
            result = await agent.process_disruption_event(sample_event)

        # Original AI-generated content should be preserved (fail-open)
        assert result["title"] == "Original Title"
        assert result["description"] == "Original Description"
        assert result["guardrail_intervened"] is False


@pytest.mark.asyncio
async def test_guardrail_validates_correct_fields(mock_db, sample_event):
    """Verify that the correct text fields are passed to validate_with_guardrail."""
    with patch("app.agents.strands_agents.validate_with_guardrail") as mock_guardrail, \
         patch.object(SupervisorAgent, "__init__", lambda self, db: None):

        agent = SupervisorAgent.__new__(SupervisorAgent)
        agent.db = mock_db

        agent.signal_agent = AsyncMock()
        agent.signal_agent.analyze = AsyncMock(return_value={
            "event_type": "geopolitical",
            "severity": "medium",
            "confidence": 0.7,
            "affected_region": "Gujarat",
            "estimated_duration_days": 10,
            "affected_supplier_ids": [],
            "requires_human_review": False,
        })

        agent.risk_agent = AsyncMock()
        agent.risk_agent.assess = AsyncMock(return_value={
            "overall_score": 0.6,
            "risk_level": "medium",
            "confidence": 0.7,
            "cascade_affected": 1,
        })

        agent.action_agent = AsyncMock()
        agent.action_agent.recommend = AsyncMock(return_value={
            "title": "Test Title",
            "description": "Test Description",
            "reasoning": "Test Reasoning",
            "urgency_narrative": "Test Urgency",
            "recommended_action": "Test Action",
            "alternate_supplier_rationale": "Test Rationale",
            "action_type": "reorder",
        })

        # Capture what's passed to guardrail
        mock_guardrail.return_value = (
            {
                "title": "Test Title",
                "description": "Test Description",
                "reasoning": "Test Reasoning",
                "urgency_narrative": "Test Urgency",
                "recommended_action": "Test Action",
                "alternate_supplier_rationale": "Test Rationale",
            },
            False,
        )

        with patch("app.agents.strands_agents.event_bus") as mock_bus:
            mock_bus.publish = AsyncMock()
            await agent.process_disruption_event(sample_event)

        # Verify the fields passed to guardrail
        call_args = mock_guardrail.call_args[0][0]
        assert "title" in call_args
        assert "description" in call_args
        assert "reasoning" in call_args
        assert "urgency_narrative" in call_args
        assert "recommended_action" in call_args
        assert "alternate_supplier_rationale" in call_args
