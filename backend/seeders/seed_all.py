"""
Master seeder for SupplySense — Pharmaceutical Generic Medicine dataset.

Sector: Indian Generic Pharmaceutical Manufacturing
  India supplies 20% of global generics. The supply chain flows:
    API Supplier → Formulation Plant → Packaging → QA/QC → Hospital/Pharmacy

5 Tier-1 manufacturers · 10 Tier-2 suppliers · 6 alternate suppliers
25 drug SKUs across 5 therapeutic categories
12 pharma-specific disruptions (9 active · 3 resolved)
6 disease-season demand calendar entries
90-day deterministic delivery history · 30-day risk snapshots

Run: python -m seeders.seed_all
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker

from .seed_suppliers import SUPPLIERS, SUPPLIER_IDS

import os
from pathlib import Path

# Load .env from the backend directory (parent of seeders/)
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
    "postgresql+asyncpg://postgres:supplysense123@localhost:5432/supplysense",
)

# ── Deterministic random — every re-seed produces identical data ─────────────
rng = random.Random(42)

# ── Tier-1 supplier IDs shorthand ────────────────────────────────────────────
S_INDIAGEN   = SUPPLIER_IDS[0]   # Hyderabad — Diabetes & Cardiac
S_CIPARA     = SUPPLIER_IDS[1]   # Ahmedabad — Antibiotics
S_NORTHINDIA = SUPPLIER_IDS[2]   # Baddi — OTC & Fever
S_BENGALMED  = SUPPLIER_IDS[3]   # Kolkata — Tropical / Monsoon drugs
S_SUNCURE    = SUPPLIER_IDS[4]   # Pune — Cardiac

# ── Drug SKU catalog — 5 per manufacturer, 25 total ──────────────────────────
# Each entry carries the Tier-1 supplier index (supplier_idx) so assignment is
# explicit and auditable.
#
# Naming convention: Generic name + Strength + Form (+ pack size)
# This is how Indian hospital pharmacists and procurement officers refer to drugs.
SKU_TEMPLATES = [
    # ── IndiaGen Pharma Ltd (indices 0-4) — Diabetes & Metabolic ────────────
    # Metformin is the highest-volume diabetes drug in India (>30M patients).
    # Atorvastatin is India's most prescribed statin.
    {"name": "Metformin 500mg Tablets (strip/10)",      "supplier_idx": 0, "cost":  28.0, "demand": 850, "code": "IGP-001"},
    {"name": "Metformin 1000mg Tablets (strip/10)",     "supplier_idx": 0, "cost":  45.0, "demand": 420, "code": "IGP-002"},
    {"name": "Glimepiride 2mg Tablets (strip/10)",      "supplier_idx": 0, "cost":  65.0, "demand": 310, "code": "IGP-003"},
    {"name": "Atorvastatin 10mg Tablets (strip/10)",    "supplier_idx": 0, "cost":  52.0, "demand": 380, "code": "IGP-004"},
    {"name": "Amlodipine 5mg Tablets (strip/10)",       "supplier_idx": 0, "cost":  38.0, "demand": 290, "code": "IGP-005"},

    # ── Cipara Life Sciences (indices 5-9) — Antibiotics & GI ───────────────
    # Amoxicillin + Azithromycin: two most prescribed antibiotics in India.
    # Pantoprazole/Omeprazole: consistently in India's top-10 by volume.
    {"name": "Amoxicillin 500mg Capsules (strip/10)",   "supplier_idx": 1, "cost":  72.0, "demand": 620, "code": "CLS-001"},
    {"name": "Azithromycin 500mg Tablets (strip/3)",    "supplier_idx": 1, "cost":  95.0, "demand": 380, "code": "CLS-002"},
    {"name": "Ciprofloxacin 500mg Tablets (strip/10)",  "supplier_idx": 1, "cost":  68.0, "demand": 290, "code": "CLS-003"},
    {"name": "Pantoprazole 40mg Tablets (strip/10)",    "supplier_idx": 1, "cost":  48.0, "demand": 510, "code": "CLS-004"},
    {"name": "Omeprazole 20mg Capsules (strip/10)",     "supplier_idx": 1, "cost":  35.0, "demand": 430, "code": "CLS-005"},

    # ── NorthIndia Generics (indices 10-14) — OTC & Fever Management ────────
    # Paracetamol 500mg is India's single highest-volume OTC drug.
    # Cetirizine/Montelukast spike during pollen and air-pollution seasons.
    {"name": "Paracetamol 500mg Tablets (strip/10)",    "supplier_idx": 2, "cost":  12.0, "demand": 2100, "code": "NIG-001"},
    {"name": "Paracetamol 650mg Tablets (strip/10)",    "supplier_idx": 2, "cost":  16.0, "demand": 1400, "code": "NIG-002"},
    {"name": "Ibuprofen 400mg Tablets (strip/10)",      "supplier_idx": 2, "cost":  22.0, "demand":  680, "code": "NIG-003"},
    {"name": "Cetirizine 10mg Tablets (strip/10)",      "supplier_idx": 2, "cost":  18.0, "demand":  550, "code": "NIG-004"},
    {"name": "Montelukast 10mg Tablets (strip/10)",     "supplier_idx": 2, "cost": 145.0, "demand":  220, "code": "NIG-005"},

    # ── BengalMed Formulations (indices 15-19) — Monsoon & Tropical ─────────
    # ORS is life-critical during flooding/cholera outbreaks (East India).
    # Doxycycline is first-line for leptospirosis and dengue co-infections.
    {"name": "Ondansetron 4mg Tablets (strip/10)",      "supplier_idx": 3, "cost":  55.0, "demand": 430, "code": "BMF-001"},
    {"name": "Doxycycline 100mg Capsules (strip/10)",   "supplier_idx": 3, "cost":  78.0, "demand": 310, "code": "BMF-002"},
    {"name": "Hydroxychloroquine 200mg Tablets (strip/10)", "supplier_idx": 3, "cost": 62.0, "demand": 180, "code": "BMF-003"},
    {"name": "Albendazole 400mg Tablets (strip/4)",     "supplier_idx": 3, "cost":  28.0, "demand": 350, "code": "BMF-004"},
    {"name": "ORS Powder Sachets (box/10)",             "supplier_idx": 3, "cost":  35.0, "demand": 780, "code": "BMF-005"},

    # ── SunCure Pharmaceuticals (indices 20-24) — Cardiac ───────────────────
    # India has the world's largest burden of heart disease.
    # Clopidogrel + Aspirin combo is mandatory post-cardiac-stent for 1 year.
    {"name": "Amlodipine 10mg Tablets (strip/10)",      "supplier_idx": 4, "cost":  58.0, "demand": 260, "code": "SCP-001"},
    {"name": "Losartan 50mg Tablets (strip/10)",        "supplier_idx": 4, "cost":  72.0, "demand": 340, "code": "SCP-002"},
    {"name": "Rosuvastatin 10mg Tablets (strip/10)",    "supplier_idx": 4, "cost":  88.0, "demand": 290, "code": "SCP-003"},
    {"name": "Clopidogrel 75mg Tablets (strip/10)",     "supplier_idx": 4, "cost": 125.0, "demand": 210, "code": "SCP-004"},
    {"name": "Aspirin 75mg Tablets (strip/14)",         "supplier_idx": 4, "cost":  22.0, "demand": 480, "code": "SCP-005"},
]

# ── Dates relative to today so the demo data is always current ───────────────
today = date.today()

# ── 12 pharma-specific disruptions — 9 active, 3 resolved ───────────────────
FIXED_DISRUPTIONS = [
    # ── 5 CRITICAL (active) ──────────────────────────────────────────────────
    {
        "supplier_id": S_CIPARA,
        "disruption_type": "regulatory",
        "severity": "critical",
        "title": "CDSCO quality recall — Amoxicillin batch contamination",
        "description": (
            "Central Drugs Standard Control Organisation issued an emergency batch recall "
            "after endotoxin contamination was detected in three Amoxicillin 500mg batches "
            "at Cipara Life Sciences' Ahmedabad unit. Entire lot quarantined. "
            "Plant-wide audit initiated — production suspended for minimum 14 days. "
            "National antibiotic shortage risk across 6 states."
        ),
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.93,
        "affected_skus_count": 3,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": S_CIPARA,
        "disruption_type": "raw_material",
        "severity": "critical",
        "title": "China API import restriction — Metformin & Ciprofloxacin API shortage",
        "description": (
            "Ministry of Commerce trade restrictions reduced China API import quota by 40%. "
            "Kandla China API Imports has declared force majeure. "
            "Metformin API stockpile covers only 11 days of production; Ciprofloxacin API "
            "exhausted in 7 days. Over 30 million diabetic patients face supply disruption. "
            "Alternate Singapore API route activated but 14-day lead time."
        ),
        "start_date": today - timedelta(days=3),
        "end_date": None,
        "impact_score": 0.91,
        "affected_skus_count": 4,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": S_NORTHINDIA,
        "disruption_type": "strike",
        "severity": "critical",
        "title": "Baddi Pharma SEZ workers strike — Paracetamol production halted",
        "description": (
            "Contract workers at Baddi Special Economic Zone declared an indefinite strike "
            "over minimum wage revision. NorthIndia Generics' Paracetamol 500mg and 650mg "
            "production lines stopped. "
            "Stockout risk in 5 days for Paracetamol 500mg — highest volume OTC drug in India. "
            "Emergency procurement from Himachal BioSynth initiated."
        ),
        "start_date": today - timedelta(days=2),
        "end_date": None,
        "impact_score": 0.88,
        "affected_skus_count": 5,
        "region": "North",
        "is_active": True,
    },
    {
        "supplier_id": S_INDIAGEN,
        "disruption_type": "flood",
        "severity": "critical",
        "title": "Hyderabad Pharma City flooding — Genome Valley API cluster disrupted",
        "description": (
            "Severe monsoon flooding across Genome Valley, Hyderabad has shut down "
            "8 API manufacturing units including Hyderabad API Industries. "
            "IndiaGen Pharma's primary API source is offline — Metformin and Atorvastatin "
            "API stock covers only 8 days. NDRF teams deployed. "
            "Estimated 10-14 day disruption. Ripple effect expected on Cipara Life Sciences "
            "which also sources from the same cluster."
        ),
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.89,
        "affected_skus_count": 5,
        "region": "South",
        "is_active": True,
    },
    {
        "supplier_id": S_BENGALMED,
        "disruption_type": "demand_spike",
        "severity": "critical",
        "title": "Monsoon outbreak — ORS, Doxycycline & Antibiotics demand up 240%",
        "description": (
            "Severe gastroenteritis and leptospirosis outbreak across East India following "
            "continuous monsoon flooding. ORS demand is 240% above baseline — stockout "
            "in 4 days. Doxycycline 100mg demand up 310% due to leptospirosis cases. "
            "West Bengal health department issued emergency procurement notice. "
            "BengalMed Formulations is the sole East India source for ORS Powder Sachets."
        ),
        "start_date": today - timedelta(days=1),
        "end_date": None,
        "impact_score": 0.86,
        "affected_skus_count": 4,
        "region": "East",
        "is_active": True,
    },

    # ── 2 HIGH (active) ───────────────────────────────────────────────────────
    {
        "supplier_id": S_CIPARA,
        "disruption_type": "infrastructure",
        "severity": "high",
        "title": "Gujarat API plant fire — Ciprofloxacin API stockpile destroyed",
        "description": (
            "Solvent fire at Ankleshwar chemical processing unit destroyed 3-month "
            "Ciprofloxacin API stockpile. Karnataka Active Pharma declared force majeure. "
            "Cipara Life Sciences has 12 days of Ciprofloxacin production remaining. "
            "Alternative API procurement from Singapore route — 14-day lead time. "
            "UTI and typhoid treatment protocols at risk in South and West India."
        ),
        "start_date": today - timedelta(days=4),
        "end_date": None,
        "impact_score": 0.79,
        "affected_skus_count": 2,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": S_BENGALMED,
        "disruption_type": "demand_spike",
        "severity": "high",
        "title": "Dengue season surge — Doxycycline demand 310% above baseline",
        "description": (
            "Dengue and scrub typhus cases up 180% across South and East India. "
            "Doxycycline 100mg is first-line treatment. Hospital procurement queues "
            "backed up 9 days. BengalMed Formulations' current stock covers 6 days. "
            "Ondansetron also spiking — dengue-related vomiting increases GI drug demand."
        ),
        "start_date": today - timedelta(days=5),
        "end_date": None,
        "impact_score": 0.74,
        "affected_skus_count": 3,
        "region": "East",
        "is_active": True,
    },

    # ── 2 MEDIUM (active) ─────────────────────────────────────────────────────
    {
        "supplier_id": S_SUNCURE,
        "disruption_type": "regulatory",
        "severity": "medium",
        "title": "WHO prequalification audit — Rosuvastatin export hold",
        "description": (
            "WHO inspection triggered by adverse event report. Rosuvastatin 10mg export "
            "to 4 African countries suspended pending re-audit of SunCure's Pune facility. "
            "Domestic supply unaffected. Export revenue at risk: ₹3.2Cr per month. "
            "Audit expected to conclude in 18 days."
        ),
        "start_date": today - timedelta(days=6),
        "end_date": None,
        "impact_score": 0.61,
        "affected_skus_count": 1,
        "region": "West",
        "is_active": True,
    },
    {
        "supplier_id": S_CIPARA,
        "disruption_type": "raw_material",
        "severity": "medium",
        "title": "Blister packaging film shortage — alu-alu foil unavailable",
        "description": (
            "Global aluminium foil supply crunch has made cold-form alu-alu packaging "
            "unavailable. Pune Foil Industries has a 3-week lead time extension. "
            "Moisture-sensitive drugs requiring alu-alu packs — Losartan 50mg, "
            "Clopidogrel 75mg — cannot be dispatched without compliant packaging. "
            "CDSCO regulations prohibit substitute packaging without new stability data."
        ),
        "start_date": today - timedelta(days=7),
        "end_date": None,
        "impact_score": 0.58,
        "affected_skus_count": 3,
        "region": "All India",
        "is_active": True,
    },

    # ── 3 LOW (resolved) ──────────────────────────────────────────────────────
    {
        "supplier_id": S_INDIAGEN,
        "disruption_type": "logistics",
        "severity": "low",
        "title": "Kandla port congestion — Chinese API import delayed 12 days [RESOLVED]",
        "description": (
            "Post-Golden Week Chinese shipping backlog delayed 47 API shipment containers "
            "at Kandla port. Affected Metformin and Ciprofloxacin production planning. "
            "Containers cleared and in transit. Safety stock buffer absorbed the delay."
        ),
        "start_date": today - timedelta(days=22),
        "end_date": today - timedelta(days=10),
        "impact_score": 0.28,
        "affected_skus_count": 2,
        "region": "West",
        "is_active": False,
    },
    {
        "supplier_id": S_BENGALMED,
        "disruption_type": "infrastructure",
        "severity": "low",
        "title": "Cold chain excursion — injectable API temperature breach [RESOLVED]",
        "description": (
            "Refrigeration failure during transit caused temperature excursion in one "
            "Ondansetron injectable batch. CDSCO quarantine issued. Batch destroyed "
            "and replaced from safety stock. Cold chain monitoring protocol upgraded."
        ),
        "start_date": today - timedelta(days=18),
        "end_date": today - timedelta(days=14),
        "impact_score": 0.21,
        "affected_skus_count": 1,
        "region": "East",
        "is_active": False,
    },
    {
        "supplier_id": S_NORTHINDIA,
        "disruption_type": "raw_material",
        "severity": "low",
        "title": "Excipient shortage — microcrystalline cellulose supply gap [RESOLVED]",
        "description": (
            "MCC (tablet binder/filler) shortage due to wood pulp price spike. "
            "Rajasthan Pharma Chem extended lead time by 8 days. "
            "NorthIndia Generics absorbed delay using existing excipient safety stock. "
            "Alternative excipient supplier (dicalcium phosphate) qualified as backup."
        ),
        "start_date": today - timedelta(days=25),
        "end_date": today - timedelta(days=17),
        "impact_score": 0.19,
        "affected_skus_count": 2,
        "region": "North",
        "is_active": False,
    },
]

# ── Disease-season demand calendar ───────────────────────────────────────────
# Replaces festival_calendar with medically meaningful demand windows.
# Table schema is identical — same fields, pharma-relevant data.
# Procurement officers plan for these exactly like festive seasons in FMCG.
SEASON_DATA = [
    {
        "name": "Monsoon Disease Season",
        "start": "2025-06-01",
        "end":   "2025-09-30",
        "region": "East,South,Central",
        "multiplier": 2.3,
        "categories": "Antibiotics,Antiparasitics,ORS,Antiemetics,Antifungals",
        "lead_days": 21,
    },
    {
        "name": "Flu & Respiratory Season",
        "start": "2025-10-01",
        "end":   "2026-02-28",
        "region": "All India",
        "multiplier": 1.9,
        "categories": "Paracetamol,Antihistamines,Antibiotics,Bronchodilators",
        "lead_days": 14,
    },
    {
        "name": "Dengue & Vector Season",
        "start": "2025-08-01",
        "end":   "2025-11-30",
        "region": "South,East",
        "multiplier": 2.1,
        "categories": "Doxycycline,Paracetamol,Antiemetics,Platelet boosters",
        "lead_days": 14,
    },
    {
        "name": "Summer Heat Season",
        "start": "2026-03-15",
        "end":   "2026-05-31",
        "region": "North,Central,West",
        "multiplier": 1.7,
        "categories": "ORS,Antidiarrheals,Electrolytes,Antifungals",
        "lead_days": 14,
    },
    {
        "name": "Govt Q4 Procurement Cycle",
        "start": "2026-01-01",
        "end":   "2026-03-31",
        "region": "All India",
        "multiplier": 1.6,
        "categories": "All Generics",
        "lead_days": 30,
    },
    {
        "name": "Chronic Disease Awareness Month",
        "start": "2025-11-01",
        "end":   "2025-11-30",
        "region": "All India",
        "multiplier": 1.4,
        "categories": "Metformin,Statins,Antihypertensives,Cardiac",
        "lead_days": 14,
    },
]

# ── Action cards (12 total — 8 pending, 4 resolved) ──────────────────────────
ACTION_CARDS = [
    # 8 PENDING
    {
        "type": "switch_supplier",  "priority": "critical",
        "supplier_idx": 1, "sku_idx": 0,  "impact": 4200000,
        "title": "Activate Singapore API route — Metformin API 11 days remaining",
        "desc":  "China API restriction leaves 11 days of Metformin production. "
                 "Activate Singapore API Direct (14-day lead). Coordinate with "
                 "Aurobio Pharma Generics for emergency Metformin supply.",
    },
    {
        "type": "reorder",          "priority": "critical",
        "supplier_idx": 1, "sku_idx": 5,  "impact": 3800000,
        "title": "Emergency reorder: Amoxicillin 500mg — CDSCO recall depletes stock",
        "desc":  "CDSCO recall quarantined entire Amoxicillin inventory at Cipara. "
                 "Switch to Western API Solutions immediately. Shortage affects "
                 "post-surgery antibiotic protocols across 6 states.",
    },
    {
        "type": "expedite",         "priority": "critical",
        "supplier_idx": 2, "sku_idx": 10, "impact": 2900000,
        "title": "Expedite Paracetamol 500mg — Baddi strike, stockout in 5 days",
        "desc":  "NorthIndia Generics production halted by SEZ strike. "
                 "Activate Himachal BioSynth emergency supply. "
                 "Paracetamol is India's highest-volume OTC — 5-day stockout is unacceptable.",
    },
    {
        "type": "reorder",          "priority": "critical",
        "supplier_idx": 3, "sku_idx": 19, "impact": 1850000,
        "title": "Emergency reorder: ORS Sachets — monsoon outbreak, 4-day stockout",
        "desc":  "240% demand spike from East India gastroenteritis outbreak. "
                 "BengalMed ORS stock covers 4 days only. "
                 "Life-critical drug — activate Eastern Formulations and government buffer stocks.",
    },
    {
        "type": "switch_supplier",  "priority": "high",
        "supplier_idx": 1, "sku_idx": 7,  "impact": 1650000,
        "title": "Switch API source: Ciprofloxacin — Gujarat plant fire destroyed stockpile",
        "desc":  "Karnataka Active Pharma force majeure. 12 days production remaining. "
                 "Activate Singapore API Direct for Ciprofloxacin API. "
                 "UTI and typhoid treatment at risk in West and South India.",
    },
    {
        "type": "expedite",         "priority": "high",
        "supplier_idx": 3, "sku_idx": 16, "impact": 980000,
        "title": "Expedite Doxycycline 100mg — dengue season demand 310% above baseline",
        "desc":  "Hospital procurement queues backed up 9 days. "
                 "BengalMed stock covers 6 days. Eastern Formulations activated as backup. "
                 "Coordinate with West Bengal health department for government supply.",
    },
    {
        "type": "increase_safety_stock", "priority": "medium",
        "supplier_idx": 4, "sku_idx": 22, "impact": 620000,
        "title": "Pre-position Rosuvastatin stock — WHO audit export hold, 18 days",
        "desc":  "SunCure WHO audit suspends Rosuvastatin export revenue. "
                 "Increase domestic safety stock buffer to protect hospital supply chains "
                 "during audit period. Nashik Pharma Corp qualified as backup.",
    },
    {
        "type": "reorder",          "priority": "medium",
        "supplier_idx": 1, "sku_idx": 21, "impact": 540000,
        "title": "Reorder Losartan 50mg — alu-alu foil shortage blocks packaging",
        "desc":  "Pune Foil Industries 3-week lead extension means Losartan cannot be "
                 "dispatched without compliant cold-form packaging. "
                 "Pre-position unpackaged bulk and procure foil via Mumbai spot market.",
    },

    # 4 RESOLVED
    {
        "type": "reorder",          "priority": "low",
        "supplier_idx": 0, "sku_idx": 1,  "impact": 280000,
        "title": "Reorder Metformin 1000mg — Kandla port delay absorbed [RESOLVED]",
        "desc":  "12-day port delay cleared. Safety stock buffer was sufficient. "
                 "Shipment delivered. No patient impact.",
        "resolved": True,
    },
    {
        "type": "expedite",         "priority": "low",
        "supplier_idx": 3, "sku_idx": 15, "impact": 195000,
        "title": "Ondansetron injectable — cold chain breach quarantined [RESOLVED]",
        "desc":  "Quarantined batch replaced from safety stock. "
                 "Cold chain protocol upgraded. CDSCO clearance obtained.",
        "resolved": True,
    },
    {
        "type": "increase_safety_stock", "priority": "medium",
        "supplier_idx": 2, "sku_idx": 10, "impact": 320000,
        "title": "Paracetamol safety stock — MCC excipient gap mitigated [RESOLVED]",
        "desc":  "Rajasthan Pharma Chem lead extension absorbed by existing MCC stock. "
                 "DCP backup supplier qualified. Production uninterrupted.",
        "resolved": True,
    },
    {
        "type": "switch_supplier",  "priority": "low",
        "supplier_idx": 4, "sku_idx": 24, "impact": 145000,
        "title": "Aspirin 75mg — secondary packaging carton shortage resolved [RESOLVED]",
        "desc":  "Delhi Medical Pack supply gap resolved via Mumbai spot procurement. "
                 "Dual-supplier agreement signed for carton supply continuity.",
        "resolved": True,
    },
]


async def seed_database():
    """Drop all tables, recreate, and seed with deterministic pharma data."""
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

        # ── [1/8] Suppliers ──────────────────────────────────────────────────
        print("[1/8] Seeding 21 pharmaceutical suppliers...")
        for s in SUPPLIERS:
            session.add(Supplier(**s))
        await session.commit()

        # ── [2/8] API + Packaging dependencies (cascade graph) ───────────────
        # This is the heart of the cascade engine:
        #   API Supplier → Formulation Plant (high criticality)
        #   Packaging Supplier → Formulation Plant (medium criticality)
        # When Hyderabad floods → Hyderabad API Industries goes down →
        # IndiaGen AND Cipara both lose their primary API source simultaneously.
        print("[2/8] Seeding API → Manufacturer dependency graph...")
        deps = [
            # IndiaGen ← Hyderabad API (primary, very high criticality)
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[5],  "dependency_type": "raw_material", "criticality": 0.95},
            # IndiaGen ← Kandla China API (secondary import route, high criticality)
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[6],  "dependency_type": "raw_material", "criticality": 0.82},
            # IndiaGen ← MumbaiPack (blister packaging)
            {"supplier_id": SUPPLIER_IDS[0], "depends_on_id": SUPPLIER_IDS[10], "dependency_type": "packaging",    "criticality": 0.70},

            # Cipara ← Karnataka Active Pharma (primary API)
            {"supplier_id": SUPPLIER_IDS[1], "depends_on_id": SUPPLIER_IDS[7],  "dependency_type": "raw_material", "criticality": 0.88},
            # Cipara ← Hyderabad API (secondary API — same cluster as IndiaGen!)
            {"supplier_id": SUPPLIER_IDS[1], "depends_on_id": SUPPLIER_IDS[5],  "dependency_type": "raw_material", "criticality": 0.75},
            # Cipara ← Gujarat Pharma Pack (HDPE bottles)
            {"supplier_id": SUPPLIER_IDS[1], "depends_on_id": SUPPLIER_IDS[11], "dependency_type": "packaging",    "criticality": 0.65},

            # NorthIndia ← Rajasthan Pharma Chem (excipients + API)
            {"supplier_id": SUPPLIER_IDS[2], "depends_on_id": SUPPLIER_IDS[9],  "dependency_type": "raw_material", "criticality": 0.80},
            # NorthIndia ← Delhi Medical Pack (cartons + inserts)
            {"supplier_id": SUPPLIER_IDS[2], "depends_on_id": SUPPLIER_IDS[14], "dependency_type": "packaging",    "criticality": 0.72},

            # BengalMed ← Bengal Chemical Works (primary API)
            {"supplier_id": SUPPLIER_IDS[3], "depends_on_id": SUPPLIER_IDS[8],  "dependency_type": "raw_material", "criticality": 0.91},
            # BengalMed ← MumbaiPack (packaging — long route but best option)
            {"supplier_id": SUPPLIER_IDS[3], "depends_on_id": SUPPLIER_IDS[10], "dependency_type": "packaging",    "criticality": 0.62},

            # SunCure ← Pune Foil Industries (alu-alu foil for cardiac drugs)
            {"supplier_id": SUPPLIER_IDS[4], "depends_on_id": SUPPLIER_IDS[13], "dependency_type": "packaging",    "criticality": 0.85},
            # SunCure ← Hyderabad API (cardiac API)
            {"supplier_id": SUPPLIER_IDS[4], "depends_on_id": SUPPLIER_IDS[5],  "dependency_type": "raw_material", "criticality": 0.78},
        ]
        for dep in deps:
            session.add(SupplierDependency(id=uuid.uuid4(), **dep))
        await session.commit()

        # ── [3/8] Drug SKUs ──────────────────────────────────────────────────
        print("[3/8] Seeding 25 drug SKUs...")
        sku_ids: list[uuid.UUID] = []

        # Stock coverage calibrated to current disruption context (days of stock):
        # Cipara (1): ~3-6 days — recall + API shortage leave minimal inventory
        # NorthIndia (2): ~2-4 days — strike halted production
        # BengalMed (3): ~1-3 days — monsoon demand surge consuming stock rapidly
        # IndiaGen (0): ~5-8 days — flooding cuts API, stock depleting
        # SunCure (4): ~9-18 days — stable, WHO audit is export not production issue
        STOCK_COVER = {
            3: (1.0, 3.0),   # BengalMed — near stockout (monsoon outbreak)
            2: (2.0, 4.0),   # NorthIndia — very low (strike)
            1: (3.0, 6.0),   # Cipara — critical (recall + API shortage)
            0: (5.0, 8.0),   # IndiaGen — low (flooding disrupts API supply)
            4: (9.0, 18.0),  # SunCure — normal (production unaffected)
        }
        for tmpl in SKU_TEMPLATES:
            supplier_id = SUPPLIER_IDS[tmpl["supplier_idx"]]
            sku_id = uuid.UUID(f"10000000-0000-0000-0000-{str(len(sku_ids)+1).zfill(12)}")
            sku_ids.append(sku_id)
            demand = tmpl["demand"]
            lo, hi = STOCK_COVER.get(tmpl["supplier_idx"], (8.0, 20.0))
            stock  = int(demand * rng.uniform(lo, hi))
            # A drug SKU is "critical" if high demand volume OR high unit cost.
            # High demand → stockout harms many patients.
            # High cost → financial exposure is large.
            is_critical = demand > 300 or tmpl["cost"] > 100
            session.add(SKU(
                id=sku_id,
                sku_code=tmpl["code"],
                name=tmpl["name"],
                category="Pharmaceutical",
                subcategory="Generic Medicine",
                supplier_id=supplier_id,
                unit_cost_inr=tmpl["cost"],
                current_stock=stock,
                reorder_point=demand * 7,    # 7-day reorder point (pharma standard)
                safety_stock=demand * 4,     # 4-day safety stock minimum
                daily_demand_avg=demand,
                is_critical=is_critical,
            ))
        await session.commit()

        # ── [4/8] 90-day delivery history ────────────────────────────────────
        print("[4/8] Seeding 90-day delivery history (deterministic, seed=42)...")
        # Delivery delay distributions reflect real pharma supply chain patterns.
        # Chinese API imports (Kandla) have the highest variance — 35% late rate.
        # Domestic suppliers are more reliable but still face monsoon/strike delays.
        HIGH_RISK_IDS = {SUPPLIER_IDS[1], SUPPLIER_IDS[2]}  # Cipara (recall), NorthIndia (strike)
        MED_RISK_IDS  = {SUPPLIER_IDS[0], SUPPLIER_IDS[3]}  # IndiaGen (flood), BengalMed (surge)
        tier1_suppliers = SUPPLIERS[:5]

        for day_offset in range(90):
            delivery_date = today - timedelta(days=day_offset)
            for _ in range(rng.randint(3, 5)):
                supplier = rng.choice(tier1_suppliers)
                sku_id   = rng.choice(sku_ids)
                lead     = supplier["lead_time_days"]
                sid      = supplier["id"]

                if sid in HIGH_RISK_IDS:
                    # Cipara / NorthIndia: frequent severe delays
                    delay = max(0, rng.choices([0,1,2,3,5,8,12], weights=[10,12,18,22,18,12,8])[0])
                elif sid in MED_RISK_IDS:
                    # IndiaGen / BengalMed: moderate delays (monsoon exposure)
                    delay = max(0, rng.choices([0,1,2,3,5,8,12], weights=[28,18,20,16,10,6,2])[0])
                else:
                    # SunCure: mostly on-time, good QA record
                    delay = max(0, rng.choices([0,1,2,3,5,8,12], weights=[55,20,12,7,4,2,0])[0])

                qty_ordered   = rng.randint(100, 500)
                qty_delivered = qty_ordered if delay < 3 else int(qty_ordered * rng.uniform(0.70, 0.95))
                # Pharma SLA penalties are typically 0.5-2% of order value per day
                # At ₹5/unit/day (our updated rate) this is realistic for generics
                penalty = delay * rng.uniform(300, 1500) if delay > 2 else 0.0
                status  = "delivered" if delay == 0 else ("delayed" if delay <= 3 else "partial")
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

        # ── [5/8] 12 pharma disruptions ──────────────────────────────────────
        print("[5/8] Seeding 12 pharma disruptions (9 active · 3 resolved)...")
        for d in FIXED_DISRUPTIONS:
            session.add(Disruption(id=uuid.uuid4(), **d))
        await session.commit()

        # ── [6/8] 30-day risk snapshots ───────────────────────────────────────
        print("[6/8] Seeding 30-day risk snapshot history...")
        # Base risk scores calibrated to current disruption context.
        # Cipara and NorthIndia are in critical territory (recall + strike).
        # IndiaGen and BengalMed are high risk (flood + demand surge).
        # SunCure is medium — WHO audit is export-only, not a production risk.
        base_risks = {
            SUPPLIER_IDS[0]: 0.81,   # IndiaGen — high (Hyderabad flooding)
            SUPPLIER_IDS[1]: 0.91,   # Cipara — critical (CDSCO recall + API shortage)
            SUPPLIER_IDS[2]: 0.87,   # NorthIndia — critical (Baddi strike)
            SUPPLIER_IDS[3]: 0.77,   # BengalMed — high (monsoon + dengue surge)
            SUPPLIER_IDS[4]: 0.55,   # SunCure — medium (WHO audit, stable ops)
        }
        for supplier in SUPPLIERS[:5]:
            sid     = supplier["id"]
            current = base_risks.get(sid, 0.50)
            for day_offset in range(30, -1, -1):
                snap_date = today - timedelta(days=day_offset)
                current   = max(0.05, min(0.97, current + rng.uniform(-0.04, 0.04)))
                # Thresholds now match the fixed risk_engine.py (critical≥0.80)
                rl = (
                    "critical" if current >= 0.80 else
                    "high"     if current >= 0.60 else
                    "medium"   if current >= 0.40 else
                    "low"
                )
                session.add(RiskSnapshot(
                    id=uuid.uuid4(),
                    supplier_id=sid,
                    risk_score=round(current, 3),
                    risk_level=rl,
                    factors=(
                        f"reliability:{supplier['reliability_score']},"
                        f"zone:{supplier['risk_zone'] or 'none'}"
                    ),
                    stockout_probability=round(current * rng.uniform(0.35, 0.65), 3),
                    days_of_stock=rng.randint(3, 35),
                    snapshot_at=datetime.combine(snap_date, datetime.min.time()),
                ))
        await session.commit()

        # ── [7/8] Alternate supplier mappings ────────────────────────────────
        print("[7/8] Seeding alternate supplier mappings...")
        # Each drug SKU maps to 1-2 backup manufacturers.
        # Cost premium and quality scores reflect real market dynamics:
        # - Singapore API route: premium ~22% but non-China (strategic value)
        # - Regional backup manufacturers: 6-15% premium, slightly longer lead time
        alt_map = {
            # IndiaGen SKUs (0-4) → Aurobio Pharma (15) + Singapore API (20)
            0: [SUPPLIER_IDS[15], SUPPLIER_IDS[20]],
            1: [SUPPLIER_IDS[15], SUPPLIER_IDS[20]],
            2: [SUPPLIER_IDS[15]],
            3: [SUPPLIER_IDS[15]],
            4: [SUPPLIER_IDS[15]],
            # Cipara SKUs (5-9) → Western API Solutions (16) + Singapore API (20)
            5:  [SUPPLIER_IDS[16], SUPPLIER_IDS[20]],
            6:  [SUPPLIER_IDS[16], SUPPLIER_IDS[20]],
            7:  [SUPPLIER_IDS[16]],
            8:  [SUPPLIER_IDS[16]],
            9:  [SUPPLIER_IDS[16]],
            # NorthIndia SKUs (10-14) → Himachal BioSynth (17)
            10: [SUPPLIER_IDS[17]],
            11: [SUPPLIER_IDS[17]],
            12: [SUPPLIER_IDS[17]],
            13: [SUPPLIER_IDS[17]],
            14: [SUPPLIER_IDS[17]],
            # BengalMed SKUs (15-19) → Eastern Formulations (18)
            15: [SUPPLIER_IDS[18]],
            16: [SUPPLIER_IDS[18]],
            17: [SUPPLIER_IDS[18]],
            18: [SUPPLIER_IDS[18]],
            19: [SUPPLIER_IDS[18]],
            # SunCure SKUs (20-24) → Nashik Pharma Corp (19)
            20: [SUPPLIER_IDS[19]],
            21: [SUPPLIER_IDS[19]],
            22: [SUPPLIER_IDS[19]],
            23: [SUPPLIER_IDS[19]],
            24: [SUPPLIER_IDS[19]],
        }
        alt_attrs = {
            SUPPLIER_IDS[15]: {"cost_prem": 8.5,  "quality": 0.88, "lead_delta": +1},  # Aurobio
            SUPPLIER_IDS[16]: {"cost_prem": 11.0, "quality": 0.82, "lead_delta": +1},  # Western API
            SUPPLIER_IDS[17]: {"cost_prem": 9.0,  "quality": 0.80, "lead_delta": +1},  # Himachal
            SUPPLIER_IDS[18]: {"cost_prem": 13.0, "quality": 0.79, "lead_delta": +2},  # Eastern
            SUPPLIER_IDS[19]: {"cost_prem": 6.5,  "quality": 0.84, "lead_delta": +1},  # Nashik
            SUPPLIER_IDS[20]: {"cost_prem": 22.0, "quality": 0.91, "lead_delta": +8},  # Singapore API — premium but non-China
        }
        for sku_idx, alt_ids in alt_map.items():
            if sku_idx >= len(sku_ids):
                continue
            sku_id       = sku_ids[sku_idx]
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

        # ── [8/8] Action cards ────────────────────────────────────────────────
        print("[8/8] Seeding 12 action cards (8 pending · 4 resolved)...")
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

        # ── Disease season calendar ───────────────────────────────────────────
        print("[+] Seeding disease season demand calendar (6 entries)...")
        for s in SEASON_DATA:
            session.add(FestivalCalendar(
                id=uuid.uuid4(),
                name=s["name"],
                start_date=date.fromisoformat(s["start"]),
                end_date=date.fromisoformat(s["end"]),
                region=s["region"],
                demand_multiplier=s["multiplier"],
                affected_categories=s["categories"],
                procurement_lead_days=s["lead_days"],
            ))
        await session.commit()

    await engine.dispose()
    print("\n✓ SupplySense Pharmaceutical database seeded successfully!")
    print(f"  - 5  Tier-1 pharma manufacturers (IndiaGen · Cipara · NorthIndia · BengalMed · SunCure)")
    print(f"  - 5  Tier-2 API suppliers         (Hyderabad · Kandla China · Karnataka · Bengal · Rajasthan)")
    print(f"  - 5  Tier-2 packaging suppliers   (MumbaiPack · Gujarat · Chennai · Pune Foil · Delhi)")
    print(f"  - 6  Alternate suppliers           (Aurobio · Western API · Himachal · Eastern · Nashik · Singapore)")
    print(f"  - 25 drug SKUs                     (5 per manufacturer, 5 therapeutic categories)")
    print(f"  - 12 pharma disruptions            (5 critical · 2 high · 2 medium · 3 resolved)")
    print(f"  - ~360 delivery records            (90-day deterministic history, seed=42)")
    print(f"  - 155 risk snapshots               (31 days × 5 manufacturers)")
    print(f"  - 12 action cards                  (8 pending · 4 resolved)")
    print(f"  - 6  disease season entries        (monsoon · flu · dengue · summer · govt · chronic)")


if __name__ == "__main__":
    asyncio.run(seed_database())
