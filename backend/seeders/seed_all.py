"""
Master seeder for SupplySense — Indian FMCG supply chain.

7 Tier-1 FMCG manufacturers · 14 Tier-2 suppliers · 6 alternate suppliers
21 FMCG SKUs · 13 disruptions · deterministic delivery history

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

_env_path = Path(__file__).parent.parent / ".env"
if _env_path.exists():
    try:
        from dotenv import load_dotenv
        load_dotenv(_env_path)
    except ImportError:
        for line in _env_path.read_text().splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                k, _, v = line.partition("=")
                os.environ.setdefault(k.strip(), v.strip())

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql+asyncpg://USER:PASSWORD@localhost:5432/supplysense",
)

rng = random.Random(42)

# ── Tier-1 supplier ID shortcuts ───────────────────────────────────────
S_VIKAS     = SUPPLIER_IDS[0]   # Vikas Home Care Ltd — Mumbai
S_DAKSHIN   = SUPPLIER_IDS[1]   # Dakshin Foods Corporation — Chennai
S_GANGA     = SUPPLIER_IDS[2]   # Ganga Agri Products — Kolkata
S_SAURASHTRA= SUPPLIER_IDS[3]   # Saurashtra Naturals Pvt Ltd — Ahmedabad
S_ARYA      = SUPPLIER_IDS[4]   # Arya Consumer Brands — New Delhi
S_MALABAR   = SUPPLIER_IDS[5]   # Malabar Ayur Essentials — Kochi
S_NARMADA   = SUPPLIER_IDS[6]   # Narmada Dairy & Beverages — Indore

# ── Tier-2 supplier ID shortcuts ───────────────────────────────────────
T2_KONKAN_PKG     = SUPPLIER_IDS[7]    # Vikas — packaging
T2_VAPI_OLEO      = SUPPLIER_IDS[8]    # Vikas — raw material
T2_COIMBATORE_CTN = SUPPLIER_IDS[9]    # Dakshin — packaging
T2_TELANGANA_SPICE= SUPPLIER_IDS[10]   # Dakshin — raw material
T2_HOWRAH_PAPER   = SUPPLIER_IDS[11]   # Ganga — packaging
T2_AMRITSAR_GRAIN = SUPPLIER_IDS[12]   # Ganga — raw material
T2_BARODA_CONT    = SUPPLIER_IDS[13]   # Saurashtra — packaging
T2_KANNUR_COCONUT = SUPPLIER_IDS[14]   # Saurashtra — raw material
T2_SONIPAT_LAM    = SUPPLIER_IDS[15]   # Arya — packaging
T2_JORHAT_TEA     = SUPPLIER_IDS[16]   # Arya — raw material
T2_THRISSUR_LABEL = SUPPLIER_IDS[17]   # Malabar — packaging
T2_NILGIRI_HERB   = SUPPLIER_IDS[18]   # Malabar — raw material
T2_UJJAIN_TETRA   = SUPPLIER_IDS[19]   # Narmada — packaging
T2_ANAND_DAIRY    = SUPPLIER_IDS[20]   # Narmada — raw material

# ── Alternate supplier ID shortcuts ────────────────────────────────────
ALT_PUNE          = SUPPLIER_IDS[21]   # Alt for Vikas
ALT_BANGALORE     = SUPPLIER_IDS[22]   # Alt for Dakshin
ALT_CUTTACK       = SUPPLIER_IDS[23]   # Alt for Ganga
ALT_NASHIK        = SUPPLIER_IDS[24]   # Alt for Saurashtra
ALT_LUCKNOW       = SUPPLIER_IDS[25]   # Alt for Arya
ALT_MYSORE        = SUPPLIER_IDS[26]   # Alt for Malabar + Narmada

# ── FMCG SKU catalogue — 3 products per Tier-1 vendor ──────────────────
SKU_TEMPLATES = [
    # Vikas Home Care (idx 0) — home care
    {"name": "Liquid Detergent 1L",           "supplier_idx": 0, "cost": 195.0, "demand": 110, "code": "VHC-001"},
    {"name": "Dishwash Bar 200g (3-pack)",    "supplier_idx": 0, "cost":  65.0, "demand":  95, "code": "VHC-002"},
    {"name": "Floor Cleaner Citrus 500ml",    "supplier_idx": 0, "cost":  89.0, "demand":  80, "code": "VHC-003"},

    # Dakshin Foods (idx 1) — packaged foods
    {"name": "Idli-Dosa Batter 1kg",          "supplier_idx": 1, "cost":  75.0, "demand": 180, "code": "DFC-001"},
    {"name": "Sambar Masala 200g",            "supplier_idx": 1, "cost": 110.0, "demand":  70, "code": "DFC-002"},
    {"name": "Coconut Chutney Powder 150g",   "supplier_idx": 1, "cost":  95.0, "demand":  85, "code": "DFC-003"},

    # Ganga Agri (idx 2) — staples & spices
    {"name": "Gobindobhog Rice 5kg",          "supplier_idx": 2, "cost": 520.0, "demand":  40, "code": "GAP-001"},
    {"name": "Cold-Pressed Mustard Oil 1L",   "supplier_idx": 2, "cost": 185.0, "demand":  65, "code": "GAP-002"},
    {"name": "Whole Wheat Atta 10kg",         "supplier_idx": 2, "cost": 395.0, "demand":  55, "code": "GAP-003"},

    # Saurashtra Naturals (idx 3) — personal care
    {"name": "Virgin Coconut Oil 500ml",      "supplier_idx": 3, "cost": 210.0, "demand":  70, "code": "SNP-001"},
    {"name": "Amla Hair Oil 200ml",           "supplier_idx": 3, "cost": 135.0, "demand":  60, "code": "SNP-002"},
    {"name": "Neem Face Wash 100ml",          "supplier_idx": 3, "cost": 125.0, "demand":  55, "code": "SNP-003"},

    # Arya Consumer Brands (idx 4) — snacks & beverages
    {"name": "Masala Chai 250g",              "supplier_idx": 4, "cost": 240.0, "demand":  45, "code": "ACB-001"},
    {"name": "Cream Biscuit 100g (12-pack)",  "supplier_idx": 4, "cost":  22.0, "demand": 280, "code": "ACB-002"},
    {"name": "Roasted Cashew 200g",           "supplier_idx": 4, "cost": 320.0, "demand":  35, "code": "ACB-003"},

    # Malabar Ayur Essentials (idx 5) — ayurvedic personal care
    {"name": "Kumkumadi Face Serum 30ml",     "supplier_idx": 5, "cost": 450.0, "demand":  25, "code": "MAE-001"},
    {"name": "Dashamoola Body Oil 200ml",     "supplier_idx": 5, "cost": 280.0, "demand":  40, "code": "MAE-002"},
    {"name": "Triphala Wellness Tabs 60s",    "supplier_idx": 5, "cost": 195.0, "demand":  50, "code": "MAE-003"},

    # Narmada Dairy & Beverages (idx 6) — dairy & drinks
    {"name": "Flavoured Lassi 200ml (6-pack)","supplier_idx": 6, "cost": 120.0, "demand": 150, "code": "NDB-001"},
    {"name": "Paneer Block 200g",             "supplier_idx": 6, "cost":  95.0, "demand": 130, "code": "NDB-002"},
    {"name": "Mango Drink 1L Tetra Pak",      "supplier_idx": 6, "cost":  65.0, "demand": 160, "code": "NDB-003"},

    # Historical / Resolved SKUs (idx 27-32)
    {"name": "Turmeric Powder 500g",          "supplier_idx": 27, "cost": 120.0, "demand": 90, "code": "BSE-001"},
    {"name": "Mineral Water 1L (12-pack)",    "supplier_idx": 28, "cost": 180.0, "demand": 210, "code": "HSW-001"},
    {"name": "Ponni Raw Rice 10kg",           "supplier_idx": 29, "cost": 450.0, "demand": 60, "code": "KAP-001"},
    {"name": "Premium Besan 1kg",             "supplier_idx": 30, "cost": 85.0,  "demand": 120, "code": "RG-001"},
    {"name": "Sunflower Oil 5L",              "supplier_idx": 31, "cost": 750.0, "demand": 40, "code": "DE-001"},
    {"name": "Refined Cottonseed Oil 1L",     "supplier_idx": 32, "cost": 115.0, "demand": 80, "code": "VCO-001"},
]

today = date.today()

# ── 13 disruptions — 8 active (5 critical, 3 medium/high), 2 Tier-2 cascades, 3 resolved
FIXED_DISRUPTIONS = [
    # ── CRITICAL (active) ──
    {
        "supplier_id": S_DAKSHIN,
        "disruption_type": "cyclone",
        "severity": "critical",
        "title": "Cyclone Michaung — Chennai port and coastal routes blocked",
        "description": "Category-3 cyclone has shut down Chennai port operations and flooded arterial roads in Royapuram and Tondiarpet. Dakshin Foods Corporation's Guindy warehouse reports 18 inches of standing water. All outbound FMCG shipments suspended — northbound cargo diverted through Bangalore. Estimated 7-day full recovery.",
        "start_date": today - timedelta(days=3),
        "end_date": None,
        "impact_score": 0.92,
        "affected_skus_count": 3,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": S_ARYA,
        "disruption_type": "strike",
        "severity": "critical",
        "title": "NH-44 transport strike — Delhi–Chandigarh corridor blocked",
        "description": "All India Motor Transport Congress has called an indefinite strike on NH-44 over diesel excise demands. Arya Consumer Brands' primary dispatch route from Kundli warehouse is impassable. Rail freight via Northern Railway is being arranged but backlog adds 8-day delay. Cream Biscuit and Masala Chai shipments halted.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.87,
        "affected_skus_count": 3,
        "region": "North",
        "is_active": True,
    },
    {
        "supplier_id": S_GANGA,
        "disruption_type": "flood",
        "severity": "critical",
        "title": "West Bengal flash floods — Kolkata warehouse submerged",
        "description": "Severe monsoon flooding across Hooghly and South 24 Parganas has inundated Ganga Agri Products' primary warehouse near Taratala. 35% of Gobindobhog Rice stock at risk of water damage. NDRF has deployed rescue teams. All outbound logistics suspended — estimated 8-10 day disruption before road access is restored.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.94,
        "affected_skus_count": 3,
        "region": "East",
        "is_active": True,
    },
    {
        "supplier_id": S_SAURASHTRA,
        "disruption_type": "raw_material",
        "severity": "critical",
        "title": "Coconut supply crisis — Kerala harvest down 55%",
        "description": "Prolonged drought across Malabar coast has decimated coconut yields this season. Kannur Coconut Collective, the sole copra supplier for Saurashtra Naturals, has declared force majeure on Q3 commitments. Virgin Coconut Oil and Amla Hair Oil production lines are halted. Sri Lankan copra import being explored but adds 15-day lead time and 22% cost premium.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.89,
        "affected_skus_count": 2,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": S_VIKAS,
        "disruption_type": "inventory",
        "severity": "critical",
        "title": "Safety stock breach — Liquid Detergent 1L below 5-day cover",
        "description": "Vikas Home Care's flagship Liquid Detergent 1L has dropped below the 5-day safety stock threshold. Diwali demand has surged 160% while inbound oleochemical shipments from Vapi are stuck at JNPT port. Reorder from alternate supplier Pune Consumer Goods is in progress but 4-day lead time applies.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.84,
        "affected_skus_count": 2,
        "region": "West",
        "is_active": True,
    },

    # ── HIGH / MEDIUM (active) ──
    {
        "supplier_id": S_MALABAR,
        "disruption_type": "quality",
        "severity": "high",
        "title": "FSSAI audit hold — Kumkumadi Serum batch rejected",
        "description": "FSSAI routine audit of Malabar Ayur Essentials' Ernakulam production unit flagged heavy metal residue in Kumkumadi Face Serum batch MK-2026-Q2-14. Entire batch of 4,200 units quarantined pending re-testing. Production halted for 5 days until corrective action is validated.",
        "start_date": today - timedelta(days=4),
        "end_date": None,
        "impact_score": 0.72,
        "affected_skus_count": 1,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": S_VIKAS,
        "disruption_type": "demand_spike",
        "severity": "medium",
        "title": "Diwali demand surge — home care categories up 160%",
        "description": "Pan-India Diwali cleaning season is driving extraordinary demand across all home care SKUs. Vikas Home Care reports order backlog of 14 days. Floor Cleaner and Dishwash lines running at 115% capacity. Festival procurement window closes in 8 days.",
        "start_date": today - timedelta(days=6),
        "end_date": None,
        "impact_score": 0.58,
        "affected_skus_count": 3,
        "region": "All India",
        "is_active": True,
    },
    {
        "supplier_id": S_NARMADA,
        "disruption_type": "logistics",
        "severity": "medium",
        "title": "Cold chain disruption — refrigerated trucks stranded at Agra toll",
        "description": "FASTag system failure at Agra toll plaza has stranded 40+ refrigerated trucks on NH-44 for 18 hours. Narmada Dairy's Flavoured Lassi and Paneer shipments bound for Delhi NCR are at risk of temperature exceedance. Emergency re-icing arranged at Gwalior cold storage facility.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.55,
        "affected_skus_count": 2,
        "region": "Central",
        "is_active": True,
    },

    # ── TIER-2 CASCADE DISRUPTIONS (active) ──
    {
        "supplier_id": T2_KANNUR_COCONUT,
        "disruption_type": "raw_material",
        "severity": "critical",
        "title": "Kannur Coconut Collective — drought force majeure (Tier-2)",
        "description": "Unprecedented drought across northern Kerala has caused 55% drop in copra output. Kannur Coconut Collective has declared force majeure, directly impacting Saurashtra Naturals' coconut oil and hair oil production. No alternate domestic source available at current scale. Sri Lankan import pathway under evaluation.",
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.88,
        "affected_skus_count": 2,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": T2_HOWRAH_PAPER,
        "disruption_type": "flood",
        "severity": "high",
        "title": "Howrah Paper & Board — flood halts packaging supply (Tier-2)",
        "description": "Monsoon flooding in Howrah industrial belt has damaged Howrah Paper & Board's corrugation unit. Primary packaging for Ganga Agri's Gobindobhog Rice 5kg and Atta 10kg is affected. 6-day packaging supply gap expected. Ganga Agri has paused packing operations.",
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.73,
        "affected_skus_count": 2,
        "region": "East",
        "is_active": True,
    },

    # ── RESOLVED (inactive) ──
    {
        "supplier_id": S_SAURASHTRA,
        "disruption_type": "logistics",
        "severity": "low",
        "title": "Customs re-inspection — Coconut Oil import batch cleared",
        "description": "Routine FSSAI re-inspection of imported copra batch at Kandla port. 2-day clearance delay. Shipment has cleared and reached Ahmedabad facility. No further impact.",
        "start_date": today - timedelta(days=14),
        "end_date": today - timedelta(days=12),
        "impact_score": 0.20,
        "affected_skus_count": 1,
        "region": "West",
        "is_active": False,
    },
    {
        "supplier_id": S_GANGA,
        "disruption_type": "quality",
        "severity": "low",
        "title": "Packaging concentration risk — Atta 10kg sole-source flagged",
        "description": "Howrah Paper & Board identified as sole packaging vendor for Whole Wheat Atta 10kg. Procurement team flagged concentration risk. Dual-sourcing agreement signed with Cuttack-based vendor. Risk mitigated.",
        "start_date": today - timedelta(days=20),
        "end_date": today - timedelta(days=15),
        "impact_score": 0.18,
        "affected_skus_count": 1,
        "region": "East",
        "is_active": False,
    },
    {
        "supplier_id": S_ARYA,
        "disruption_type": "logistics",
        "severity": "low",
        "title": "Lead time extension — Jorhat Tea Estate harvest backlog resolved",
        "description": "Jorhat Tea & Coffee Estate had extended lead times from 5 to 9 days due to first-flush processing backlog. Masala Chai 250g safety stock buffer covered the variance. Lead times restored to normal.",
        "start_date": today - timedelta(days=18),
        "end_date": today - timedelta(days=10),
        "impact_score": 0.15,
        "affected_skus_count": 1,
        "region": "Northeast",
        "is_active": False,
    },
]

FESTIVAL_DATA = [
    # 2025
    {"name": "Onam",            "start": "2025-09-05", "end": "2025-09-07", "region": "South",         "multiplier": 1.5, "categories": "FMCG"},
    {"name": "Navratri",        "start": "2025-09-29", "end": "2025-10-07", "region": "West,North",    "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Durga Puja",      "start": "2025-10-01", "end": "2025-10-05", "region": "East",          "multiplier": 2.0, "categories": "FMCG"},
    {"name": "Diwali",          "start": "2025-10-20", "end": "2025-10-24", "region": "All India",     "multiplier": 2.5, "categories": "FMCG"},
    # 2026 (past)
    {"name": "Pongal",          "start": "2026-01-14", "end": "2026-01-17", "region": "South",         "multiplier": 1.6, "categories": "FMCG"},
    {"name": "Holi",            "start": "2026-03-02", "end": "2026-03-03", "region": "North,Central", "multiplier": 1.7, "categories": "FMCG"},
    {"name": "Eid ul-Adha",     "start": "2026-06-07", "end": "2026-06-09", "region": "All India",     "multiplier": 1.9, "categories": "FMCG"},
    # 2026 (upcoming)
    {"name": "Rakshabandhan",   "start": "2026-08-22", "end": "2026-08-23", "region": "North,West",    "multiplier": 1.5, "categories": "FMCG"},
    {"name": "Ganesh Chaturthi","start": "2026-08-26", "end": "2026-09-04", "region": "West,South",    "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Onam 2026",       "start": "2026-08-25", "end": "2026-08-27", "region": "South",         "multiplier": 1.5, "categories": "FMCG"},
    {"name": "Navratri 2026",   "start": "2026-10-09", "end": "2026-10-17", "region": "West,North",    "multiplier": 1.8, "categories": "FMCG"},
    {"name": "Dussehra 2026",   "start": "2026-10-17", "end": "2026-10-18", "region": "All India",     "multiplier": 2.0, "categories": "FMCG"},
    {"name": "Diwali 2026",     "start": "2026-11-08", "end": "2026-11-12", "region": "All India",     "multiplier": 2.5, "categories": "FMCG"},
    {"name": "Christmas 2026",  "start": "2026-12-24", "end": "2026-12-26", "region": "All India",     "multiplier": 1.4, "categories": "FMCG"},
]

ACTION_CARDS = [
    # ── Critical (unresolved) ──
    {"type": "reorder",              "priority": "critical", "supplier_idx": 0, "sku_idx": 0,  "impact": 195000,
     "title": "Emergency reorder: Liquid Detergent 1L — 3 days to stockout",
     "desc":  "Vikas Home Care safety stock breached. Diwali demand at 160% of baseline. Immediate reorder from Pune Consumer Goods required to prevent shelf gaps."},
    {"type": "switch_supplier",      "priority": "critical", "supplier_idx": 1, "sku_idx": 3,  "impact": 270000,
     "title": "Switch supplier: Idli-Dosa Batter 1kg — cyclone halts Dakshin Foods",
     "desc":  "Cyclone Michaung has shut down Dakshin Foods' Chennai operations. Activate Bangalore Processed Foods as interim source. 180 units/day demand at risk."},
    {"type": "expedite",             "priority": "critical", "supplier_idx": 4, "sku_idx": 13, "impact": 123000,
     "title": "Expedite Cream Biscuit 12-pack — NH-44 strike blocks Delhi route",
     "desc":  "Arya Consumer Brands' truck fleet stranded at Panipat. Arrange emergency rail freight via Northern Railway Parcel Express. 280 units/day demand."},

    # ── High (unresolved) ──
    {"type": "reorder",              "priority": "high",     "supplier_idx": 2, "sku_idx": 6,  "impact": 104000,
     "title": "Reorder Gobindobhog Rice 5kg — flood damages 35% of Kolkata stock",
     "desc":  "Ganga Agri warehouse flooding puts premium rice inventory at risk. Pre-emptive reorder from Cuttack Agro Traders to cover 15-day gap."},
    {"type": "increase_safety_stock","priority": "high",     "supplier_idx": 0, "sku_idx": 1,  "impact":  68000,
     "title": "Increase safety stock: Dishwash Bar — Diwali cleaning surge",
     "desc":  "Festival demand 95 units/day vs 65 baseline. Current 6-day cover insufficient for 12-day festival window. Raise safety stock to 15-day cover."},
    {"type": "reorder",              "priority": "high",     "supplier_idx": 3, "sku_idx": 9,  "impact":  98000,
     "title": "Reorder Virgin Coconut Oil 500ml — raw material supply halted",
     "desc":  "Kannur Coconut Collective force majeure blocks copra supply. Switch to Nashik Herbal Products while Sri Lankan import is arranged."},

    # ── Medium (unresolved) ──
    {"type": "switch_supplier",      "priority": "medium",   "supplier_idx": 3, "sku_idx": 10, "impact":  52000,
     "title": "Evaluate alternate for Amla Hair Oil — input cost surge +28%",
     "desc":  "Copra shortage driving amla oil base cost up 28%. Nashik Herbal Products offers 12% premium vs 28% current spike. Cost-benefit analysis needed."},
    {"type": "increase_safety_stock","priority": "medium",   "supplier_idx": 6, "sku_idx": 18, "impact":  48000,
     "title": "Pre-position Flavoured Lassi — cold chain risk on NH-44",
     "desc":  "FASTag toll disruptions creating unpredictable cold chain delays on Delhi-bound routes. Increase Delhi NCR buffer stock to 10-day cover."},
    {"type": "expedite",             "priority": "medium",   "supplier_idx": 5, "sku_idx": 15, "impact":  42000,
     "title": "Expedite Kumkumadi Serum release — FSSAI re-test pending",
     "desc":  "Malabar Ayur batch MK-2026-Q2-14 under FSSAI hold. Expedite corrective action and re-submission to release quarantined 4,200 units."},

    # ── Resolved ──
    {"type": "expedite",             "priority": "low",      "supplier_idx": 27, "sku_idx": 21,  "impact":  22000,
     "title": "Expedite Turmeric Powder — customs re-inspection cleared [RESOLVED]",
     "desc":  "Routine FSSAI re-inspection completed. Shipment cleared and in transit to Hyderabad. No further action.", "resolved": True, "resolved_days_ago": 2},
    {"type": "reorder",              "priority": "low",      "supplier_idx": 28, "sku_idx": 22, "impact":  19000,
     "title": "Reorder Mineral Water — lead time extension absorbed [RESOLVED]",
     "desc":  "Bottling plant backlog resolved. Safety stock buffer covered 9-day extension. Lead times restored.", "resolved": True, "resolved_days_ago": 8},
    {"type": "reorder",              "priority": "medium",   "supplier_idx": 29, "sku_idx": 23,  "impact":  37000,
     "title": "Reorder Ponni Raw Rice — duty revision impact mitigated [RESOLVED]",
     "desc":  "Central excise duty hike absorbed through renegotiated procurement rate. New contract price locked.", "resolved": True, "resolved_days_ago": 15},
    {"type": "increase_safety_stock","priority": "low",      "supplier_idx": 30, "sku_idx": 24,  "impact":  14000,
     "title": "Safety stock for Premium Besan — dual-source packaging secured [RESOLVED]",
     "desc":  "Sole-source concentration risk resolved. Second vendor contracted. Packaging lead time buffer adequate.", "resolved": True, "resolved_days_ago": 22},
    {"type": "expedite",             "priority": "medium",   "supplier_idx": 31, "sku_idx": 25,  "impact":  28000,
     "title": "Expedite Sunflower Oil — logistics strike bypass [RESOLVED]",
     "desc":  "Transport strike bypassed using alternate rail freight. Stock delivered safely.", "resolved": True, "resolved_days_ago": 5},
    {"type": "reorder",              "priority": "high",     "supplier_idx": 32, "sku_idx": 26,  "impact":  45000,
     "title": "Reorder Refined Cottonseed Oil — supply chain secured [RESOLVED]",
     "desc":  "Vendor capacity increased. Oil inventory levels restored to normal.", "resolved": True, "resolved_days_ago": 12},
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
        print(f"[1/8] Seeding {len(SUPPLIERS)} suppliers...")
        for s in SUPPLIERS:
            session.add(Supplier(**s))
        await session.commit()

        # ── [2/8] Tier-1 → Tier-2 dependencies ─────────────────────────
        print("[2/8] Seeding 14 Tier-1 → Tier-2 dependencies...")
        deps = [
            # Vikas Home Care → Konkan Flexi Pack (packaging) + Vapi Oleochem (raw material)
            {"supplier_id": S_VIKAS,      "depends_on_id": T2_KONKAN_PKG,     "dependency_type": "packaging",    "criticality": 0.75},
            {"supplier_id": S_VIKAS,      "depends_on_id": T2_VAPI_OLEO,      "dependency_type": "raw_material", "criticality": 0.85},
            # Dakshin Foods → Coimbatore Carton (packaging) + Telangana Spice (raw material)
            {"supplier_id": S_DAKSHIN,    "depends_on_id": T2_COIMBATORE_CTN, "dependency_type": "packaging",    "criticality": 0.70},
            {"supplier_id": S_DAKSHIN,    "depends_on_id": T2_TELANGANA_SPICE,"dependency_type": "raw_material", "criticality": 0.90},
            # Ganga Agri → Howrah Paper (packaging) + Amritsar Grain (raw material)
            {"supplier_id": S_GANGA,      "depends_on_id": T2_HOWRAH_PAPER,   "dependency_type": "packaging",    "criticality": 0.65},
            {"supplier_id": S_GANGA,      "depends_on_id": T2_AMRITSAR_GRAIN, "dependency_type": "raw_material", "criticality": 0.80},
            # Saurashtra Naturals → Baroda Container (packaging) + Kannur Coconut (raw material)
            {"supplier_id": S_SAURASHTRA, "depends_on_id": T2_BARODA_CONT,    "dependency_type": "packaging",    "criticality": 0.72},
            {"supplier_id": S_SAURASHTRA, "depends_on_id": T2_KANNUR_COCONUT, "dependency_type": "raw_material", "criticality": 0.88},
            # Arya Consumer → Sonipat Laminate (packaging) + Jorhat Tea (raw material)
            {"supplier_id": S_ARYA,       "depends_on_id": T2_SONIPAT_LAM,    "dependency_type": "packaging",    "criticality": 0.68},
            {"supplier_id": S_ARYA,       "depends_on_id": T2_JORHAT_TEA,     "dependency_type": "raw_material", "criticality": 0.82},
            # Malabar Ayur → Thrissur Bottle (packaging) + Nilgiri Herb (raw material)
            {"supplier_id": S_MALABAR,    "depends_on_id": T2_THRISSUR_LABEL, "dependency_type": "packaging",    "criticality": 0.74},
            {"supplier_id": S_MALABAR,    "depends_on_id": T2_NILGIRI_HERB,   "dependency_type": "raw_material", "criticality": 0.86},
            # Narmada Dairy → Ujjain Tetra Pak (packaging) + Anand Dairy (raw material)
            {"supplier_id": S_NARMADA,    "depends_on_id": T2_UJJAIN_TETRA,   "dependency_type": "packaging",    "criticality": 0.70},
            {"supplier_id": S_NARMADA,    "depends_on_id": T2_ANAND_DAIRY,    "dependency_type": "raw_material", "criticality": 0.92},
        ]
        for dep in deps:
            session.add(SupplierDependency(id=uuid.uuid4(), **dep))
        await session.commit()

        # ── [3/8] FMCG SKUs ─────────────────────────────────────────────
        print("[3/8] Seeding 21 FMCG SKUs...")
        sku_ids: list[uuid.UUID] = []
        STOCK_COVER = {
            1: (1.5, 3.5),   # Dakshin — near stockout (cyclone)
            4: (2.0, 4.0),   # Arya — very low stock (strike)
            2: (3.0, 5.5),   # Ganga — below safety stock (flood)
            3: (3.5, 6.0),   # Saurashtra — low (raw material crisis)
            5: (5.0, 9.0),   # Malabar — moderate (quality hold)
            0: (7.0, 14.0),  # Vikas — normal-ish (demand surge)
            6: (10.0, 18.0), # Narmada — healthy stock
        }
        for tmpl in SKU_TEMPLATES:
            supplier_id = SUPPLIER_IDS[tmpl["supplier_idx"]]
            sku_id = uuid.UUID(f"10000000-0000-0000-0000-{str(len(sku_ids)+1).zfill(12)}")
            sku_ids.append(sku_id)
            demand = tmpl["demand"]
            lo, hi = STOCK_COVER.get(tmpl["supplier_idx"], (8.0, 20.0))
            stock = int(demand * rng.uniform(lo, hi))
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
        print("[4/8] Seeding 90-day delivery history...")
        HIGH_RISK_IDS  = {S_DAKSHIN, S_ARYA}
        MED_RISK_IDS   = {S_GANGA, S_SAURASHTRA, S_MALABAR}
        LOW_RISK_IDS   = {S_NARMADA}
        tier1_suppliers = SUPPLIERS[:7]
        for day_offset in range(90):
            delivery_date = today - timedelta(days=day_offset)
            for _ in range(rng.randint(4, 7)):
                supplier = rng.choice(tier1_suppliers)
                sku_id = rng.choice(sku_ids)
                lead = supplier["lead_time_days"]
                sid = supplier["id"]
                if sid in HIGH_RISK_IDS:
                    delay = max(0, rng.choices([0, 1, 2, 3, 5, 8], weights=[15, 15, 20, 25, 15, 10])[0])
                elif sid in MED_RISK_IDS:
                    delay = max(0, rng.choices([0, 1, 2, 3, 5, 8], weights=[30, 20, 20, 15, 10, 5])[0])
                elif sid in LOW_RISK_IDS:
                    delay = max(0, rng.choices([0, 1, 2, 3, 5, 8], weights=[60, 20, 10, 5, 3, 2])[0])
                else:
                    delay = max(0, rng.choices([0, 1, 2, 3, 5, 8], weights=[50, 20, 15, 8, 5, 2])[0])
                qty_ordered = rng.randint(50, 300)
                qty_delivered = qty_ordered if delay < 3 else int(qty_ordered * rng.uniform(0.70, 0.95))
                status = "delivered" if delay == 0 else ("delayed" if delay <= 3 else "partial")
                penalty = delay * rng.uniform(500, 2000) if delay > 2 else 0.0
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
        print(f"   ~{90 * 5} delivery records generated")

        # ── [5/8] Disruptions ───────────────────────────────────────────
        print(f"[5/8] Seeding {len(FIXED_DISRUPTIONS)} disruptions...")
        for d in FIXED_DISRUPTIONS:
            session.add(Disruption(id=uuid.uuid4(), **d))
        await session.commit()

        # ── [6/8] 30-day risk snapshots ──────────────────────────────────
        print("[6/8] Seeding 30-day risk history per Tier-1 supplier...")
        base_risks = {
            S_VIKAS:      0.62,   # high (inventory breach + Diwali surge)
            S_DAKSHIN:    0.89,   # critical (cyclone + near stockout)
            S_GANGA:      0.85,   # critical (flood + low stock)
            S_SAURASHTRA: 0.80,   # critical (raw material shortage)
            S_ARYA:       0.86,   # critical (strike + very low stock)
            S_MALABAR:    0.68,   # high (quality audit hold)
            S_NARMADA:    0.42,   # medium (cold chain hiccup)
            
            # Historical suppliers
            SUPPLIER_IDS[27]: 0.15,
            SUPPLIER_IDS[28]: 0.20,
            SUPPLIER_IDS[29]: 0.18,
            SUPPLIER_IDS[30]: 0.12,
            SUPPLIER_IDS[31]: 0.22,
            SUPPLIER_IDS[32]: 0.10,
        }
        for supplier in SUPPLIERS[:7] + SUPPLIERS[27:33]:
            sid = supplier["id"]
            current = base_risks.get(sid, 0.45)
            for day_offset in range(30, -1, -1):
                snap_date = today - timedelta(days=day_offset)
                current = max(0.05, min(0.95, current + rng.uniform(-0.04, 0.04)))
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
        print("[7/8] Seeding alternate supplier mappings...")
        alt_map = {
            # Vikas Home Care SKUs (0-2) → Pune Consumer Goods
            0: [ALT_PUNE], 1: [ALT_PUNE], 2: [ALT_PUNE],
            # Dakshin Foods SKUs (3-5) → Bangalore Processed Foods
            3: [ALT_BANGALORE], 4: [ALT_BANGALORE], 5: [ALT_BANGALORE],
            # Ganga Agri SKUs (6-8) → Cuttack Agro Traders
            6: [ALT_CUTTACK], 7: [ALT_CUTTACK], 8: [ALT_CUTTACK],
            # Saurashtra Naturals SKUs (9-11) → Nashik Herbal Products
            9: [ALT_NASHIK], 10: [ALT_NASHIK], 11: [ALT_NASHIK],
            # Arya Consumer SKUs (12-14) → Lucknow FMCG Works
            12: [ALT_LUCKNOW], 13: [ALT_LUCKNOW], 14: [ALT_LUCKNOW],
            # Malabar Ayur SKUs (15-17) → Mysore Health & Wellness
            15: [ALT_MYSORE], 16: [ALT_MYSORE], 17: [ALT_MYSORE],
            # Narmada Dairy SKUs (18-20) → Mysore Health & Wellness
            18: [ALT_MYSORE], 19: [ALT_MYSORE], 20: [ALT_MYSORE],
        }
        alt_attrs = {
            ALT_PUNE:      {"cost_prem":  8.0, "quality": 0.88, "lead_delta": +1},
            ALT_BANGALORE: {"cost_prem":  7.0, "quality": 0.86, "lead_delta":  0},
            ALT_CUTTACK:   {"cost_prem": 11.0, "quality": 0.78, "lead_delta": +2},
            ALT_NASHIK:    {"cost_prem":  9.5, "quality": 0.84, "lead_delta": +1},
            ALT_LUCKNOW:   {"cost_prem": 10.0, "quality": 0.80, "lead_delta": +1},
            ALT_MYSORE:    {"cost_prem": 12.0, "quality": 0.83, "lead_delta": +2},
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
        print(f"[8/8] Seeding {len(ACTION_CARDS)} action cards...")
        for ac in ACTION_CARDS:
            sku_idx = ac["sku_idx"]
            resolved = ac.get("resolved", False)
            resolved_at = datetime.combine(today - timedelta(days=ac["resolved_days_ago"]), datetime.min.time()) if resolved and "resolved_days_ago" in ac else None
            if resolved and resolved_at is None:
                resolved_at = datetime.now()
            
            session.add(ActionCard(
                id=uuid.uuid4(),
                title=ac["title"],
                description=ac["desc"],
                action_type=ac["type"],
                priority=ac["priority"],
                supplier_id=SUPPLIER_IDS[ac["supplier_idx"]],
                sku_id=sku_ids[sku_idx] if sku_idx < len(sku_ids) else None,
                estimated_impact_inr=float(ac["impact"]),
                is_resolved=resolved,
                resolved_at=resolved_at,
            ))
        await session.commit()

        # ── Festival calendar ────────────────────────────────────────────
        print(f"[+] Seeding {len(FESTIVAL_DATA)} festival calendar entries...")
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
    print("\n=== SupplySense database seeded successfully ===")
    print(f"  - 7 Tier-1 manufacturers   (Vikas, Dakshin, Ganga, Saurashtra, Arya, Malabar, Narmada)")
    print(f"  - 14 Tier-2 suppliers       (2 per vendor: packaging + raw material)")
    print(f"  - 6 Alternate suppliers     (1 per Tier-1, Mysore shared by Malabar+Narmada)")
    print(f"  - 21 FMCG SKUs              (3 per vendor)")
    print(f"  - {len(FIXED_DISRUPTIONS)} disruptions          ({sum(1 for d in FIXED_DISRUPTIONS if d['is_active'])} active, {sum(1 for d in FIXED_DISRUPTIONS if not d['is_active'])} resolved)")
    print(f"  - ~{90*5} delivery records   (90-day deterministic history)")
    print(f"  - {7*31} risk snapshots      (31 days x 7 vendors)")
    print(f"  - {len(ACTION_CARDS)} action cards         ({sum(1 for a in ACTION_CARDS if not a.get('resolved'))} pending, {sum(1 for a in ACTION_CARDS if a.get('resolved'))} resolved)")
    print(f"  - {len(FESTIVAL_DATA)} festival entries     ({sum(1 for f in FESTIVAL_DATA if f['start'] >= '2026-07')} upcoming)")


if __name__ == "__main__":
    asyncio.run(seed_database())
