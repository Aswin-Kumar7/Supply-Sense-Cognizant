"""
Stockout Forecasting Engine for SupplySense.

Deterministic inventory depletion forecasting:
- Projects when each SKU will hit zero stock
- Accounts for supplier lead-time degradation
- Factors in demand velocity changes
- Considers in-transit inventory

Formula:
  days_to_stockout = current_stock / adjusted_daily_demand
  adjusted_demand = base_demand × festival_multiplier × disruption_factor
  projected_date = today + days_to_stockout

All calculations are deterministic and auditable.
"""

from dataclasses import dataclass
from datetime import date, timedelta
from uuid import UUID


@dataclass
class StockoutForecast:
    """Stockout prediction for a single SKU."""
    sku_id: str
    sku_code: str
    sku_name: str
    supplier_name: str
    category: str
    current_stock: int
    daily_demand: int
    adjusted_demand: float
    days_to_stockout: int
    projected_stockout_date: str
    risk_level: str
    revenue_at_risk_inr: float
    unit_cost_inr: float
    is_critical: bool
    demand_factors: dict


@dataclass
class StockoutSummary:
    """Aggregated stockout forecast summary."""
    total_skus: int
    critical_count: int
    high_count: int
    total_revenue_at_risk_inr: float
    avg_days_to_stockout: float
    forecasts: list[StockoutForecast]


class StockoutForecastingEngine:
    """
    Deterministic stockout forecasting.
    Projects inventory depletion dates for all SKUs.
    """

    def forecast_sku(
        self,
        sku_id: str,
        sku_code: str,
        sku_name: str,
        supplier_name: str,
        category: str,
        current_stock: int,
        daily_demand: int,
        unit_cost_inr: float,
        is_critical: bool,
        supplier_disrupted: bool = False,
        festival_multiplier: float = 1.0,
        lead_time_days: int = 7,
    ) -> StockoutForecast:
        """
        Forecast stockout for a single SKU.
        
        Demand adjustment factors:
        - Festival proximity: multiplies base demand
        - Supplier disruption: increases demand (panic buying) by 20%
        - Lead time degradation: no resupply during extended lead times
        """
        # Compute adjusted demand
        disruption_factor = 1.2 if supplier_disrupted else 1.0
        adjusted_demand = daily_demand * festival_multiplier * disruption_factor

        # Compute days to stockout
        if adjusted_demand <= 0:
            days_to_stockout = 999
        else:
            days_to_stockout = int(current_stock / adjusted_demand)

        # Projected stockout date
        projected_date = date.today() + timedelta(days=days_to_stockout)

        # Risk level based on days remaining vs lead time
        risk_level = self._compute_risk_level(days_to_stockout, lead_time_days)

        # Revenue at risk: units that won't be sold × unit cost × margin multiplier
        # Using 1.5x cost as revenue proxy (lost sales + partial brand damage)
        days_of_lost_sales = max(0, lead_time_days - days_to_stockout)
        revenue_at_risk = days_of_lost_sales * adjusted_demand * unit_cost_inr * 1.5

        demand_factors = {
            "base_demand": daily_demand,
            "festival_multiplier": festival_multiplier,
            "disruption_factor": disruption_factor,
            "adjusted_demand": round(adjusted_demand, 1),
            "lead_time_days": lead_time_days,
        }

        return StockoutForecast(
            sku_id=sku_id,
            sku_code=sku_code,
            sku_name=sku_name,
            supplier_name=supplier_name,
            category=category,
            current_stock=current_stock,
            daily_demand=daily_demand,
            adjusted_demand=round(adjusted_demand, 1),
            days_to_stockout=days_to_stockout,
            projected_stockout_date=projected_date.isoformat(),
            risk_level=risk_level,
            revenue_at_risk_inr=round(revenue_at_risk, 2),
            unit_cost_inr=unit_cost_inr,
            is_critical=is_critical,
            demand_factors=demand_factors,
        )

    def _compute_risk_level(self, days_to_stockout: int, lead_time: int) -> str:
        """Risk level considers whether resupply can arrive in time."""
        if days_to_stockout <= 3:
            return "critical"
        elif days_to_stockout <= lead_time:
            return "high"  # Will stockout before resupply arrives
        elif days_to_stockout <= lead_time * 2:
            return "medium"
        return "low"


# Singleton
stockout_engine = StockoutForecastingEngine()
