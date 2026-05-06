"""Tests for the /api/v1/dashboard/overview aggregated endpoint."""

import pytest
from unittest.mock import AsyncMock, patch, MagicMock
from dataclasses import dataclass


@dataclass
class FakeStockoutForecast:
    sku_id: str = "sku-1"
    sku_code: str = "SKU001"
    sku_name: str = "Widget A"
    supplier_name: str = "Supplier X"
    category: str = "Electronics"
    current_stock: int = 100
    daily_demand: float = 10.0
    adjusted_demand: float = 12.0
    days_to_stockout: float = 8.3
    projected_stockout_date: str = "2025-01-15"
    risk_level: str = "high"
    revenue_at_risk_inr: float = 50000.0
    is_critical: bool = False
    demand_factors: dict = None

    def __post_init__(self):
        if self.demand_factors is None:
            self.demand_factors = {"base": 10.0}


@dataclass
class FakeStockoutSummary:
    total_skus: int = 5
    critical_count: int = 1
    high_count: int = 2
    total_revenue_at_risk_inr: float = 150000.0
    avg_days_to_stockout: float = 12.5
    forecasts: list = None

    def __post_init__(self):
        if self.forecasts is None:
            self.forecasts = [FakeStockoutForecast()]


def _make_mocks(fake_brief, fake_suppliers, fake_stockout):
    """Create patched mocks for the overview endpoint dependencies."""
    mock_supplier_service = MagicMock()
    mock_supplier_service.get_all_suppliers = AsyncMock(return_value=fake_suppliers)

    mock_risk_service = MagicMock()
    mock_risk_service.get_stockout_forecasts = AsyncMock(return_value=fake_stockout)

    async def fake_get_or_generate(key, ttl, coro_factory):
        return fake_brief

    return mock_supplier_service, mock_risk_service, fake_get_or_generate


@pytest.mark.asyncio
async def test_overview_endpoint_aggregates_three_sources():
    """The overview endpoint returns executive_brief, suppliers, and stockout keys."""
    from app.routers.dashboard import get_overview

    fake_brief = {"summary": "All good", "risk_level": "low"}
    fake_suppliers = {"suppliers": [{"name": "Supplier A"}], "total": 1}
    fake_stockout = FakeStockoutSummary()

    mock_supplier_svc, mock_risk_svc, fake_get_or_gen = _make_mocks(
        fake_brief, fake_suppliers, fake_stockout
    )

    mock_db = AsyncMock()

    with patch("app.routers.dashboard.SupplierService", return_value=mock_supplier_svc), \
         patch("app.routers.dashboard.RiskIntelligenceService", return_value=mock_risk_svc), \
         patch("app.routers.procurement._get_or_generate", side_effect=fake_get_or_gen), \
         patch("app.routers.procurement.ProcurementService"):

        result = await get_overview(db=mock_db)

    assert "executive_brief" in result
    assert "suppliers" in result
    assert "stockout" in result
    assert result["executive_brief"] == fake_brief
    assert result["suppliers"] == fake_suppliers


@pytest.mark.asyncio
async def test_overview_endpoint_stockout_format():
    """The stockout section is formatted with the expected fields."""
    from app.routers.dashboard import get_overview

    fake_brief = {"summary": "Brief content"}
    fake_suppliers = {"suppliers": [], "total": 0}
    fake_stockout = FakeStockoutSummary()

    mock_supplier_svc, mock_risk_svc, fake_get_or_gen = _make_mocks(
        fake_brief, fake_suppliers, fake_stockout
    )

    mock_db = AsyncMock()

    with patch("app.routers.dashboard.SupplierService", return_value=mock_supplier_svc), \
         patch("app.routers.dashboard.RiskIntelligenceService", return_value=mock_risk_svc), \
         patch("app.routers.procurement._get_or_generate", side_effect=fake_get_or_gen), \
         patch("app.routers.procurement.ProcurementService"):

        result = await get_overview(db=mock_db)

    stockout = result["stockout"]
    assert stockout["total_skus"] == 5
    assert stockout["critical_count"] == 1
    assert stockout["high_count"] == 2
    assert stockout["total_revenue_at_risk_inr"] == 150000.0
    assert stockout["avg_days_to_stockout"] == 12.5
    assert len(stockout["forecasts"]) == 1

    forecast = stockout["forecasts"][0]
    assert forecast["sku_id"] == "sku-1"
    assert forecast["sku_code"] == "SKU001"
    assert forecast["sku_name"] == "Widget A"
    assert forecast["supplier_name"] == "Supplier X"
    assert forecast["category"] == "Electronics"
    assert forecast["current_stock"] == 100
    assert forecast["daily_demand"] == 10.0
    assert forecast["adjusted_demand"] == 12.0
    assert forecast["days_to_stockout"] == 8.3
    assert forecast["risk_level"] == "high"
    assert forecast["revenue_at_risk_inr"] == 50000.0
    assert forecast["is_critical"] is False
    assert forecast["demand_factors"] == {"base": 10.0}


@pytest.mark.asyncio
async def test_overview_endpoint_returns_executive_brief():
    """The executive_brief section passes through the cached brief data."""
    from app.routers.dashboard import get_overview

    fake_brief = {
        "headline": "Supply chain stable",
        "risk_summary": "2 suppliers at elevated risk",
        "recommendations": ["Monitor Supplier X"],
    }
    fake_suppliers = {"suppliers": [], "total": 0}
    fake_stockout = FakeStockoutSummary(forecasts=[])

    mock_supplier_svc, mock_risk_svc, fake_get_or_gen = _make_mocks(
        fake_brief, fake_suppliers, fake_stockout
    )

    mock_db = AsyncMock()

    with patch("app.routers.dashboard.SupplierService", return_value=mock_supplier_svc), \
         patch("app.routers.dashboard.RiskIntelligenceService", return_value=mock_risk_svc), \
         patch("app.routers.procurement._get_or_generate", side_effect=fake_get_or_gen), \
         patch("app.routers.procurement.ProcurementService"):

        result = await get_overview(db=mock_db)

    assert result["executive_brief"] == fake_brief
    assert result["executive_brief"]["headline"] == "Supply chain stable"
    assert result["stockout"]["forecasts"] == []
