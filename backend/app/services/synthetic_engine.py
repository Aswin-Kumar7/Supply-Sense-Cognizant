"""
Synthetic Disruption Engine for SupplySense.

Continuously generates realistic supply chain events:
- Weather disruptions (cyclones, floods)
- Logistics strikes
- Delayed shipments
- Festival demand spikes
- Inventory anomalies
- Supplier reliability degradation

Design:
- Runs as a background asyncio task
- Deterministic seed for repeatable demos
- Configurable event frequency
- Publishes to the central EventBus
- Scenario-aware: can be paused/accelerated
"""

import asyncio
import random
from datetime import datetime

from app.core.event_bus import event_bus, SupplyChainEvent
from app.core.logging import logger

# Deterministic seed for repeatable demo sequences
_rng = random.Random(42)

# FMCG-focused supply chain context (mirrors the seeded dataset)
SUPPLIER_NAMES = [
    "Bharat FMCG Industries", "Sunrise Consumer Products",
    "GreenLeaf Agro Processing", "PureFarm Naturals", "NorthStar Essentials",
    # Tier-2 suppliers also included for realistic SSE messages
    "PackRight Solutions", "Gujarat Oleochemicals", "TN Packaging Corp",
    "Spice Valley Agro", "East Bengal Packaging", "Punjab Grain Traders",
    "Gujarat Container Pvt Ltd", "Kerala Coconut Estates",
    "Rajasthan Print Pack", "Assam Tea Gardens",
]

CITIES = [
    "Mumbai", "Chennai", "Kolkata", "Ahmedabad", "New Delhi",
    "Surat", "Coimbatore", "Hyderabad", "Ludhiana", "Jaipur",
    "Kochi", "Bangalore", "Guwahati", "Nagpur", "Pune",
]

SKU_NAMES = [
    "Premium Detergent 1kg", "Dishwash Liquid 500ml", "Fabric Softener 1L",
    "Antibacterial Hand Wash 250ml", "Instant Noodles 70g Pack",
    "Breakfast Oats 500g", "Tomato Ketchup 500g", "Basmati Rice 5kg",
    "Mustard Oil 1L", "Whole Wheat Atta 10kg", "Turmeric Powder 500g",
    "Coconut Oil 500ml", "Herbal Shampoo 200ml", "Body Lotion 300ml",
    "Cream Biscuit 100g", "Premium Tea 500g", "Instant Coffee 100g",
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

    def set_interval(self, min_seconds: float, max_seconds: float):
        """Adjust event generation frequency (for demo acceleration)."""
        self._interval_range = (min_seconds, max_seconds)

    def activate_scenario(self, scenario_name: str):
        """Bias event generation toward a specific scenario."""
        self._scenario_active = scenario_name
        # Speed up events during active scenario
        self._interval_range = (1.0, 3.0)
        logger.info(f"Scenario activated: {scenario_name}")

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
                event_type=random.choice(scenario_context.get("event_types", ["disruption_alert"])),
                severity=random.choice(scenario_context.get("severities", ["high"])),
                message=random.choice(scenario_context.get("messages", [event.message])),
                data={
                    "scenario": self._scenario_active,
                    "region": scenario_context.get("region", ""),
                    "supplier": random.choice(scenario_context.get("suppliers", SUPPLIER_NAMES[:3])),
                },
            )
        return event


# Scenario configurations for biased event generation
SCENARIO_CONFIGS = {
    "cyclone_chennai": {
        "region": "South",
        "event_types": ["disruption_alert", "supplier_risk", "delivery_update"],
        "severities": ["critical", "high", "high"],
        "suppliers": ["Sunrise Consumer Products", "TN Packaging Corp", "Kerala Coconut Estates"],
        "messages": [
            "Cyclone Michaung: Chennai port operations suspended — Sunrise Consumer affected",
            "South coastal logistics corridor disrupted — 48hr delay expected",
            "Sunrise Consumer Products: warehouse flooding reported in Chennai",
            "Emergency rerouting: South India FMCG shipments via Bangalore hub",
            "Instant Noodles & Breakfast Oats supply impacted — 6-day delay",
            "Insurance claim initiated for Chennai warehouse damage",
            "Alternate route activated: Kochi → Bangalore → Hyderabad hub",
        ],
    },
    "strike_north": {
        "region": "North",
        "event_types": ["disruption_alert", "delivery_update", "action_generated"],
        "severities": ["critical", "high", "medium"],
        "suppliers": ["NorthStar Essentials", "Rajasthan Print Pack", "Punjab Grain Traders"],
        "messages": [
            "NH-44 strike: NorthStar Essentials dispatch completely blocked",
            "Transport union indefinite strike declared on Delhi corridor",
            "Cream Biscuit & Tea deliveries halted — 8-day delay expected",
            "Emergency rail freight arranged via Northern Railway",
            "Punjab Grain Traders: road access disrupted by strike",
            "Action: Activate alternate supplier Capital FMCG Corp",
            "NorthStar: safety stock at 4-day cover — critical reorder needed",
        ],
    },
    "flood_east": {
        "region": "East",
        "event_types": ["disruption_alert", "inventory_update", "supplier_risk"],
        "severities": ["critical", "high", "high"],
        "suppliers": ["GreenLeaf Agro Processing", "East Bengal Packaging"],
        "messages": [
            "Severe flooding: Kolkata warehouse district — GreenLeaf operations halted",
            "Eastern rail network suspended due to waterlogging",
            "Basmati Rice & Atta supply chain disrupted — 72-hour hold",
            "East Bengal Packaging: production halted, no outbound shipments",
            "Emergency inventory redistribution from North region",
            "GreenLeaf Agro: critical stock at 3-day cover for Mustard Oil",
        ],
    },
    "diwali_surge": {
        "region": "All India",
        "event_types": ["demand_spike", "inventory_update", "action_generated"],
        "severities": ["medium", "high", "medium"],
        "suppliers": ["Bharat FMCG Industries", "Sunrise Consumer Products", "GreenLeaf Agro Processing",
                      "PureFarm Naturals", "NorthStar Essentials"],
        "messages": [
            "Diwali demand surge: FMCG orders up 180% vs baseline",
            "Premium Detergent 1kg: demand exceeding 3x forecast — critical reorder",
            "Festival stock pre-positioning: safety stock breach across 6 SKUs",
            "Cream Biscuit 100g: emergency reorder triggered by NorthStar",
            "Pan-India demand spike: all FMCG categories affected",
            "Warehouse capacity at 94% — overflow routing activated in West region",
            "Festival procurement window closing in 5 days — urgent action required",
        ],
    },
}


# Singleton instance
synthetic_engine = SyntheticEngine()
