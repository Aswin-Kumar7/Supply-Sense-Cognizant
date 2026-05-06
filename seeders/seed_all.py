"""
Master seeder script for SupplySense.
Generates all synthetic data deterministically.
Run: python -m seeders.seed_all
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from seeders.seed_suppliers import SUPPLIERS, SUPPLIER_IDS

# Use direct connection for seeding (not through Docker network)
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://supplysense:supplysense_dev_2024@localhost:5432/supplysense",
)

# Deterministic random seed
random.seed(42)

# SKU data templates
SKU_TEMPLATES = [
    # FMCG
    {"name": "Premium Detergent 1kg", "category": "FMCG", "subcategory": "Home Care", "cost": 185.0, "demand": 45},
    {"name": "Instant Noodles Pack", "category": "FMCG", "subcategory": "Food", "cost": 42.0, "demand": 120},
    {"name": "Coconut Oil 500ml", "category": "FMCG", "subcategory": "Personal Care", "cost": 125.0, "demand": 60},
    {"name": "Biscuit Variety Pack", "category": "FMCG", "subcategory": "Food", "cost": 55.0, "demand": 90},
    {"name": "Floor Cleaner 1L", "category": "FMCG", "subcategory": "Home Care", "cost": 98.0, "demand": 35},
    {"name": "Toothpaste 200g", "category": "FMCG", "subcategory": "Personal Care", "cost": 72.0, "demand": 80},
    # Pharma
    {"name": "Paracetamol 500mg Strip", "category": "Pharma", "subcategory": "OTC", "cost": 28.0, "demand": 200},
    {"name": "Vitamin D3 Capsules", "category": "Pharma", "subcategory": "Supplements", "cost": 320.0, "demand": 40},
    {"name": "Antiseptic Liquid 100ml", "category": "Pharma", "subcategory": "First Aid", "cost": 65.0, "demand": 55},
    {"name": "Cough Syrup 100ml", "category": "Pharma", "subcategory": "OTC", "cost": 85.0, "demand": 70},
    # Agri-processing
    {"name": "Basmati Rice 5kg", "category": "Agri-processing", "subcategory": "Grains", "cost": 450.0, "demand": 30},
    {"name": "Turmeric Powder 500g", "category": "Agri-processing", "subcategory": "Spices", "cost": 180.0, "demand": 25},
    {"name": "Refined Sunflower Oil 1L", "category": "Agri-processing", "subcategory": "Oils", "cost": 165.0, "demand": 50},
    {"name": "Green Tea 100 bags", "category": "Agri-processing", "subcategory": "Beverages", "cost": 220.0, "demand": 35},
    # Auto-components
    {"name": "Brake Pad Set", "category": "Auto-components", "subcategory": "Braking", "cost": 1200.0, "demand": 15},
    {"name": "Oil Filter Universal", "category": "Auto-components", "subcategory": "Filters", "cost": 350.0, "demand": 25},
    {"name": "Spark Plug Set (4)", "category": "Auto-components", "subcategory": "Ignition", "cost": 480.0, "demand": 20},
    {"name": "Wiper Blade Pair", "category": "Auto-components", "subcategory": "Accessories", "cost": 550.0, "demand": 18},
]

DISRUPTION_TEMPLATES = [
    {"type": "cyclone", "severity": "critical", "title": "Cyclone Michaung impact on coastal logistics", "region": "South"},
    {"type": "strike", "severity": "high", "title": "Transport union strike on NH-44 corridor", "region": "North"},
    {"type": "quality", "severity": "medium", "title": "Quality audit failure - batch recall", "region": "West"},
    {"type": "logistics", "severity": "high", "title": "Port congestion at JNPT Mumbai", "region": "West"},
    {"type": "regulatory", "severity": "medium", "title": "GST compliance delay - shipment hold", "region": "Central"},
    {"type": "cyclone", "severity": "critical", "title": "Cyclone warning - Odisha coast evacuation", "region": "East"},
    {"type": "strike", "severity": "medium", "title": "Warehouse workers strike - Ludhiana hub", "region": "North"},
    {"type": "logistics", "severity": "high", "title": "Rail freight disruption - flooding on tracks", "region": "Northeast"},
]

FESTIVAL_DATA = [
    {"name": "Diwali", "start": "2024-11-01", "end": "2024-11-05", "region": "All India", "multiplier": 2.5, "categories": "FMCG,Agri-processing"},
    {"name": "Navratri", "start": "2024-10-03", "end": "2024-10-12", "region": "West,North", "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Pongal", "start": "2025-01-14", "end": "2025-01-17", "region": "South", "multiplier": 1.6, "categories": "Agri-processing,FMCG"},
    {"name": "Holi", "start": "2025-03-14", "end": "2025-03-15", "region": "North,Central", "multiplier": 1.7, "categories": "FMCG"},
    {"name": "Onam", "start": "2024-09-15", "end": "2024-09-17", "region": "South", "multiplier": 1.5, "categories": "Agri-processing,FMCG"},
    {"name": "Durga Puja", "start": "2024-10-09", "end": "2024-10-13", "region": "East", "multiplier": 2.0, "categories": "FMCG"},
]

ACTION_TEMPLATES = [
    {"type": "reorder", "priority": "high", "title": "Emergency reorder: {sku} stock critical", "impact": 50000},
    {"type": "switch_supplier", "priority": "critical", "title": "Switch supplier for {sku} - primary disrupted", "impact": 120000},
    {"type": "increase_safety_stock", "priority": "medium", "title": "Increase safety stock for {sku} pre-festival", "impact": 30000},
    {"type": "expedite", "priority": "high", "title": "Expedite shipment from {supplier} - SLA breach risk", "impact": 75000},
]

async def seed_database():
    """Main seeding function - creates all synthetic data."""
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    # Import models to ensure metadata is populated
    import sys
    sys.path.insert(0, str(__import__("pathlib").Path(__file__).parent.parent / "backend"))
    from app.core.database import Base
    from app.models.supplier import Supplier
    from app.models.supplier_dependency import SupplierDependency
    from app.models.sku import SKU, AlternateSupplier
    from app.models.delivery import DeliveryRecord
    from app.models.disruption import Disruption
    from app.models.risk import RiskSnapshot
    from app.models.action_card import ActionCard
    from app.models.festival import FestivalCalendar

    # Create tables
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        print("🌱 Seeding suppliers...")
        for s in SUPPLIERS:
            session.add(Supplier(**s))
        await session.commit()

        print("🔗 Seeding supplier dependencies...")
        dependencies = [
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[6], "dependency_type": "raw_material", "criticality": 0.8},
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[4], "dependency_type": "packaging", "criticality": 0.6},
            {"supplier_id": SUPPLIER_IDS[1], "depends_on_id": SUPPLIER_IDS[5], "dependency_type": "raw_material", "criticality": 0.9},
            {"supplier_id": SUPPLIER_IDS[3], "depends_on_id": SUPPLIER_IDS[8], "dependency_type": "raw_material", "criticality": 0.85},
            {"supplier_id": SUPPLIER_IDS[3], "depends_on_id": SUPPLIER_IDS[12], "dependency_type": "raw_material", "criticality": 0.7},
            {"supplier_id": SUPPLIER_IDS[7], "depends_on_id": SUPPLIER_IDS[2], "dependency_type": "logistics", "criticality": 0.75},
            {"supplier_id": SUPPLIER_IDS[13], "depends_on_id": SUPPLIER_IDS[9], "dependency_type": "packaging", "criticality": 0.5},
            {"supplier_id": SUPPLIER_IDS[14], "depends_on_id": SUPPLIER_IDS[7], "dependency_type": "logistics", "criticality": 0.8},
            {"supplier_id": SUPPLIER_IDS[18], "depends_on_id": SUPPLIER_IDS[14], "dependency_type": "raw_material", "criticality": 0.6},
            {"supplier_id": SUPPLIER_IDS[10], "depends_on_id": SUPPLIER_IDS[5], "dependency_type": "raw_material", "criticality": 0.9},
        ]
        for dep in dependencies:
            session.add(SupplierDependency(id=uuid.uuid4(), **dep))
        await session.commit()

        print("📦 Seeding SKUs...")
        sku_ids = []
        for i, tmpl in enumerate(SKU_TEMPLATES):
            # Assign to a supplier of matching category
            matching = [s for s in SUPPLIERS if s["category"] == tmpl["category"]]
            supplier = matching[i % len(matching)]
            sku_id = uuid.uuid4()
            sku_ids.append(sku_id)
            stock = random.randint(50, 500)
            session.add(SKU(
                id=sku_id,
                sku_code=f"SKU-{tmpl['category'][:3].upper()}-{str(i+1).zfill(3)}",
                name=tmpl["name"],
                category=tmpl["category"],
                subcategory=tmpl["subcategory"],
                supplier_id=supplier["id"],
                unit_cost_inr=tmpl["cost"],
                current_stock=stock,
                reorder_point=tmpl["demand"] * 5,
                safety_stock=tmpl["demand"] * 3,
                daily_demand_avg=tmpl["demand"],
                is_critical=tmpl["demand"] > 60 or tmpl["cost"] > 400,
            ))
        await session.commit()

        print("🚚 Seeding 90-day delivery history...")
        today = date.today()
        for day_offset in range(90):
            delivery_date = today - timedelta(days=day_offset)
            # 3-5 deliveries per day
            for _ in range(random.randint(3, 5)):
                supplier = random.choice(SUPPLIERS)
                sku_id = random.choice(sku_ids)
                lead = supplier["lead_time_days"]
                order_date = delivery_date - timedelta(days=lead + random.randint(-2, 2))
                delay = max(0, random.choices([0, 1, 2, 3, 5, 8], weights=[50, 20, 15, 8, 5, 2])[0])
                qty_ordered = random.randint(50, 300)
                qty_delivered = qty_ordered if delay < 3 else int(qty_ordered * random.uniform(0.7, 0.95))
                status = "delivered" if delay == 0 else ("delayed" if delay <= 3 else "partial")
                penalty = delay * random.uniform(500, 2000) if delay > 2 else 0.0

                session.add(DeliveryRecord(
                    id=uuid.uuid4(),
                    supplier_id=supplier["id"],
                    sku_id=sku_id,
                    order_date=order_date,
                    expected_date=delivery_date,
                    actual_date=delivery_date + timedelta(days=delay),
                    quantity_ordered=qty_ordered,
                    quantity_delivered=qty_delivered,
                    delay_days=delay,
                    status=status,
                    sla_penalty_inr=round(penalty, 2),
                ))
        await session.commit()
        print(f"   ✓ Generated ~{90 * 4} delivery records")

        print("⚠️  Seeding disruptions...")
        for i, tmpl in enumerate(DISRUPTION_TEMPLATES):
            # Assign to suppliers in matching risk zones
            region_suppliers = [s for s in SUPPLIERS if s["region"] == tmpl["region"]]
            supplier = region_suppliers[i % len(region_suppliers)] if region_suppliers else SUPPLIERS[i]
            start = today - timedelta(days=random.randint(5, 60))
            is_active = i < 5  # First 5 are active
            end = None if is_active else start + timedelta(days=random.randint(3, 14))

            session.add(Disruption(
                id=uuid.uuid4(),
                supplier_id=supplier["id"],
                disruption_type=tmpl["type"],
                severity=tmpl["severity"],
                title=tmpl["title"],
                description=f"Synthetic disruption event affecting {supplier['city']} region supply chain.",
                start_date=start,
                end_date=end,
                impact_score=random.uniform(0.4, 0.95),
                affected_skus_count=random.randint(2, 8),
                region=tmpl["region"],
                is_active=is_active,
            ))
        await session.commit()

        print("📊 Seeding risk snapshots...")
        for supplier in SUPPLIERS:
            risk_score = round(1.0 - supplier["reliability_score"] + random.uniform(-0.1, 0.15), 3)
            risk_score = max(0.05, min(0.95, risk_score))
            risk_level = "critical" if risk_score > 0.7 else "high" if risk_score > 0.5 else "medium" if risk_score > 0.3 else "low"
            session.add(RiskSnapshot(
                id=uuid.uuid4(),
                supplier_id=supplier["id"],
                risk_score=risk_score,
                risk_level=risk_level,
                factors=f"reliability:{supplier['reliability_score']},lead_time:{supplier['lead_time_days']},zone:{supplier['risk_zone'] or 'none'}",
                stockout_probability=round(risk_score * random.uniform(0.3, 0.7), 3),
                days_of_stock=random.randint(5, 45),
            ))
        await session.commit()

        print("🎯 Seeding action cards...")
        for i, tmpl in enumerate(ACTION_TEMPLATES * 3):  # 12 action cards
            sku_tmpl = SKU_TEMPLATES[i % len(SKU_TEMPLATES)]
            supplier = SUPPLIERS[i % len(SUPPLIERS)]
            title = tmpl["title"].format(sku=sku_tmpl["name"], supplier=supplier["name"])
            session.add(ActionCard(
                id=uuid.uuid4(),
                title=title,
                description=f"Recommended action based on supply chain risk analysis for {supplier['city']} region.",
                action_type=tmpl["type"],
                priority=tmpl["priority"],
                supplier_id=supplier["id"],
                sku_id=sku_ids[i % len(sku_ids)],
                estimated_impact_inr=tmpl["impact"] * random.uniform(0.8, 1.5),
                is_resolved=i >= 8,  # Last 4 are resolved
            ))
        await session.commit()

        print("🎉 Seeding festival calendar...")
        for fest in FESTIVAL_DATA:
            session.add(FestivalCalendar(
                id=uuid.uuid4(),
                name=fest["name"],
                start_date=date.fromisoformat(fest["start"]),
                end_date=date.fromisoformat(fest["end"]),
                region=fest["region"],
                demand_multiplier=fest["multiplier"],
                affected_categories=fest["categories"],
                procurement_lead_days=14,
            ))
        await session.commit()

    await engine.dispose()
    print("\n✅ SupplySense database seeded successfully!")
    print(f"   • 20 suppliers across India")
    print(f"   • 10 dependency chains")
    print(f"   • {len(SKU_TEMPLATES)} SKUs (FMCG, Pharma, Agri, Auto)")
    print(f"   • ~360 delivery records (90 days)")
    print(f"   • 8 disruption events")
    print(f"   • 20 risk snapshots")
    print(f"   • 12 action cards")
    print(f"   • 6 festival calendar entries")


if __name__ == "__main__":
    asyncio.run(seed_database())
