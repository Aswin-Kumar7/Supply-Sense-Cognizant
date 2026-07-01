"""
Minimal, scenario-varied seeder for SupplySense — 10 suppliers total.

Design goal: every primary's mitigation plan should recommend a DIFFERENT best
action, instead of "switch_supplier" winning everywhere. We achieve that by
engineering each primary's situation (disruption type, days of stock cover,
demand spike, and — critically — the cost/lead/quality of its alternates) so the
scenario-sensitive financial engine + AI pick a different headline each time:

  Dakshin (Chennai)  · cyclone, site down, CHEAP/FAST alternates   → switch_supplier
  Vikas   (Pune)     · festival demand surge, EXPENSIVE alternates → increase_stock
  Narmada (Indore)   · healthy, minor delay, SLOW/PRICEY alternates→ reorder
  Arya    (Delhi)    · 2-day cover, very SLOW alternates           → expedite
  Malabar (Kochi)    · FSSAI quality hold, low reliability         → substitute_sku

Structure (5 primaries + 5 alternates = 10 suppliers; 2-3 alternates per primary):
  alternates pool: Bangalore, Nashik, Mysore, Lucknow, Cuttack (shared).

Run:  python -m seeders.seed_min10     (from backend/)
WARNING: drops and recreates the public schema — destroys existing data.
"""

import asyncio
import uuid
import random
from datetime import date, datetime, timedelta

from sqlalchemy import text as sa_text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import get_settings

settings = get_settings()
DATABASE_URL = settings.database_url

rng = random.Random(42)
today = date.today()


def _id(n: int) -> uuid.UUID:
    return uuid.UUID(f"00000000-0000-0000-0000-{str(n).zfill(12)}")


def _sku_id(n: int) -> uuid.UUID:
    return uuid.UUID(f"10000000-0000-0000-0000-{str(n).zfill(12)}")


# ── Suppliers ────────────────────────────────────────────────────────────────
# idx 0-4 primaries (tier 1), idx 5-9 alternates (tier 2)
SUPPLIERS = [
    # PRIMARIES
    {"id": _id(1), "name": "Dakshin Foods Corporation", "city": "Chennai", "state": "Tamil Nadu",
     "region": "South", "category": "FMCG", "tier": 1, "reliability_score": 0.74, "lead_time_days": 8,
     "risk_zone": "cyclone", "latitude": 13.0827, "longitude": 80.2707},
    {"id": _id(2), "name": "Vikas Home Care Ltd", "city": "Pune", "state": "Maharashtra",
     "region": "West", "category": "FMCG", "tier": 1, "reliability_score": 0.78, "lead_time_days": 7,
     "risk_zone": None, "latitude": 18.5204, "longitude": 73.8567},
    {"id": _id(3), "name": "Narmada Dairy & Beverages", "city": "Indore", "state": "Madhya Pradesh",
     "region": "Central", "category": "FMCG", "tier": 1, "reliability_score": 0.88, "lead_time_days": 6,
     "risk_zone": None, "latitude": 22.7196, "longitude": 75.8577},
    {"id": _id(4), "name": "Arya Consumer Brands", "city": "New Delhi", "state": "Delhi",
     "region": "North", "category": "FMCG", "tier": 1, "reliability_score": 0.70, "lead_time_days": 12,
     "risk_zone": "labor", "latitude": 28.6139, "longitude": 77.2090},
    {"id": _id(5), "name": "Malabar Ayur Essentials", "city": "Kochi", "state": "Kerala",
     "region": "South", "category": "FMCG", "tier": 1, "reliability_score": 0.52, "lead_time_days": 9,
     "risk_zone": "quality", "latitude": 9.9312, "longitude": 76.2673},
    # ALTERNATES (tier 2)
    {"id": _id(6), "name": "Bangalore Processed Foods", "city": "Bengaluru", "state": "Karnataka",
     "region": "South", "category": "FMCG", "tier": 2, "reliability_score": 0.90, "lead_time_days": 6,
     "risk_zone": None, "latitude": 12.9716, "longitude": 77.5946},
    {"id": _id(7), "name": "Nashik Naturals Pvt Ltd", "city": "Nashik", "state": "Maharashtra",
     "region": "West", "category": "FMCG", "tier": 2, "reliability_score": 0.85, "lead_time_days": 8,
     "risk_zone": None, "latitude": 19.9975, "longitude": 73.7898},
    {"id": _id(8), "name": "Mysore Health & Wellness", "city": "Mysuru", "state": "Karnataka",
     "region": "South", "category": "FMCG", "tier": 2, "reliability_score": 0.84, "lead_time_days": 9,
     "risk_zone": None, "latitude": 12.2958, "longitude": 76.6394},
    {"id": _id(9), "name": "Lucknow Consumer Co", "city": "Lucknow", "state": "Uttar Pradesh",
     "region": "North", "category": "FMCG", "tier": 2, "reliability_score": 0.80, "lead_time_days": 14,
     "risk_zone": None, "latitude": 26.8467, "longitude": 80.9462},
    {"id": _id(10), "name": "Cuttack Foods Pvt Ltd", "city": "Cuttack", "state": "Odisha",
     "region": "East", "category": "FMCG", "tier": 2, "reliability_score": 0.76, "lead_time_days": 16,
     "risk_zone": None, "latitude": 20.4625, "longitude": 85.8830},
]

PRIMARIES = SUPPLIERS[:5]
ALT_BANGALORE, ALT_NASHIK, ALT_MYSORE, ALT_LUCKNOW, ALT_CUTTACK = (_id(6), _id(7), _id(8), _id(9), _id(10))

# ── SKUs ── 2 per primary (10 total). cover_days controls days-to-stockout. ──
# (primary_idx, code, name, cat, subcat, unit_cost, daily_demand, cover_days)
SKU_DEFS = [
    # Dakshin — SWITCH scenario, ~8 days cover (cheap fast alternate beats the gap)
    (0, "DK-IDLI-1K", "Idli-Dosa Batter 1kg", "Packaged Foods", "Batter", 95.0, 140, 8.0),
    (0, "DK-SAMB-200", "Sambar Masala 200g", "Packaged Foods", "Spices", 120.0, 90, 8.5),
    # Vikas — INCREASE_STOCK scenario, moderate ~12 days cover + festival surge
    (1, "VK-DET-1L", "Liquid Detergent 1L", "Home Care", "Cleaning", 110.0, 160, 12.0),
    (1, "VK-DISH-500", "Dishwash Gel 500ml", "Home Care", "Cleaning", 75.0, 120, 12.5),
    # Narmada — REORDER scenario, ~9 days cover, healthy
    (2, "NR-MILK-1L", "Toned Milk 1L", "Dairy", "Milk", 56.0, 200, 9.0),
    (2, "NR-GHEE-500", "Cow Ghee 500ml", "Dairy", "Ghee", 320.0, 70, 9.5),
    # Arya — EXPEDITE scenario, ~2 days cover (imminent)
    (3, "AR-TEA-250", "Premium Tea 250g", "Beverages", "Tea", 145.0, 110, 2.0),
    (3, "AR-BISC-300", "Marie Biscuit 300g", "Packaged Foods", "Biscuits", 45.0, 130, 2.5),
    # Malabar — SUBSTITUTE scenario, deep ~12 days cover, quality hold
    (4, "ML-SERUM-30", "Kumkumadi Face Serum 30ml", "Personal Care", "Ayurveda", 480.0, 60, 12.0),
    (4, "ML-OIL-200", "Dashamoola Body Oil 200ml", "Personal Care", "Ayurveda", 260.0, 80, 12.5),
]

# ── Alternate mappings ── 2-3 per primary; economics steer the winning action ──
# primary_idx -> list of (alt_supplier_id, cost_premium_pct, lead_time_days, quality_score)
ALT_MAP = {
    # Dakshin: cheap, fast, high quality → switch_supplier is the clear winner
    0: [(ALT_BANGALORE, 7.0, 6, 0.90), (ALT_NASHIK, 9.0, 8, 0.85), (ALT_MYSORE, 10.0, 9, 0.84)],
    # Vikas: all alternates expensive → switch is unattractive; festival surge favors stock
    1: [(ALT_NASHIK, 28.0, 11, 0.82), (ALT_LUCKNOW, 32.0, 15, 0.80), (ALT_CUTTACK, 35.0, 17, 0.76)],
    # Narmada: pricey AND slow (lead >> 9d cover) → switch eroded; healthy → reorder wins
    2: [(ALT_LUCKNOW, 28.0, 20, 0.80), (ALT_CUTTACK, 33.0, 22, 0.78)],
    # Arya: very slow alternates (18-20d vs 2d cover) → switch can't arrive → expedite bridges
    3: [(ALT_MYSORE, 18.0, 18, 0.83), (ALT_LUCKNOW, 28.0, 20, 0.80)],
    # Malabar: expensive + low quality; low reliability drops reorder → substitute_sku wins
    4: [(ALT_MYSORE, 22.0, 14, 0.74), (ALT_CUTTACK, 34.0, 18, 0.72)],
}

# ── Active disruptions ── type chosen to drive supplier_operational + scenario ──
# primary_idx -> (type, severity, title, description, impact_score)
DISRUPTIONS = {
    0: ("cyclone", "critical", "Cyclone Michaung — Chennai port closure",
        "Severe cyclone has shut Chennai port and coastal logistics; Dakshin's site dispatch is halted.", 0.92),
    1: ("demand_surge", "high", "Ganesh Chaturthi pre-festival demand surge",
        "Festival demand across West India is spiking home-care offtake well above normal.", 0.6),
    2: ("inventory_drawdown", "medium", "Inventory drawn below reorder point",
        "Stock has fallen below the reorder point while Narmada is healthy and dispatching normally — nothing "
        "is stuck in transit; a straightforward replenishment order from the primary supplier is what is needed.", 0.45),
    3: ("transit_delay", "high", "Northern freight backlog — in-pipeline orders stuck",
        "A freight backlog has stranded Arya's already-placed, in-transit orders with only days of cover left; "
        "the goods exist and are moving — they just need to be rushed.", 0.78),
    4: ("quality_hold", "high", "FSSAI audit hold on Kumkumadi batch",
        "FSSAI has placed THIS serum batch on quality hold, so the exact SKU cannot be dispatched by anyone — "
        "but a compatible, already-approved substitute SKU is in stock. The plant is otherwise operational.", 0.7),
}

# ── Festival calendar ── West+FMCG window so ONLY Vikas (West) sees the surge ──
FESTIVALS = [
    {"name": "Ganesh Chaturthi Pre-Stock (West)", "start": today + timedelta(days=4),
     "end": today + timedelta(days=24), "region": "West", "multiplier": 1.6, "categories": "FMCG"},
    # A far-future South window (>30d) so it does NOT affect current demand calc
    {"name": "Onam Sadhya Window (South)", "start": today + timedelta(days=70),
     "end": today + timedelta(days=90), "region": "South", "multiplier": 1.4, "categories": "FMCG"},
]


async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    from app.core.database import Base
    from app.models.supplier import Supplier
    from app.models.supplier_dependency import SupplierDependency
    from app.models.sku import SKU, AlternateSupplier
    from app.models.delivery import DeliveryRecord
    from app.models.disruption import Disruption
    from app.models.festival import FestivalCalendar

    async with engine.begin() as conn:
        await conn.execute(sa_text("DROP SCHEMA public CASCADE"))
        await conn.execute(sa_text("CREATE SCHEMA public"))
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        # [1] Suppliers
        print(f"[1/6] {len(SUPPLIERS)} suppliers (5 primaries + 5 alternates)...")
        for s in SUPPLIERS:
            session.add(Supplier(**s))
        await session.commit()

        # [2] Tier-1 → Tier-2 dependencies (each primary depends on 2 sub-suppliers)
        print("[2/6] dependencies...")
        dep_pool = [ALT_BANGALORE, ALT_NASHIK, ALT_MYSORE, ALT_LUCKNOW, ALT_CUTTACK]
        for i, p in enumerate(PRIMARIES):
            for j, dep_id in enumerate([dep_pool[i], dep_pool[(i + 1) % 5]]):
                session.add(SupplierDependency(
                    id=uuid.uuid4(), supplier_id=p["id"], depends_on_id=dep_id,
                    dependency_type="raw_material" if j == 0 else "packaging",
                    criticality=round(0.7 + 0.05 * j, 2),
                ))
        await session.commit()

        # [3] SKUs (cover_days → current_stock)
        print(f"[3/6] {len(SKU_DEFS)} SKUs...")
        sku_ids: list[uuid.UUID] = []
        sku_primary: list[int] = []
        for n, (pidx, code, name, cat, subcat, cost, demand, cover) in enumerate(SKU_DEFS, start=1):
            sid = _sku_id(n)
            sku_ids.append(sid)
            sku_primary.append(pidx)
            session.add(SKU(
                id=sid, sku_code=code, name=name, category=cat, subcategory=subcat,
                supplier_id=PRIMARIES[pidx]["id"], unit_cost_inr=cost,
                current_stock=int(demand * cover), reorder_point=demand * 5,
                safety_stock=demand * 3, daily_demand_avg=demand,
                is_critical=(demand > 100 or cost > 200),
            ))
        await session.commit()

        # [4] 90-day delivery history (delay profile follows reliability)
        print("[4/6] 90-day delivery history...")
        for day_offset in range(90):
            ddate = today - timedelta(days=day_offset)
            for _ in range(rng.randint(3, 6)):
                pidx = rng.randrange(len(PRIMARIES))
                p = PRIMARIES[pidx]
                rel = p["reliability_score"]
                # lower reliability → heavier delay tail
                if rel >= 0.85:
                    delay = rng.choices([0, 1, 2, 3, 5], weights=[60, 22, 10, 5, 3])[0]
                elif rel >= 0.72:
                    delay = rng.choices([0, 1, 2, 3, 5, 8], weights=[40, 22, 18, 12, 5, 3])[0]
                else:
                    delay = rng.choices([0, 1, 2, 3, 5, 8], weights=[22, 18, 22, 20, 12, 6])[0]
                # pick one of this primary's SKUs
                cand = [sku_ids[k] for k in range(len(sku_ids)) if sku_primary[k] == pidx]
                sku_id = rng.choice(cand)
                lead = p["lead_time_days"]
                qty = rng.randint(50, 300)
                delivered = qty if delay < 3 else int(qty * rng.uniform(0.70, 0.95))
                status = "delivered" if delay == 0 else ("delayed" if delay <= 3 else "partial")
                penalty = delay * rng.uniform(500, 2000) if delay > 2 else 0.0
                session.add(DeliveryRecord(
                    id=uuid.uuid4(), supplier_id=p["id"], sku_id=sku_id,
                    order_date=ddate - timedelta(days=lead + rng.randint(-1, 2)),
                    expected_date=ddate, actual_date=ddate + timedelta(days=delay),
                    quantity_ordered=qty, quantity_delivered=delivered,
                    delay_days=delay, status=status, sla_penalty_inr=round(penalty, 2),
                ))
        await session.commit()

        # [5] Active disruptions (one per primary)
        print(f"[5/6] {len(DISRUPTIONS)} active disruptions...")
        for pidx, (dtype, sev, title, desc, impact) in DISRUPTIONS.items():
            p = PRIMARIES[pidx]
            session.add(Disruption(
                id=uuid.uuid4(), supplier_id=p["id"], disruption_type=dtype, severity=sev,
                title=title, description=desc,
                start_date=today - timedelta(days=3), end_date=today + timedelta(days=12),
                impact_score=impact, affected_skus_count=2, region=p["region"], is_active=True,
            ))
        await session.commit()

        # [6] Alternates + festivals
        print("[6/6] alternate mappings + festivals...")
        for k, sid in enumerate(sku_ids):
            pidx = sku_primary[k]
            for alt_id, prem, lead, qual in ALT_MAP[pidx]:
                session.add(AlternateSupplier(
                    id=uuid.uuid4(), sku_id=sid, supplier_id=alt_id,
                    cost_premium_pct=prem, lead_time_days=lead, quality_score=qual,
                ))
        for f in FESTIVALS:
            session.add(FestivalCalendar(
                id=uuid.uuid4(), name=f["name"], start_date=f["start"], end_date=f["end"],
                region=f["region"], demand_multiplier=f["multiplier"],
                affected_categories=f["categories"], procurement_lead_days=14,
            ))
        await session.commit()

    await engine.dispose()
    print("\n=== Seeded 10 suppliers (5 primaries + 5 alternates) ===")
    print("  Dakshin→switch · Vikas→increase_stock · Narmada→reorder · Arya→expedite · Malabar→substitute")


if __name__ == "__main__":
    asyncio.run(seed())
