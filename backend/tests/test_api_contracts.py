"""
API contract and cache freshness tests — Task 7 (Phase 2).

Verifies that every API response includes the trust-boundary metadata fields
added in Phase 0 and Phase 1. These fields are the observable contract that
downstream consumers rely on to know:
  - Was the content AI-generated or rule-based? (generation_mode)
  - Did grounding validation pass? (grounding_status)
  - What evidence snapshot backed this response? (evidence_snapshot_id)
  - Did content-safety guardrails intervene? (content_safety_status)
  - Was the pipeline fully successful? (pipeline_status)

Tests use mocks so they run offline without AWS credentials.
"""

import pytest
from unittest.mock import AsyncMock, MagicMock, patch
from fastapi.testclient import TestClient
from httpx import AsyncClient, ASGITransport


# ── Evidence package contract ─────────────────────────────────────────────────

class TestEvidencePackageContract:
    def test_evidence_package_has_snapshot_id(self):
        from app.core.evidence import build_evidence_package
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.65, risk_level="high",
            exposure_inr=1_000_000.0, days_to_stockout=7, sku_count=5,
        )
        assert hasattr(ev, "snapshot_id")
        assert ev.snapshot_id  # non-empty string

    def test_evidence_package_has_facts_hash(self):
        from app.core.evidence import build_evidence_package
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.65, risk_level="high",
            exposure_inr=1_000_000.0, days_to_stockout=7, sku_count=5,
        )
        assert hasattr(ev, "facts_hash")
        assert len(ev.facts_hash) == 16  # first 16 chars of SHA-256

    def test_evidence_package_has_allowed_amounts(self):
        from app.core.evidence import build_evidence_package
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.65, risk_level="high",
            exposure_inr=1_000_000.0, days_to_stockout=7, sku_count=5,
        )
        assert isinstance(ev.allowed_amounts, frozenset)
        assert len(ev.allowed_amounts) > 0

    def test_evidence_package_has_allowed_entities(self):
        from app.core.evidence import build_evidence_package
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.65, risk_level="high",
            exposure_inr=1_000_000.0, days_to_stockout=7, sku_count=5,
            extra_entities=["Mumbai", "Maharashtra"],
        )
        assert "acme" in ev.allowed_entities  # stored lowercased for case-insensitive matching
        assert "mumbai" in ev.allowed_entities

    def test_evidence_package_has_created_at(self):
        from app.core.evidence import build_evidence_package
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.65, risk_level="high",
            exposure_inr=1_000_000.0, days_to_stockout=7, sku_count=5,
        )
        assert hasattr(ev, "created_at")
        assert ev.created_at


# ── Grounding result contract ─────────────────────────────────────────────────

class TestGroundingResultContract:
    def test_grounding_result_has_passed_field(self):
        from app.core.evidence import build_evidence_package, validate_grounding
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.5, risk_level="medium",
            exposure_inr=500_000.0, days_to_stockout=10, sku_count=2,
        )
        gr = validate_grounding({"text": "No rupee amounts."}, ev)
        assert hasattr(gr, "passed")
        assert isinstance(gr.passed, bool)

    def test_grounding_result_has_violations_field(self):
        from app.core.evidence import build_evidence_package, validate_grounding
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.5, risk_level="medium",
            exposure_inr=500_000.0, days_to_stockout=10, sku_count=2,
        )
        gr = validate_grounding({"text": "No rupee amounts."}, ev)
        assert hasattr(gr, "violations")
        assert isinstance(gr.violations, list)

    def test_grounding_result_status_is_one_of_three_values(self):
        from app.core.evidence import build_evidence_package, validate_grounding
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.5, risk_level="medium",
            exposure_inr=500_000.0, days_to_stockout=10, sku_count=2,
        )
        gr = validate_grounding({"text": "No rupee amounts."}, ev)
        assert gr.grounding_status in {"grounded", "violation", "skipped"}

    def test_grounding_passed_implies_empty_violations(self):
        from app.core.evidence import build_evidence_package, validate_grounding
        ev = build_evidence_package(
            supplier_id="s1", supplier_name="Acme",
            risk_score=0.5, risk_level="medium",
            exposure_inr=500_000.0, days_to_stockout=10, sku_count=2,
        )
        gr = validate_grounding({"text": "No rupee amounts."}, ev)
        if gr.passed:
            assert gr.violations == []


# ── Procurement agent response contract ──────────────────────────────────────

class TestProcurementAgentResponseContract:
    @pytest.mark.asyncio
    async def test_fallback_action_card_has_required_fields(self):
        from app.services.procurement_agent import ProcurementIntelligenceAgent

        agent = ProcurementIntelligenceAgent()

        with patch("app.services.procurement_agent.bedrock") as mock_bedrock:
            mock_bedrock.is_available = False

            result = await agent.generate_action_card(
                supplier_name="Acme Supplies",
                city="Mumbai",
                state="Maharashtra",
                risk_score=0.75,
                risk_level="high",
                exposure_inr=1_000_000.0,
                days_to_stockout=5,
                sku_count=10,
                disruption_context="Flood disruption",
                cascade_context="3 downstream SKUs affected",
                action_type="reorder",
            )

        # Trust-boundary metadata fields
        assert "generation_mode" in result
        assert "grounding_status" in result
        assert "evidence_snapshot_id" in result

        assert result["generation_mode"] == "deterministic_fallback"
        assert result["grounding_status"] == "grounded"

    @pytest.mark.asyncio
    async def test_fallback_action_card_has_no_numerical_hallucinations(self):
        """Deterministic fallback must not contain AI-fabricated percentages."""
        from app.services.procurement_agent import ProcurementIntelligenceAgent

        agent = ProcurementIntelligenceAgent()

        with patch("app.services.procurement_agent.bedrock") as mock_bedrock:
            mock_bedrock.is_available = False

            result = await agent.generate_action_card(
                supplier_name="Acme",
                city="Pune",
                state="Maharashtra",
                risk_score=0.8,
                risk_level="critical",
                exposure_inr=2_000_000.0,
                days_to_stockout=2,
                sku_count=5,
                disruption_context="Strike",
                cascade_context="None",
                action_type="switch_supplier",
            )

        # The fallback should not contain any "× 0.15" or similar arithmetic
        combined = " ".join(str(v) for v in result.values())
        assert "× 0.15" not in combined
        assert "* 0.15" not in combined

    @pytest.mark.asyncio
    async def test_fallback_executive_brief_has_required_fields(self):
        from app.services.procurement_agent import ProcurementIntelligenceAgent

        agent = ProcurementIntelligenceAgent()

        with patch("app.services.procurement_agent.bedrock") as mock_bedrock:
            mock_bedrock.is_available = False

            result = await agent.generate_executive_brief(
                at_risk_count=3,
                total_exposure=5_000_000.0,
                critical_stockouts=2,
                high_stockouts=4,
                active_disruptions=1,
                cascade_count=0,
                top_suppliers=["Acme", "Beta Corp"],
            )

        assert "generation_mode" in result
        assert "grounding_status" in result
        assert result["grounding_status"] == "grounded"
        assert "summary" in result
        assert "top_risks" in result
        assert "immediate_actions" in result


# ── Strands agent pipeline metadata ─────────────────────────────────────────

class TestStrandsPipelineMetadata:
    @pytest.mark.asyncio
    async def test_successful_pipeline_has_pipeline_status_success(self):
        from app.agents.strands_agents import SupervisorAgent

        with patch("app.agents.strands_agents.validate_with_guardrail") as mock_g, \
             patch.object(SupervisorAgent, "__init__", lambda self, db: None):

            agent = SupervisorAgent.__new__(SupervisorAgent)
            agent.db = AsyncMock()
            agent.signal_agent = AsyncMock()
            agent.signal_agent.analyze = AsyncMock(return_value={
                "event_type": "logistics",
                "severity": "high",
                "confidence": 0.85,
                "affected_region": "Maharashtra",
                "estimated_duration_days": 5,
                "affected_supplier_ids": ["s1"],
                "requires_human_review": False,
            })
            agent.risk_agent = AsyncMock()
            agent.risk_agent.assess = AsyncMock(return_value={
                "overall_score": 0.75, "risk_level": "high",
                "confidence": 0.8, "cascade_affected": 2,
            })
            agent.action_agent = AsyncMock()
            agent.action_agent.recommend = AsyncMock(return_value={
                "title": "T", "description": "D", "reasoning": "R",
                "urgency_narrative": "U", "recommended_action": "A",
                "action_type": "reorder",
            })
            mock_g.return_value = (
                {"title": "T", "description": "D", "reasoning": "R",
                 "urgency_narrative": "U", "recommended_action": "A"},
                False,
            )

            with patch("app.agents.strands_agents.event_bus") as mock_bus:
                mock_bus.publish = AsyncMock()
                result = await agent.process_disruption_event({
                    "supplier_id": "s1", "supplier_name": "Test",
                    "severity": "high", "disruption_type": "logistics",
                    "region": "Maharashtra", "city": "Mumbai",
                    "state": "Maharashtra", "estimated_impact_inr": 500000,
                    "days_to_stockout": 5, "sku_count": 3,
                })

        assert "pipeline_status" in result
        assert result["pipeline_status"] == "success"

    @pytest.mark.asyncio
    async def test_pipeline_has_content_safety_fields(self):
        from app.agents.strands_agents import SupervisorAgent

        with patch("app.agents.strands_agents.validate_with_guardrail") as mock_g, \
             patch.object(SupervisorAgent, "__init__", lambda self, db: None):

            agent = SupervisorAgent.__new__(SupervisorAgent)
            agent.db = AsyncMock()
            agent.signal_agent = AsyncMock()
            agent.signal_agent.analyze = AsyncMock(return_value={
                "event_type": "logistics", "severity": "high", "confidence": 0.85,
                "affected_region": "Maharashtra", "estimated_duration_days": 5,
                "affected_supplier_ids": [], "requires_human_review": False,
            })
            agent.risk_agent = AsyncMock()
            agent.risk_agent.assess = AsyncMock(return_value={
                "overall_score": 0.6, "risk_level": "high",
                "confidence": 0.8, "cascade_affected": 1,
            })
            agent.action_agent = AsyncMock()
            agent.action_agent.recommend = AsyncMock(return_value={
                "title": "T", "description": "D", "reasoning": "R",
                "urgency_narrative": "U", "recommended_action": "A",
                "action_type": "reorder",
            })
            mock_g.return_value = (
                {"title": "T", "description": "D", "reasoning": "R",
                 "urgency_narrative": "U", "recommended_action": "A"},
                False,
            )

            with patch("app.agents.strands_agents.event_bus") as mock_bus:
                mock_bus.publish = AsyncMock()
                result = await agent.process_disruption_event({
                    "supplier_id": "s1", "supplier_name": "Test",
                    "severity": "high", "disruption_type": "logistics",
                    "region": "Maharashtra", "city": "Mumbai",
                    "state": "Maharashtra", "estimated_impact_inr": 500000,
                    "days_to_stockout": 5, "sku_count": 3,
                })

        # Phase 1 renamed field
        assert "content_safety_intervened" in result
        assert "content_safety_status" in result
        assert result["content_safety_status"] in {"passed", "intervened", "unavailable"}

    @pytest.mark.asyncio
    async def test_pipeline_has_grounding_status(self):
        from app.agents.strands_agents import SupervisorAgent

        with patch("app.agents.strands_agents.validate_with_guardrail") as mock_g, \
             patch.object(SupervisorAgent, "__init__", lambda self, db: None):

            agent = SupervisorAgent.__new__(SupervisorAgent)
            agent.db = AsyncMock()
            agent.signal_agent = AsyncMock()
            agent.signal_agent.analyze = AsyncMock(return_value={
                "event_type": "logistics", "severity": "high", "confidence": 0.85,
                "affected_region": "Maharashtra", "estimated_duration_days": 5,
                "affected_supplier_ids": [], "requires_human_review": False,
            })
            agent.risk_agent = AsyncMock()
            agent.risk_agent.assess = AsyncMock(return_value={
                "overall_score": 0.6, "risk_level": "high",
                "confidence": 0.8, "cascade_affected": 1,
            })
            agent.action_agent = AsyncMock()
            agent.action_agent.recommend = AsyncMock(return_value={
                "title": "T", "description": "D", "reasoning": "R",
                "urgency_narrative": "U", "recommended_action": "A",
                "action_type": "reorder",
            })
            mock_g.return_value = (
                {"title": "T", "description": "D", "reasoning": "R",
                 "urgency_narrative": "U", "recommended_action": "A"},
                False,
            )

            with patch("app.agents.strands_agents.event_bus") as mock_bus:
                mock_bus.publish = AsyncMock()
                result = await agent.process_disruption_event({
                    "supplier_id": "s1", "supplier_name": "Test",
                    "severity": "high", "disruption_type": "logistics",
                    "region": "Maharashtra", "city": "Mumbai",
                    "state": "Maharashtra", "estimated_impact_inr": 500000,
                    "days_to_stockout": 5, "sku_count": 3,
                })

        assert "grounding_status" in result
        assert result["grounding_status"] in {"grounded", "violation", "skipped"}


# ── AI contract schema ────────────────────────────────────────────────────────

class TestAIContractSchema:
    def test_action_narrative_extra_forbid(self):
        """Pydantic model must reject extra fields (extra='forbid')."""
        from pydantic import ValidationError
        from app.schemas.ai_contracts import ActionNarrative
        with pytest.raises(ValidationError) as exc_info:
            ActionNarrative(
                title="T", executive_summary="E", reasoning="R",
                urgency_narrative="U", cost_of_delay_narrative="C",
                recommended_action="A", escalation_window="48h",
                alternate_supplier_rationale="",
                forbidden_extra_field="should be rejected",
            )
        assert "extra" in str(exc_info.value).lower() or "forbidden" in str(exc_info.value).lower() or "unexpected" in str(exc_info.value).lower()

    def test_all_ai_contract_models_importable(self):
        from app.schemas.ai_contracts import (
            ActionNarrative,
            ExecutiveBriefNarrative,
            AlternateSupplierNarrative,
            SignalClassification,
            RiskNarrative,
            ActionProposalNarrative,
        )
        assert ActionNarrative is not None
        assert ExecutiveBriefNarrative is not None
        assert AlternateSupplierNarrative is not None
        assert SignalClassification is not None
        assert RiskNarrative is not None
        assert ActionProposalNarrative is not None

    def test_signal_classification_severity_constrained(self):
        from pydantic import ValidationError
        from app.schemas.ai_contracts import SignalClassification
        with pytest.raises(ValidationError):
            SignalClassification(
                event_type="flood",
                severity="apocalyptic",  # not in allowed literals
                confidence=0.8,
            )

    def test_signal_classification_confidence_clamped(self):
        from pydantic import ValidationError
        from app.schemas.ai_contracts import SignalClassification
        with pytest.raises(ValidationError):
            SignalClassification(
                event_type="flood",
                severity="high",
                confidence=1.5,  # above 1.0
            )
