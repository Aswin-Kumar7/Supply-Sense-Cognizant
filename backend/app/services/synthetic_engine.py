"""
Synthetic Disruption Engine for SupplySense.
"""
from __future__ import annotations

import asyncio
import random
from datetime import datetime

from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.logging import logger
from app.core.database import AsyncSessionLocal

# Deterministic seed for repeatable demo sequences
_rng = random.Random(42)

# FMCG-focused supply chain context (mirrors the seeded dataset)
SUPPLIER_NAMES = [
    "Vikas Home Care Ltd", "Dakshin Foods Corporation",
    "Ganga Agri Products", "Saurashtra Naturals Pvt Ltd",
    "Arya Consumer Brands", "Malabar Ayur Essentials", "Narmada Dairy & Beverages",
    "Konkan Flexi Pack", "Vapi Oleochem Industries", "Coimbatore Carton Works",
    "Telangana Spice Growers", "Howrah Paper & Board", "Amritsar Grain Exchange",
    "Baroda Container Corp", "Kannur Coconut Collective",
    "Sonipat Laminate Pack", "Jorhat Tea & Coffee Estate",
]

CITIES = [
    "Mumbai", "Chennai", "Kolkata", "Ahmedabad", "New Delhi",
    "Kochi", "Indore", "Pune", "Bangalore", "Coimbatore",
    "Howrah", "Vadodara", "Kannur", "Sonipat", "Jorhat",
]

SKU_NAMES = [
    "Liquid Detergent 1L", "Dishwash Bar 200g", "Floor Cleaner 500ml",
    "Idli-Dosa Batter 1kg", "Sambar Masala 200g", "Coconut Chutney Powder 150g",
    "Gobindobhog Rice 5kg", "Cold-Pressed Mustard Oil 1L", "Whole Wheat Atta 10kg",
    "Virgin Coconut Oil 500ml", "Amla Hair Oil 200ml", "Neem Face Wash 100ml",
    "Masala Chai 250g", "Cream Biscuit 12-pack", "Roasted Cashew 200g",
    "Kumkumadi Face Serum 30ml", "Dashamoola Body Oil 200ml",
    "Flavoured Lassi 6-pack", "Paneer Block 200g", "Mango Drink 1L",
]

REGIONS = ["North", "South", "East", "West", "Central", "Northeast"]

# Event generation templates with weighted probabilities
EVENT_GENERATORS = [
    {
        "weight": 15,
        "type": "delivery_update",
        "severity_weights": {"low": 50, "medium": 30, "high": 15, "critical": 5},
        "templates": [
            "Shipment from {supplier} arrived at {city} warehouse",
            "Delivery #{ref} cleared customs at {city} port",
            "Partial delivery received from {supplier} - {pct}% fulfilled",
            "Express shipment dispatched from {city} hub",
            "Delivery delay: {supplier} shipment rerouted via {city}",
        ],
    },
    {
        "weight": 12,
        "type": "inventory_update",
        "severity_weights": {"low": 30, "medium": 40, "high": 20, "critical": 10},
        "templates": [
            "{sku} stock level dropped below reorder point",
            "Safety stock breach: {sku} at {pct}% capacity",
            "Inventory velocity spike detected for {sku}",
            "Warehouse {city}: {sku} replenishment scheduled",
            "Stock transfer initiated: {sku} from {city} to {city2}",
        ],
    },
    {
        "weight": 8,
        "type": "disruption_alert",
        "severity_weights": {"low": 10, "medium": 30, "high": 40, "critical": 20},
        "templates": [
            "Cyclone warning issued for {region} coastal belt",
            "Transport union announces strike on {city}-{city2} corridor",
            "Heavy rainfall disrupting logistics in {region} region",
            "Port congestion alert: {city} container terminal at capacity",
            "Road blockage reported on NH connecting {city} and {city2}",
        ],
    },
    {
        "weight": 10,
        "type": "supplier_risk",
        "severity_weights": {"low": 20, "medium": 35, "high": 30, "critical": 15},
        "templates": [
            "{supplier} reliability score degraded to {score}%",
            "Quality audit flag raised for {supplier}",
            "{supplier} lead time increased by {days} days",
            "Payment dispute with {supplier} - shipments on hold",
            "Capacity constraint reported by {supplier}",
        ],
    },
    {
        "weight": 6,
        "type": "demand_spike",
        "severity_weights": {"low": 20, "medium": 40, "high": 30, "critical": 10},
        "templates": [
            "Festival demand surge: {sku} orders up {pct}%",
            "Seasonal spike detected in {region} for {sku}",
            "Flash sale impact: {sku} demand exceeding forecast",
            "Regional promotion driving {pct}% increase in {sku}",
        ],
    },
    {
        "weight": 5,
        "type": "action_generated",
        "severity_weights": {"low": 15, "medium": 35, "high": 35, "critical": 15},
        "templates": [
            "Action: Switch to alternate supplier for {sku}",
            "Action: Emergency reorder {sku} from {supplier}",
            "Action: Increase safety stock for {sku} pre-festival",
            "Action: Expedite pending shipment from {supplier}",
            "Action: Activate backup logistics route via {city}",
        ],
    },
]


def _weighted_choice(weights: dict) -> str:
    """Select from weighted options."""
    items = list(weights.keys())
    probs = list(weights.values())
    return _rng.choices(items, weights=probs, k=1)[0]


def _generate_event() -> SupplyChainEvent:
    """Generate a single synthetic supply chain event."""
    weights = [g["weight"] for g in EVENT_GENERATORS]
    generator = _rng.choices(EVENT_GENERATORS, weights=weights, k=1)[0]

    severity = _weighted_choice(generator["severity_weights"])

    template = _rng.choice(generator["templates"])
    supplier = _rng.choice(SUPPLIER_NAMES)
    city     = _rng.choice(CITIES)
    city2    = _rng.choice([c for c in CITIES if c != city])
    sku      = _rng.choice(SKU_NAMES)
    region   = _rng.choice(REGIONS)

    message = template.format(
        supplier=supplier,
        city=city,
        city2=city2,
        sku=sku,
        region=region,
        pct=_rng.randint(15, 85),
        score=_rng.randint(55, 82),
        days=_rng.randint(2, 7),
        ref=_rng.randint(10000, 99999),
    )

    # Build contextual data payload
    data = {
        "supplier": supplier,
        "city": city,
        "region": region,
        "sku": sku,
    }

    return SupplyChainEvent(
        event_type=generator["type"],
        severity=severity,
        message=message,
        data=data,
    )

class SyntheticEngine:
    """
    Background task that continuously generates supply chain events.
    
    Lifecycle:
    - Started on application startup
    - Runs indefinitely, publishing events at configurable intervals
    - Stopped gracefully on application shutdown
    """

    def __init__(self):
        self._task: asyncio.Task | None = None
        self._running: bool = False
        self._interval_range: tuple[float, float] = (2.0, 6.0)  # seconds between events
        self._scenario_active: str | None = None

    async def start(self):
        """Start the synthetic event generation loop."""
        if self._running:
            return
        self._running = True
        self._task = asyncio.create_task(self._run_loop())
        logger.info("Synthetic engine started")

    async def stop(self):
        """Gracefully stop the engine."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        logger.info("Synthetic engine stopped")

    async def _run_loop(self):
        """Main event generation loop."""
        while self._running:
            try:
                # Generate and publish event
                event = _generate_event()

                # If a scenario is active, bias toward scenario-relevant events
                if self._scenario_active:
                    event = self._apply_scenario_bias(event)

                await event_bus.publish(event)

                # For critical disruption_alert events, run the full Strands
                # supervisor pipeline so risk scores and action cards update in
                # real time — not just cosmetic SSE noise.
                if event.severity == "critical" and event.event_type == "disruption_alert":
                    asyncio.create_task(self._trigger_supervisor(event))

                # Record metric
                try:
                    from app.core.metrics import metrics_store
                    metrics_store.increment_synthetic_events()
                except Exception:
                    pass

                interval = _rng.uniform(*self._interval_range)
                await asyncio.sleep(interval)

            except asyncio.CancelledError:
                break
            except Exception as e:
                logger.error(f"Synthetic engine error: {e}")
                await asyncio.sleep(5)

    async def _trigger_supervisor(self, event: SupplyChainEvent):
        """Run the full Strands supervisor pipeline for a critical synthetic event."""
        try:
            from sqlalchemy import select
            from app.models.supplier import Supplier
            from app.agents.strands_agents import SupervisorAgent
            async with AsyncSessionLocal() as db:
                # Resolve the synthetic event's supplier NAME to a real row. Without
                # a real supplier_id the Risk + Prescriptive stages skip themselves,
                # so the live pipeline did almost nothing — this makes it run fully
                # on real data (real city/state/region too, not random ones).
                supplier_name = event.data.get("supplier", "")
                supplier = None
                if supplier_name:
                    supplier = (await db.execute(
                        select(Supplier).where(Supplier.name == supplier_name)
                    )).scalar_one_or_none()

                supervisor = SupervisorAgent(db)
                disruption_event = {
                    "supplier_id": str(supplier.id) if supplier else "",
                    "supplier_name": supplier.name if supplier else (supplier_name or "Unknown Supplier"),
                    "severity": event.severity,
                    "disruption_type": event.event_type,
                    "region": supplier.region if supplier else event.data.get("region", ""),
                    "city": supplier.city if supplier else event.data.get("city", ""),
                    "state": supplier.state if supplier else "",
                    "estimated_impact_inr": 0,
                    "days_to_stockout": 7,
                    "sku_count": 1,
                    "description": event.message,
                }
                await supervisor.process_disruption_event(disruption_event)
        except Exception as exc:
            logger.warning(f"Supervisor pipeline failed for synthetic critical event: {exc}")

    def set_interval(self, min_seconds: float, max_seconds: float):
        """Adjust event generation frequency (for demo acceleration)."""
        self._interval_range = (min_seconds, max_seconds)

    # Router keys → engine keys (keeps the API contract stable without renaming SCENARIO_CONFIGS)
    _SCENARIO_ALIASES: dict[str, str] = {
        "strike_maharashtra": "strike_north",
        "flood_kolkata": "flood_east",
    }

    def activate_scenario(self, scenario_name: str):
        """Bias event generation toward a specific scenario."""
        resolved = self._SCENARIO_ALIASES.get(scenario_name, scenario_name)
        self._scenario_active = resolved
        self._interval_range = (1.0, 3.0)
        logger.info(f"Scenario activated: {scenario_name} (resolved → {resolved})")

    def deactivate_scenario(self):
        """Return to normal event generation."""
        self._scenario_active = None
        self._interval_range = (2.0, 6.0)
        logger.info("Scenario deactivated, returning to normal")

    def _apply_scenario_bias(self, event: SupplyChainEvent) -> SupplyChainEvent:
        """Modify events to align with active scenario context."""
        scenario_context = SCENARIO_CONFIGS.get(self._scenario_active, {})
        if not scenario_context:
            return event

        if _rng.random() < 0.6:
            return SupplyChainEvent(
                event_type=_rng.choice(scenario_context.get("event_types", ["disruption_alert"])),
                severity=_rng.choice(scenario_context.get("severities", ["high"])),
                message=_rng.choice(scenario_context.get("messages", [event.message])),
                data={
                    "scenario": self._scenario_active,
                    "region": scenario_context.get("region", ""),
                    "supplier": _rng.choice(scenario_context.get("suppliers", SUPPLIER_NAMES[:3])),
                },
            )
        return event


# Scenario configurations for biased event generation
SCENARIO_CONFIGS = {
    "cyclone_chennai": {
        "region": "South",
        "event_types": ["disruption_alert", "supplier_risk", "delivery_update"],
        "severities": ["critical", "high", "high"],
        "suppliers": ["Dakshin Foods Corporation", "Coimbatore Carton Works", "Telangana Spice Growers"],
        "messages": [
            "Cyclone Michaung: Chennai port operations suspended — Dakshin Foods affected",
            "South coastal logistics corridor disrupted — 48hr delay expected",
            "Dakshin Foods Corporation: warehouse flooding reported in Guindy, Chennai",
            "Emergency rerouting: South India FMCG shipments via Bangalore hub",
            "Idli-Dosa Batter & Sambar Masala supply impacted — 7-day delay",
            "Insurance claim initiated for Chennai warehouse water damage",
            "Alternate route activated: Bangalore Processed Foods stepping in",
        ],
    },
    "strike_north": {
        "region": "North",
        "event_types": ["disruption_alert", "delivery_update", "action_generated"],
        "severities": ["critical", "high", "medium"],
        "suppliers": ["Arya Consumer Brands", "Sonipat Laminate Pack", "Amritsar Grain Exchange"],
        "messages": [
            "NH-44 strike: Arya Consumer Brands dispatch completely blocked",
            "Transport union indefinite strike declared on Delhi–Chandigarh corridor",
            "Cream Biscuit & Masala Chai deliveries halted — 8-day delay expected",
            "Emergency rail freight arranged via Northern Railway Parcel Express",
            "Amritsar Grain Exchange: road access disrupted by truckers' strike",
            "Action: Activate alternate supplier Lucknow FMCG Works",
            "Arya Consumer: safety stock at 3-day cover — critical reorder needed",
        ],
    },
    "flood_east": {
        "region": "East",
        "event_types": ["disruption_alert", "inventory_update", "supplier_risk"],
        "severities": ["critical", "high", "high"],
        "suppliers": ["Ganga Agri Products", "Howrah Paper & Board"],
        "messages": [
            "Severe flooding: Kolkata warehouse district — Ganga Agri operations halted",
            "Eastern rail network suspended due to waterlogging in Hooghly",
            "Gobindobhog Rice & Atta supply chain disrupted — 72-hour hold",
            "Howrah Paper & Board: corrugation unit flooded, packaging supply halted",
            "Emergency inventory redistribution from Cuttack Agro Traders",
            "Ganga Agri: critical stock at 3-day cover for Cold-Pressed Mustard Oil",
        ],
    },
    "diwali_surge": {
        "region": "All India",
        "event_types": ["demand_spike", "inventory_update", "action_generated"],
        "severities": ["medium", "high", "medium"],
        "suppliers": ["Vikas Home Care Ltd", "Dakshin Foods Corporation", "Ganga Agri Products",
                      "Saurashtra Naturals Pvt Ltd", "Arya Consumer Brands"],
        "messages": [
            "Diwali demand surge: FMCG orders up 160% vs baseline",
            "Liquid Detergent 1L: demand exceeding 2.6x forecast — critical reorder",
            "Festival stock pre-positioning: safety stock breach across 6 SKUs",
            "Cream Biscuit 12-pack: emergency reorder triggered by Arya Consumer",
            "Pan-India demand spike: all FMCG categories affected",
            "Warehouse capacity at 94% — overflow routing activated in West region",
            "Festival procurement window closing in 8 days — urgent action required",
        ],
    },
}


# Singleton instance
synthetic_engine = SyntheticEngine()
