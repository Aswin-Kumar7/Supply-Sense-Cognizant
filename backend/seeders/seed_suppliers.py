"""
Pharmaceutical-sector supplier data for SupplySense.

21 suppliers total:
  - 5  Tier-1  Pharma Manufacturers    (the main formulation plants)
  - 5  Tier-2  API Suppliers           (Active Pharmaceutical Ingredient sources)
  - 5  Tier-2  Packaging / Excipient   (blister foil, bottles, cartons, excipients)
  - 6  Alternate Suppliers             (backup manufacturers + non-China API route)

Sector rationale:
  India is the world's pharmacy — supplying 20% of global generic medicines.
  The supply chain follows a clean cascade: API Supplier → Formulation Plant
  → Packaging → QA/QC → Distributor → Hospital/Pharmacy.
  One API shortage propagates through multiple drug formulations simultaneously,
  making cascade analysis directly and visibly valuable.
"""

import uuid

# Deterministic UUIDs for referential integrity across seeders
SUPPLIER_IDS = [
    uuid.UUID(f"00000000-0000-0000-0000-{str(i).zfill(12)}")
    for i in range(1, 22)
]

SUPPLIERS = [
    # ────────────────────────────────────────────────────────────────────────
    # TIER 1 — 5 Pharma Manufacturers  (indices 0-4)
    # India's pharmaceutical manufacturing belt: Hyderabad → Ahmedabad → Baddi
    # → Kolkata → Pune corridor.
    # ────────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[0],
        "name": "IndiaGen Pharma Ltd",
        "city": "Hyderabad", "state": "Telangana", "region": "South",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.83,
        "lead_time_days": 6,
        "risk_zone": "flood_prone",           # Genome Valley is flood-prone
        "latitude": 17.447, "longitude": 78.349,
    },
    {
        "id": SUPPLIER_IDS[1],
        "name": "Cipara Life Sciences",
        "city": "Ahmedabad", "state": "Gujarat", "region": "West",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.56,            # Lowered: CDSCO recall + API shortage
        "lead_time_days": 5,
        "risk_zone": "cyclone_coastal",
        "latitude": 23.033, "longitude": 72.585,
    },
    {
        "id": SUPPLIER_IDS[2],
        "name": "NorthIndia Generics",
        "city": "Baddi", "state": "Himachal Pradesh", "region": "North",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.60,            # Lowered: Baddi SEZ strike history
        "lead_time_days": 7,
        "risk_zone": "strike_prone",          # Pharma SEZ labour disputes
        "latitude": 30.960, "longitude": 76.790,
    },
    {
        "id": SUPPLIER_IDS[3],
        "name": "BengalMed Formulations",
        "city": "Kolkata", "state": "West Bengal", "region": "East",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.68,            # Moderate: flood zone + seasonal demand spikes
        "lead_time_days": 9,
        "risk_zone": "flood_prone",
        "latitude": 22.572, "longitude": 88.363,
    },
    {
        "id": SUPPLIER_IDS[4],
        "name": "SunCure Pharmaceuticals",
        "city": "Pune", "state": "Maharashtra", "region": "West",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.85,            # Stable: cardiac specialist, good QA record
        "lead_time_days": 4,
        "risk_zone": None,
        "latitude": 18.520, "longitude": 73.856,
    },

    # ────────────────────────────────────────────────────────────────────────
    # TIER 2 — API Suppliers  (indices 5-9)
    # Active Pharmaceutical Ingredient is the actual drug molecule.
    # India's API hubs: Hyderabad (Genome Valley), Ankleshwar (Gujarat),
    # Kolkata (traditional), Bangalore. China supplies ~70% of Indian APIs.
    # ────────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[5],
        "name": "Hyderabad API Industries",      # IndiaGen + Cipara source
        "city": "Hyderabad", "state": "Telangana", "region": "South",
        "category": "API Supplier", "tier": 2,
        "reliability_score": 0.88, "lead_time_days": 4,
        "risk_zone": "flood_prone",
        "latitude": 17.385, "longitude": 78.486,
    },
    {
        "id": SUPPLIER_IDS[6],
        "name": "Kandla China API Imports",      # Primary China API gateway
        "city": "Kandla", "state": "Gujarat", "region": "West",
        "category": "API Supplier", "tier": 2,
        "reliability_score": 0.61,              # Low: import dependency + port delays
        "lead_time_days": 18,                   # Long: sea freight from China
        "risk_zone": "cyclone_coastal",
        "latitude": 23.033, "longitude": 70.208,
    },
    {
        "id": SUPPLIER_IDS[7],
        "name": "Karnataka Active Pharma",       # Cipara's secondary API source
        "city": "Bangalore", "state": "Karnataka", "region": "South",
        "category": "API Supplier", "tier": 2,
        "reliability_score": 0.84, "lead_time_days": 5,
        "risk_zone": None,
        "latitude": 12.971, "longitude": 77.594,
    },
    {
        "id": SUPPLIER_IDS[8],
        "name": "Bengal Chemical Works",         # BengalMed's API source
        "city": "Kolkata", "state": "West Bengal", "region": "East",
        "category": "API Supplier", "tier": 2,
        "reliability_score": 0.70, "lead_time_days": 8,
        "risk_zone": "flood_prone",
        "latitude": 22.559, "longitude": 88.340,
    },
    {
        "id": SUPPLIER_IDS[9],
        "name": "Rajasthan Pharma Chem",         # NorthIndia's excipient + API
        "city": "Jaipur", "state": "Rajasthan", "region": "North",
        "category": "API Supplier", "tier": 2,
        "reliability_score": 0.86, "lead_time_days": 6,
        "risk_zone": None,
        "latitude": 26.912, "longitude": 75.787,
    },

    # ────────────────────────────────────────────────────────────────────────
    # TIER 2 — Packaging & Excipient Suppliers  (indices 10-14)
    # Pharma packaging is highly regulated (blister packs, child-proof bottles,
    # tamper-evident seals). Excipients are the non-drug ingredients in tablets.
    # ────────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[10],
        "name": "MumbaiPack Pharma",             # Blister foil + PVC films
        "city": "Mumbai", "state": "Maharashtra", "region": "West",
        "category": "Pharma Packaging", "tier": 2,
        "reliability_score": 0.91, "lead_time_days": 3,
        "risk_zone": "cyclone_coastal",
        "latitude": 19.076, "longitude": 72.877,
    },
    {
        "id": SUPPLIER_IDS[11],
        "name": "Gujarat Pharma Pack",           # HDPE bottles + caps
        "city": "Ahmedabad", "state": "Gujarat", "region": "West",
        "category": "Pharma Packaging", "tier": 2,
        "reliability_score": 0.80, "lead_time_days": 4,
        "risk_zone": "cyclone_coastal",
        "latitude": 23.022, "longitude": 72.571,
    },
    {
        "id": SUPPLIER_IDS[12],
        "name": "Chennai Excipients Ltd",        # Lactose, microcrystalline cellulose
        "city": "Chennai", "state": "Tamil Nadu", "region": "South",
        "category": "Pharma Packaging", "tier": 2,
        "reliability_score": 0.76, "lead_time_days": 6,
        "risk_zone": "cyclone_coastal",
        "latitude": 13.082, "longitude": 80.270,
    },
    {
        "id": SUPPLIER_IDS[13],
        "name": "Pune Foil Industries",          # Alu-alu cold-form foil for sensitive drugs
        "city": "Pune", "state": "Maharashtra", "region": "West",
        "category": "Pharma Packaging", "tier": 2,
        "reliability_score": 0.87, "lead_time_days": 3,
        "risk_zone": None,
        "latitude": 18.516, "longitude": 73.856,
    },
    {
        "id": SUPPLIER_IDS[14],
        "name": "Delhi Medical Pack",            # Cartons, package inserts, secondary packaging
        "city": "New Delhi", "state": "Delhi", "region": "North",
        "category": "Pharma Packaging", "tier": 2,
        "reliability_score": 0.78, "lead_time_days": 5,
        "risk_zone": "strike_prone",
        "latitude": 28.613, "longitude": 77.209,
    },

    # ────────────────────────────────────────────────────────────────────────
    # ALTERNATE SUPPLIERS  (indices 15-20)
    # Backup manufacturers and non-China API import route.
    # ────────────────────────────────────────────────────────────────────────

    # — Alt for IndiaGen Pharma (South — diabetes/cardiac) ——
    {
        "id": SUPPLIER_IDS[15],
        "name": "Aurobio Pharma Generics",
        "city": "Visakhapatnam", "state": "Andhra Pradesh", "region": "South",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.88, "lead_time_days": 7,
        "risk_zone": "cyclone_coastal",
        "latitude": 17.686, "longitude": 83.218,
    },

    # — Alt for Cipara Life Sciences (West — antibiotics) ——
    {
        "id": SUPPLIER_IDS[16],
        "name": "Western API Solutions",
        "city": "Surat", "state": "Gujarat", "region": "West",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.82, "lead_time_days": 6,
        "risk_zone": "cyclone_coastal",
        "latitude": 21.170, "longitude": 72.831,
    },

    # — Alt for NorthIndia Generics (North — OTC/fever) ——
    {
        "id": SUPPLIER_IDS[17],
        "name": "Himachal BioSynth",
        "city": "Paonta Sahib", "state": "Himachal Pradesh", "region": "North",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.80, "lead_time_days": 8,
        "risk_zone": None,
        "latitude": 30.432, "longitude": 77.624,
    },

    # — Alt for BengalMed Formulations (East — tropical/monsoon) ——
    {
        "id": SUPPLIER_IDS[18],
        "name": "Eastern Formulations",
        "city": "Bhubaneswar", "state": "Odisha", "region": "East",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.79, "lead_time_days": 10,
        "risk_zone": "cyclone_coastal",
        "latitude": 20.296, "longitude": 85.824,
    },

    # — Alt for SunCure Pharmaceuticals (West — cardiac) ——
    {
        "id": SUPPLIER_IDS[19],
        "name": "Nashik Pharma Corp",
        "city": "Nashik", "state": "Maharashtra", "region": "West",
        "category": "Pharmaceutical", "tier": 1,
        "reliability_score": 0.84, "lead_time_days": 5,
        "risk_zone": None,
        "latitude": 19.997, "longitude": 73.789,
    },

    # — Non-China API import route (Singapore → Chennai port) ——
    {
        "id": SUPPLIER_IDS[20],
        "name": "Singapore API Direct",
        "city": "Chennai", "state": "Tamil Nadu", "region": "South",
        "category": "API Supplier", "tier": 1,
        "reliability_score": 0.91, "lead_time_days": 14,
        "risk_zone": "cyclone_coastal",         # Chennai port, cyclone exposure
        "latitude": 13.082, "longitude": 80.270,
    },
]
