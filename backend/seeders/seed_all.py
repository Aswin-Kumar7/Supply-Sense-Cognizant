"""
Master seeder for SupplySense — FMCG-focused dataset.

5 Tier-1 FMCG vendors · 10 Tier-2 suppliers · 8 alternate suppliers
18 FMCG SKUs · 10 fixed disruptions · deterministic delivery history

Run: python -m seeders.seed_all
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from seeders.seed_suppliers import SUPPLIERS, SUPPLIER_IDS

import os
from pathlib import Path

# Load .env from the backend directory (parent of seeders/)
_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        # Manual parse as fallback
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://USER:PASSWORD@localhost:5432/supplysense",
)

# ── Deterministic random so every re-seed produces identical data ────────
rng = random.Random(42)

# ── Tier-1 supplier IDs shorthand ───────────────────────────────────────
S_BHARAT   = SUPPLIER_IDS[0]
S_SUNRISE  = SUPPLIER_IDS[1]
S_GREENLEAF= SUPPLIER_IDS[2]
S_PUREFARM = SUPPLIER_IDS[3]
S_NORTHSTAR= SUPPLIER_IDS[4]

# ── Tier-2 supplier IDs shorthand ───────────────────────────────────────
# Each Tier-1 has two Tier-2 deps: packaging + raw_material
T2_PACKRIGHT      = SUPPLIER_IDS[5]   # Bharat FMCG — packaging
T2_GUJARAT_OLEO   = SUPPLIER_IDS[6]   # Bharat FMCG — raw material
T2_TN_PACKAGING   = SUPPLIER_IDS[7]   # Sunrise — packaging
T2_SPICE_VALLEY   = SUPPLIER_IDS[8]   # Sunrise — raw material
T2_EASTBENGAL_PKG = SUPPLIER_IDS[9]   # GreenLeaf — packaging
T2_PUNJAB_GRAIN   = SUPPLIER_IDS[10]  # GreenLeaf — raw material
T2_GUJARAT_CONT   = SUPPLIER_IDS[11]  # PureFarm — packaging
T2_KERALA_COCONUT = SUPPLIER_IDS[12]  # PureFarm — raw material
T2_RAJASTHAN_PRINT= SUPPLIER_IDS[13]  # NorthStar — packaging
T2_ASSAM_TEA      = SUPPLIER_IDS[14]  # NorthStar — raw material

# ── FMCG SKU templates — 3-5 products per Tier-1 vendor ─────────────────
# Each entry carries the Tier-1 supplier index so assignment is explicit.
SKU_TEMPLATES = [
    # Bharat FMCG Industries (IDs[0]) — 4 home-care SKUs
    {"name": "Premium Detergent 1kg",    "supplier_idx": 0, "cost": 185.0, "demand": 120, "code": "BFI-001"},
    {"name": "Dishwash Liquid 500ml",    "supplier_idx": 0, "cost":  75.0, "demand":  90, "code": "BFI-002"},
    {"name": "Fabric Softener 1L",       "supplier_idx": 0, "cost": 145.0, "demand":  60, "code": "BFI-003"},
    {"name": "Antibacterial Hand Wash 250ml","supplier_idx": 0, "cost": 55.0, "demand":  85, "code": "BFI-004"},

    # Sunrise Consumer Products (IDs[1]) — 3 food SKUs
    {"name": "Instant Noodles 70g Pack", "supplier_idx": 1, "cost":  15.0, "demand": 300, "code": "SCP-001"},
    {"name": "Breakfast Oats 500g",      "supplier_idx": 1, "cost": 165.0, "demand":  55, "code": "SCP-002"},
    {"name": "Tomato Ketchup 500g",      "supplier_idx": 1, "cost":  95.0, "demand":  80, "code": "SCP-003"},

    # GreenLeaf Agro Processing (IDs[2]) — 5 agri-FMCG SKUs
    {"name": "Basmati Rice 5kg",         "supplier_idx": 2, "cost": 450.0, "demand":  45, "code": "GLA-001"},
    {"name": "Mustard Oil 1L",           "supplier_idx": 2, "cost": 175.0, "demand":  70, "code": "GLA-002"},
    {"name": "Whole Wheat Atta 10kg",    "supplier_idx": 2, "cost": 380.0, "demand":  65, "code": "GLA-003"},
    {"name": "Turmeric Powder 500g",     "supplier_idx": 2, "cost": 165.0, "demand":  50, "code": "GLA-004"},
    {"name": "Red Chilli Powder 200g",   "supplier_idx": 2, "cost":  85.0, "demand":  55, "code": "GLA-005"},

    # PureFarm Naturals (IDs[3]) — 4 personal-care SKUs
    {"name": "Coconut Oil 500ml",        "supplier_idx": 3, "cost": 195.0, "demand":  75, "code": "PFN-001"},
    {"name": "Herbal Shampoo 200ml",     "supplier_idx": 3, "cost": 125.0, "demand":  65, "code": "PFN-002"},
    {"name": "Body Lotion 300ml",        "supplier_idx": 3, "cost": 175.0, "demand":  50, "code": "PFN-003"},
    {"name": "Natural Face Wash 100ml",  "supplier_idx": 3, "cost": 110.0, "demand":  60, "code": "PFN-004"},

    # NorthStar Essentials (IDs[4]) — 3 food/beverage SKUs
    {"name": "Cream Biscuit 100g",       "supplier_idx": 4, "cost":  20.0, "demand": 250, "code": "NSE-001"},
    {"name": "Premium Tea 500g",         "supplier_idx": 4, "cost": 220.0, "demand":  40, "code": "NSE-002"},
    {"name": "Instant Coffee 100g",      "supplier_idx": 4, "cost": 280.0, "demand":  35, "code": "NSE-003"},
]

# ── 10 fixed disruptions — 7 active, 3 resolved ──────────────────────────
# Dates are relative to today for always-current demo data.
today = date.today()

FIXED_DISRUPTIONS = [
    # 5 CRITICAL
    {
        "supplier_id": S_SUNRISE,
        "disruption_type": "cyclone",
        "severity": "critical",
        "title": "Cyclone Michaung — Chennai coastal route blocked",
        "description": "Category-3 cyclone has disrupted all coastal logistics through Chennai port. Sunrise Consumer Products warehouse partially flooded. All northbound FMCG shipments diverted to Bangalore hub — estimated 6-day delay.",
        "start_date": today - timedelta(days=3),
        "end_date": None,
        "impact_score": 0.91,
        "affected_skus_count": 3,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": S_NORTHSTAR,
        "disruption_type": "strike",
        "severity": "critical",
        "title": "NH-44 transport worker strike — Delhi corridor blocked",
        "description": "All-India Transport Workers Federation declared an indefinite strike on NH-44. NorthStar Essentials' key dispatch route from Delhi is completely blocked. Emergency rail freight is being arranged via Northern Railway but 8-day delay is expected.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.88,
        "affected_skus_count": 3,
        "region": "North",
        "is_active": True,
    },
    {
        "supplier_id": S_BHARAT,
        "disruption_type": "inventory",
        "severity": "critical",
        "title": "Safety stock breach — Premium Detergent 1kg below 7-day cover",
        "description": "Bharat FMCG Industries has reported that Premium Detergent 1kg inventory has fallen below the 7-day safety stock threshold. Festive season demand has spiked 180% while inbound shipments from Gujarat Oleochemicals face a 5-day lead-time extension due to raw material shortage.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.85,
        "affected_skus_count": 2,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": S_GREENLEAF,
        "disruption_type": "flood",
        "severity": "critical",
        "title": "West Bengal flash floods — Kolkata warehouse submerged",
        "description": "Severe monsoon flooding across West Bengal has submerged GreenLeaf Agro Processing's primary warehouse in Kolkata. 40% of Basmati Rice and Mustard Oil stock is at risk of water damage. All outbound shipments suspended until flood waters recede — estimated 7-10 day disruption. NDRF teams deployed.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.93,
        "affected_skus_count": 5,
        "region": "East",
        "is_active": True,
    },
    {
        "supplier_id": S_PUREFARM,
        "disruption_type": "raw_material",
        "severity": "critical",
        "title": "Coconut oil raw material shortage — Kerala harvest failure",
        "description": "Unprecedented drought in Kerala has caused a 60% drop in coconut yield this season. PureFarm Naturals' primary raw material supplier Kerala Coconut Estates has declared force majeure. Coconut Oil 500ml and Herbal Shampoo production halted. Alternative sourcing from Sri Lanka is being explored but adds 15-day lead time.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.89,
        "affected_skus_count": 4,
        "region": "South",
        "is_active": True,
    },
    # 2 MEDIUM (active)
    {
        "supplier_id": S_BHARAT,
        "disruption_type": "logistics",
        "severity": "medium",
        "title": "JNPT port congestion — 3-day container release delay",
        "description": "Jawaharlal Nehru Port Trust is experiencing a severe backlog with an estimated 3-day container release delay. Bharat FMCG's inbound raw material containers are queued. Procurement has begun evaluating inland bonded warehouse transfers.",
        "start_date": today - timedelta(days=5),
        "end_date": None,
        "impact_score": 0.58,
        "affected_skus_count": 4,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": S_BHARAT,
        "disruption_type": "demand_spike",
        "severity": "medium",
        "title": "Diwali season demand surge — FMCG categories up 80%",
        "description": "Pan-India Diwali demand surge is placing extraordinary pressure on all FMCG suppliers. Home care and personal care categories are seeing 80-180% demand increases vs. baseline. Festival procurement window closes in 6 days. Critical reorder needed across 7 SKUs.",
        "start_date": today - timedelta(days=6),
        "end_date": None,
        "impact_score": 0.60,
        "affected_skus_count": 8,
        "region": "All India",
        "is_active": True,
    },
    # ── TIER-2 DISRUPTIONS (active) — these cascade UP to Tier-1 suppliers ──
    # Cascade engine: WHERE depends_on_id = Tier-2 → finds Tier-1 as affected
    {
        "supplier_id": T2_KERALA_COCONUT,
        "disruption_type": "raw_material",
        "severity": "critical",
        "title": "Kerala Coconut Estates — drought harvest failure (Tier-2)",
        "description": "Unprecedented drought across Kerala has caused a 60% drop in coconut yield. Kerala Coconut Estates has declared force majeure on all Q4 commitments. This directly impacts PureFarm Naturals' Coconut Oil 500ml and Herbal Shampoo production lines. Alternative sourcing from Sri Lanka adds 15-day lead time.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.88,
        "affected_skus_count": 4,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": T2_EASTBENGAL_PKG,
        "disruption_type": "flood",
        "severity": "high",
        "title": "East Bengal Packaging — flood disrupts packaging supply (Tier-2)",
        "description": "Severe monsoon flooding in West Bengal has impacted East Bengal Packaging's Kolkata facility. Primary packaging materials for GreenLeaf Agro Processing's Basmati Rice 5kg and Mustard Oil 1L lines are affected. 6-day packaging supply gap expected; GreenLeaf forced to halt bottling operations.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.74,
        "affected_skus_count": 3,
        "region": "East",
        "is_active": True,
    },
    {
        "supplier_id": T2_GUJARAT_OLEO,
        "disruption_type": "logistics",
        "severity": "high",
        "title": "Gujarat Oleochemicals — JNPT port backlog delays raw material (Tier-2)",
        "description": "Gujarat Oleochemicals' inbound oleochemical shipments are stuck at JNPT due to a 4-day port congestion backlog. This delays Bharat FMCG Industries' detergent and dishwash raw material replenishment. Estimated 5-day production impact on BFI-001 and BFI-002 SKU lines.",
        "start_date": today - timedelta(days=3),
        "end_date": None,
        "impact_score": 0.68,
        "affected_skus_count": 2,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": T2_PUNJAB_GRAIN,
        "disruption_type": "strike",
        "severity": "medium",
        "title": "Punjab Grain Traders — NH-44 strike blocks grain dispatch (Tier-2)",
        "description": "The NH-44 transport worker strike has blocked Punjab Grain Traders' grain dispatch routes to GreenLeaf Agro Processing. Wheat Atta 10kg and Basmati Rice supply will be impacted. Punjab Grain is evaluating rail freight as an alternate but adds 3 days to lead time.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.58,
        "affected_skus_count": 2,
        "region": "North",
        "is_active": True,
    },

    # 3 LOW (resolved)
    {
        "supplier_id": S_PUREFARM,
        "disruption_type": "logistics",
        "severity": "low",
        "title": "Customs re-inspection — Coconut Oil 500ml minor delay",
        "description": "Routine FSSAI re-inspection of Coconut Oil 500ml import batch. 2-day clearance delay. Shipment has since cleared and is in transit. No further impact expected.",
        "start_date": today - timedelta(days=14),
        "end_date": today - timedelta(days=12),
        "impact_score": 0.22,
        "affected_skus_count": 1,
        "region": "West",
        "is_active": False,
    },
    {
        "supplier_id": S_GREENLEAF,
        "disruption_type": "quality",
        "severity": "low",
        "title": "Single packaging source — Atta 10kg concentration risk",
        "description": "East Bengal Packaging identified as sole packaging supplier for Whole Wheat Atta 10kg. Concentration risk flagged by procurement team. Alternative packaging vendor onboarding initiated. Risk resolved by dual-sourcing agreement.",
        "start_date": today - timedelta(days=20),
        "end_date": today - timedelta(days=15),
        "impact_score": 0.18,
        "affected_skus_count": 1,
        "region": "East",
        "is_active": False,
    },
    {
        "supplier_id": S_NORTHSTAR,
        "disruption_type": "logistics",
        "severity": "low",
        "title": "Lead time extension — Assam Tea Gardens 5→8 days",
        "description": "Assam Tea Gardens notified NorthStar Essentials of a lead time extension from 5 to 8 days due to seasonal harvest backlog. Premium Tea 500g safety stock buffer is adequate to cover the variance. Order quantities adjusted accordingly.",
        "start_date": today - timedelta(days=18),
        "end_date": today - timedelta(days=10),
        "impact_score": 0.15,
        "affected_skus_count": 1,
        "region": "North",
        "is_active": False,
    },
]

FESTIVAL_DATA = [
    # ── 2025 ──────────────────────────────────────────────────────────
    {"name": "Onam",           "start": "2025-09-05", "end": "2025-09-07", "region": "South",        "multiplier": 1.5, "categories": "FMCG"},
    {"name": "Navratri",       "start": "2025-09-29", "end": "2025-10-07", "region": "West,North",   "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Durga Puja",     "start": "2025-10-01", "end": "2025-10-05", "region": "East",         "multiplier": 2.0, "categories": "FMCG"},
    {"name": "Diwali",         "start": "2025-10-20", "end": "2025-10-24", "region": "All India",    "multiplier": 2.5, "categories": "FMCG"},
    # ── 2026 (early) ──────────────────────────────────────────────────
    {"name": "Pongal",         "start": "2026-01-14", "end": "2026-01-17", "region": "South",        "multiplier": 1.6, "categories": "FMCG"},
    {"name": "Holi",           "start": "2026-03-02", "end": "2026-03-03", "region": "North,Central","multiplier": 1.7, "categories": "FMCG"},
    # ── 2026 (current + upcoming) ─────────────────────────────────────
    {"name": "Eid ul-Adha",    "start": "2026-06-07", "end": "2026-06-09", "region": "All India",    "multiplier": 1.9, "categories": "FMCG"},
    {"name": "Rakshabandhan",  "start": "2026-08-22", "end": "2026-08-23", "region": "North,West",   "multiplier": 1.5, "categories": "FMCG"},
    {"name": "Ganesh Chaturthi","start": "2026-08-26","end": "2026-09-04", "region": "West,South",   "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Onam 2026",      "start": "2026-08-25", "end": "2026-08-27", "region": "South",        "multiplier": 1.5, "categories": "FMCG"},
    {"name": "Navratri 2026",  "start": "2026-10-09", "end": "2026-10-17", "region": "West,North",   "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Dussehra 2026",  "start": "2026-10-17", "end": "2026-10-18", "region": "All India",    "multiplier": 2.0, "categories": "FMCG"},
    {"name": "Diwali 2026",    "start": "2026-11-08", "end": "2026-11-12", "region": "All India",    "multiplier": 2.5, "categories": "FMCG"},
    {"name": "Christmas 2026", "start": "2026-12-24", "end": "2026-12-26", "region": "All India",    "multiplier": 1.4, "categories": "FMCG"},
]

# Fixed action cards for FMCG context
ACTION_CARDS = [
    {"type": "reorder",             "priority": "critical", "supplier_idx": 0, "sku_idx": 0,  "impact": 185000,
     "title": "Emergency reorder: Premium Detergent 1kg — 4 days to stockout",
     "desc":  "Critical inventory breach at Bharat FMCG. Immediate reorder from alternate supplier required."},
    {"type": "switch_supplier",     "priority": "critical", "supplier_idx": 1, "sku_idx": 4,  "impact": 240000,
     "title": "Switch supplier: Instant Noodles — cyclone disrupts primary source",
     "desc":  "Sunrise Consumer Products offline due to Cyclone Michaung. Activate Madras Foods Pvt Ltd."},
    {"type": "expedite",            "priority": "critical", "supplier_idx": 4, "sku_idx": 14, "impact": 112000,
     "title": "Expedite Cream Biscuit 100g — NH-44 strike blocks normal route",
     "desc":  "NorthStar Essentials dispatch blocked. Arrange rail freight via Northern Railway immediately."},
    {"type": "reorder",             "priority": "high",     "supplier_idx": 1, "sku_idx": 5,  "impact":  82500,
     "title": "Reorder Breakfast Oats 500g — stock at 6-day cover",
     "desc":  "Chennai disruption extends lead time. Pre-emptive reorder from Madras Foods Pvt Ltd."},
    {"type": "increase_safety_stock","priority": "high",    "supplier_idx": 0, "sku_idx": 1,  "impact":  65000,
     "title": "Increase safety stock: Dishwash Liquid — Diwali surge incoming",
     "desc":  "Festival demand 80% above baseline. Safety stock buffer insufficient for 10-day festival window."},
    {"type": "reorder",             "priority": "high",     "supplier_idx": 3, "sku_idx": 12, "impact":  97500,
     "title": "Reorder Coconut Oil 500ml — packaging audit hold impacts supply",
     "desc":  "GMP audit hold at Gujarat Container affects PureFarm packaging. 4-day delay on inbound stock."},
    {"type": "switch_supplier",     "priority": "medium",   "supplier_idx": 3, "sku_idx": 13, "impact":  58000,
     "title": "Evaluate alternate for Herbal Shampoo — cost spike +23%",
     "desc":  "Palm oil duty revision raises input cost significantly. Evaluate Western Naturals Ltd alternative."},
    {"type": "increase_safety_stock","priority": "medium",  "supplier_idx": 2, "sku_idx": 7,  "impact":  45000,
     "title": "Pre-position Basmati Rice 5kg — festival demand surge",
     "desc":  "Diwali and Pongal festival demand requires 60-day forward cover. Increase safety stock now."},
    # 4 resolved
    {"type": "expedite",            "priority": "low",      "supplier_idx": 3, "sku_idx": 12, "impact":  22000,
     "title": "Expedite Coconut Oil — customs re-inspection cleared [RESOLVED]",
     "desc":  "Shipment cleared FSSAI inspection. No further action required.", "resolved": True},
    {"type": "reorder",             "priority": "low",      "supplier_idx": 4, "sku_idx": 16, "impact":  18000,
     "title": "Reorder Premium Tea — lead time extension absorbed [RESOLVED]",
     "desc":  "Safety stock buffer covered 8-day lead time extension. Resolved.", "resolved": True},
    {"type": "reorder",             "priority": "medium",   "supplier_idx": 2, "sku_idx": 8,  "impact":  35000,
     "title": "Reorder Mustard Oil — duty revision impact mitigated [RESOLVED]",
     "desc":  "Price renegotiation completed. New rate accepted by GreenLeaf.", "resolved": True},
    {"type": "increase_safety_stock","priority": "low",     "supplier_idx": 2, "sku_idx": 10, "impact":  12000,
     "title": "Safety stock for Atta 10kg — dual-source packaging secured [RESOLVED]",
     "desc":  "East Bengal Packaging concentration risk resolved by second vendor.", "resolved": True},
]


async def seed_database():
    """Drop all tables, recreate, and seed with deterministic FMCG data."""
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    import sys, pathlib
    backend_path = str(pathlib.Path(__file__).parent.parent)
    if backend_path not in sys.path:
        sys.path.insert(0, backend_path)

    from app.core.database import Base
    from app.models.supplier import Supplier
    from app.models.supplier_dependency import SupplierDependency
    from app.models.sku import SKU, AlternateSupplier
    from app.models.delivery import DeliveryRecord
    from app.models.disruption import Disruption
    from app.models.risk import RiskSnapshot
    from app.models.action_card import ActionCard
    from app.models.festival import FestivalCalendar

    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)

    async with session_factory() as session:
        # ── [1/8] Suppliers ─────────────────────────────────────────────
        print("[1/8] Seeding 23 FMCG suppliers...")
        for s in SUPPLIERS:
            session.add(Supplier(**s))
        await session.commit()

        # ── [2/8] Tier-1 → Tier-2 dependencies ─────────────────────────
        print("[2/8] Seeding Tier-1 → Tier-2 dependencies...")
        deps = [
            # Bharat FMCG → PackRight (packaging) + Gujarat Oleochemicals (raw material)
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[5],  "dependency_type": "packaging",    "criticality": 0.75},
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[6],  "dependency_type": "raw_material", "criticality": 0.85},
            # Sunrise Consumer → TN Packaging + Spice Valley Agro
            {"supplier_id": SUPPLIER_IDS[1], "depends_on_id": SUPPLIER_IDS[7],  "dependency_type": "packaging",    "criticality": 0.70},
            {"supplier_id": SUPPLIER_IDS[1], "depends_on_id": SUPPLIER_IDS[8],  "dependency_type": "raw_material", "criticality": 0.90},
            # GreenLeaf Agro → East Bengal Packaging + Punjab Grain Traders
            {"supplier_id": SUPPLIER_IDS[2], "depends_on_id": SUPPLIER_IDS[9],  "dependency_type": "packaging",    "criticality": 0.65},
            {"supplier_id": SUPPLIER_IDS[2], "depends_on_id": SUPPLIER_IDS[10], "dependency_type": "raw_material", "criticality": 0.80},
            # PureFarm Naturals → Gujarat Container + Kerala Coconut Estates
            {"supplier_id": SUPPLIER_IDS[3], "depends_on_id": SUPPLIER_IDS[11], "dependency_type": "packaging",    "criticality": 0.72},
            {"supplier_id": SUPPLIER_IDS[3], "depends_on_id": SUPPLIER_IDS[12], "dependency_type": "raw_material", "criticality": 0.88},
            # NorthStar Essentials → Rajasthan Print Pack + Assam Tea Gardens
            {"supplier_id": SUPPLIER_IDS[4], "depends_on_id": SUPPLIER_IDS[13], "dependency_type": "packaging",    "criticality": 0.68},
            {"supplier_id": SUPPLIER_IDS[4], "depends_on_id": SUPPLIER_IDS[14], "dependency_type": "raw_material", "criticality": 0.82},
        ]
        for dep in deps:
            session.add(SupplierDependency(id=uuid.uuid4(), **dep))
        await session.commit()

        # ── [3/8] FMCG SKUs ─────────────────────────────────────────────
        print("[3/8] Seeding 18 FMCG SKUs...")
        sku_ids: list[uuid.UUID] = []
        # Stock coverage by supplier risk tier (days of cover)
        STOCK_COVER = {
            1: (1.5, 3.5),   # Sunrise — near stockout (critical)
            4: (2.0, 4.0),   # NorthStar — very low stock (critical)
            2: (3.5, 6.5),   # GreenLeaf — below safety stock (high)
            3: (4.0, 7.0),   # PureFarm — below safety stock (high)
            0: (8.0, 16.0),  # Bharat — normal (medium)
        }
        for tmpl in SKU_TEMPLATES:
            supplier_id = SUPPLIER_IDS[tmpl["supplier_idx"]]
            sku_id = uuid.UUID(f"10000000-0000-0000-0000-{str(len(sku_ids)+1).zfill(12)}")
            sku_ids.append(sku_id)
            demand = tmpl["demand"]
            lo, hi = STOCK_COVER.get(tmpl["supplier_idx"], (8.0, 20.0))
            stock  = int(demand * rng.uniform(lo, hi))  # days cover varies by risk tier
            session.add(SKU(
                id=sku_id,
                sku_code=tmpl["code"],
                name=tmpl["name"],
                category="FMCG",
                subcategory="FMCG",
                supplier_id=supplier_id,
                unit_cost_inr=tmpl["cost"],
                current_stock=stock,
                reorder_point=demand * 5,
                safety_stock=demand * 3,
                daily_demand_avg=demand,
                is_critical=(demand > 80 or tmpl["cost"] > 200),
            ))
        await session.commit()

        # ── [4/8] 90-day delivery history ───────────────────────────────
        print("[4/8] Seeding 90-day delivery history (deterministic)...")
        # High-risk suppliers get worse delay distributions to drive critical scores
        HIGH_RISK_IDS = {SUPPLIER_IDS[1], SUPPLIER_IDS[4]}   # Sunrise, NorthStar
        MED_RISK_IDS  = {SUPPLIER_IDS[2], SUPPLIER_IDS[3]}   # GreenLeaf, PureFarm
        tier1_suppliers = SUPPLIERS[:5]
        for day_offset in range(90):
            delivery_date = today - timedelta(days=day_offset)
            for _ in range(rng.randint(3, 5)):
                supplier = rng.choice(tier1_suppliers)
                sku_id   = rng.choice(sku_ids)
                lead     = supplier["lead_time_days"]
                # Delay distribution varies by supplier risk profile
                sid = supplier["id"]
                if sid in HIGH_RISK_IDS:
                    # Sunrise / NorthStar: frequent severe delays (critical risk)
                    delay = max(0, rng.choices([0,1,2,3,5,8], weights=[15,15,20,25,15,10])[0])
                elif sid in MED_RISK_IDS:
                    # GreenLeaf / PureFarm: moderate delays (high risk)
                    delay = max(0, rng.choices([0,1,2,3,5,8], weights=[30,20,20,15,10,5])[0])
                else:
                    # Bharat FMCG: mostly on-time (medium-high risk)
                    delay = max(0, rng.choices([0,1,2,3,5,8], weights=[50,20,15,8,5,2])[0])
                qty_ordered = rng.randint(50, 300)
                qty_delivered = qty_ordered if delay < 3 else int(qty_ordered * rng.uniform(0.70, 0.95))
                status   = "delivered" if delay == 0 else ("delayed" if delay <= 3 else "partial")
                penalty  = delay * rng.uniform(500, 2000) if delay > 2 else 0.0
                order_dt = delivery_date - timedelta(days=lead + rng.randint(-1, 2))
                session.add(DeliveryRecord(
                    id=uuid.uuid4(),
                    supplier_id=supplier["id"],
                    sku_id=sku_id,
                    order_date=order_dt,
                    expected_date=delivery_date,
                    actual_date=delivery_date + timedelta(days=delay),
                    quantity_ordered=qty_ordered,
                    quantity_delivered=qty_delivered,
                    delay_days=delay,
                    status=status,
                    sla_penalty_inr=round(penalty, 2),
                ))
        await session.commit()
        print(f"   ~{90 * 4} delivery records generated")

        # ── [5/8] 10 fixed disruptions ───────────────────────────────────
        print("[5/8] Seeding 10 fixed disruptions (7 active, 3 resolved)...")
        for d in FIXED_DISRUPTIONS:
            session.add(Disruption(id=uuid.uuid4(), **d))
        await session.commit()

        # ── [6/8] 30-day risk snapshots ──────────────────────────────────
        print("[6/8] Seeding 30-day risk history per supplier...")
        # Base risk scores per Tier-1 supplier (fixed starting points)
        base_risks = {
            SUPPLIER_IDS[0]: 0.65,   # Bharat FMCG — high (inventory breach + port congestion)
            SUPPLIER_IDS[1]: 0.88,   # Sunrise Consumer — critical (cyclone + very low stock)
            SUPPLIER_IDS[2]: 0.82,   # GreenLeaf — critical (flood + low stock)
            SUPPLIER_IDS[3]: 0.78,   # PureFarm — critical (raw material shortage)
            SUPPLIER_IDS[4]: 0.83,   # NorthStar — critical (strike + very low stock)
        }
        for supplier in SUPPLIERS[:5]:
            sid = supplier["id"]
            current = base_risks.get(sid, 0.45)
            for day_offset in range(30, -1, -1):
                snap_date = today - timedelta(days=day_offset)
                current  = max(0.05, min(0.95, current + rng.uniform(-0.04, 0.04)))
                rl = ("critical" if current > 0.70 else "high" if current > 0.50
                      else "medium" if current > 0.30 else "low")
                session.add(RiskSnapshot(
                    id=uuid.uuid4(),
                    supplier_id=sid,
                    risk_score=round(current, 3),
                    risk_level=rl,
                    factors=f"reliability:{supplier['reliability_score']},zone:{supplier['risk_zone'] or 'none'}",
                    stockout_probability=round(current * rng.uniform(0.35, 0.65), 3),
                    days_of_stock=rng.randint(5, 40),
                    snapshot_at=datetime.combine(snap_date, datetime.min.time()),
                ))
        await session.commit()

        # ── [7/8] Alternate suppliers ────────────────────────────────────
        print("[7/8] Seeding alternate supplier mappings (2-3 per Tier-1)...")
        # For each Tier-1, add 2-3 alternate supplier entries per SKU
        alt_map = {
            # Bharat FMCG SKUs (sku_ids 0-3) → Hindustan Consumer Care + Bombay Home Products
            0: [SUPPLIER_IDS[15], SUPPLIER_IDS[16]],
            1: [SUPPLIER_IDS[15], SUPPLIER_IDS[16]],
            2: [SUPPLIER_IDS[15], SUPPLIER_IDS[16]],
            3: [SUPPLIER_IDS[15]],
            # Sunrise Consumer SKUs (sku_ids 4-6) → Madras Foods + Vizag Consumer
            4: [SUPPLIER_IDS[17], SUPPLIER_IDS[18]],
            5: [SUPPLIER_IDS[17], SUPPLIER_IDS[18]],
            6: [SUPPLIER_IDS[17]],
            # GreenLeaf Agro SKUs (sku_ids 7-11) → Eastern Agro Products
            7:  [SUPPLIER_IDS[19]],
            8:  [SUPPLIER_IDS[19]],
            9:  [SUPPLIER_IDS[19]],
            10: [SUPPLIER_IDS[19]],
            11: [SUPPLIER_IDS[19]],
            # PureFarm Naturals SKUs (sku_ids 12-15) → Western Naturals + Kerala Organics
            12: [SUPPLIER_IDS[20], SUPPLIER_IDS[21]],
            13: [SUPPLIER_IDS[20], SUPPLIER_IDS[21]],
            14: [SUPPLIER_IDS[20], SUPPLIER_IDS[21]],
            15: [SUPPLIER_IDS[20]],
            # NorthStar Essentials SKUs (sku_ids 16-18) → Capital FMCG Corp
            16: [SUPPLIER_IDS[22]],
            17: [SUPPLIER_IDS[22]],
            18: [SUPPLIER_IDS[22] if len(sku_ids) > 18 else SUPPLIER_IDS[22]],
        }
        # Fixed cost premium / quality scores per alt supplier
        alt_attrs = {
            SUPPLIER_IDS[15]: {"cost_prem": 8.5,  "quality": 0.90, "lead_delta": +1},
            SUPPLIER_IDS[16]: {"cost_prem": 12.0, "quality": 0.84, "lead_delta": +2},
            SUPPLIER_IDS[17]: {"cost_prem": 6.5,  "quality": 0.88, "lead_delta": 0 },
            SUPPLIER_IDS[18]: {"cost_prem": 14.0, "quality": 0.80, "lead_delta": +1},
            SUPPLIER_IDS[19]: {"cost_prem": 10.0, "quality": 0.79, "lead_delta": +2},
            SUPPLIER_IDS[20]: {"cost_prem": 7.5,  "quality": 0.86, "lead_delta": +1},
            SUPPLIER_IDS[21]: {"cost_prem": 15.0, "quality": 0.92, "lead_delta": +3},
            SUPPLIER_IDS[22]: {"cost_prem": 9.0,  "quality": 0.81, "lead_delta": +1},
        }
        for sku_idx, alt_ids in alt_map.items():
            if sku_idx >= len(sku_ids):
                continue
            sku_id = sku_ids[sku_idx]
            primary_lead = SUPPLIERS[SKU_TEMPLATES[sku_idx]["supplier_idx"]]["lead_time_days"]
            for alt_id in alt_ids:
                attr = alt_attrs[alt_id]
                session.add(AlternateSupplier(
                    id=uuid.uuid4(),
                    sku_id=sku_id,
                    supplier_id=alt_id,
                    cost_premium_pct=attr["cost_prem"],
                    lead_time_days=primary_lead + attr["lead_delta"],
                    quality_score=attr["quality"],
                ))
        await session.commit()

        # ── [8/8] Action cards ───────────────────────────────────────────
        print("[8/8] Seeding 12 action cards (8 pending, 4 resolved)...")
        for ac in ACTION_CARDS:
            sku_idx = ac["sku_idx"]
            session.add(ActionCard(
                id=uuid.uuid4(),
                title=ac["title"],
                description=ac["desc"],
                action_type=ac["type"],
                priority=ac["priority"],
                supplier_id=SUPPLIER_IDS[ac["supplier_idx"]],
                sku_id=sku_ids[sku_idx] if sku_idx < len(sku_ids) else None,
                estimated_impact_inr=float(ac["impact"]),
                is_resolved=ac.get("resolved", False),
            ))
        await session.commit()

        # ── Festival calendar ────────────────────────────────────────────
        print("[+] Seeding festival calendar...")
        for f in FESTIVAL_DATA:
            session.add(FestivalCalendar(
                id=uuid.uuid4(),
                name=f["name"],
                start_date=date.fromisoformat(f["start"]),
                end_date=date.fromisoformat(f["end"]),
                region=f["region"],
                demand_multiplier=f["multiplier"],
                affected_categories=f["categories"],
                procurement_lead_days=14,
            ))
        await session.commit()

    await engine.dispose()
    print("\n✓ SupplySense FMCG database seeded successfully!")
    print(f"  - 5 Tier-1 FMCG vendors  (Bharat, Sunrise, GreenLeaf, PureFarm, NorthStar)")
    print(f"  - 10 Tier-2 suppliers     (2 per vendor: packaging + raw material)")
    print(f"  - 8 Alternate suppliers   (2-3 per vendor for demo page)")
    print(f"  - 18 FMCG SKUs            (3-5 per vendor)")
    print(f"  - 10 fixed disruptions    (5 critical · 2 medium · 3 low)")
    print(f"  - ~360 delivery records   (90-day deterministic history)")
    print(f"  - 155 risk snapshots      (31 days × 5 vendors)")
    print(f"  - 12 action cards         (8 pending · 4 resolved)")
    print(f"  - {len(FESTIVAL_DATA)} festival calendar entries ({len([f for f in FESTIVAL_DATA if f['start'] >= '2026-05'])} upcoming)")


if __name__ == "__main__":
    asyncio.run(seed_database())
