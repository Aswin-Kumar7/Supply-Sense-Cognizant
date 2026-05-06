"""
FMCG-focused synthetic supplier data for SupplySense.
23 suppliers total:
  - 5 Tier-1 FMCG companies  (the main vendors)
  - 10 Tier-2 suppliers       (2 per Tier-1: packaging + raw material)
  - 8 Alternate suppliers     (dedicated alternates per vendor for demo page)
"""

import uuid

# Deterministic UUIDs for referential integrity
SUPPLIER_IDS = [
    uuid.UUID(f"00000000-0000-0000-0000-{str(i).zfill(12)}")
    for i in range(1, 24)
]

SUPPLIERS = [
    # ────────────────────────────────────────────────────────────────────
    # TIER 1 — 5 Main FMCG vendors  (indices 0-4)
    # ────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[0],
        "name": "Bharat FMCG Industries",
        "city": "Mumbai", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.87, "lead_time_days": 5,
        "risk_zone": "cyclone_coastal",
        "latitude": 19.076, "longitude": 72.877,
    },
    {
        "id": SUPPLIER_IDS[1],
        "name": "Sunrise Consumer Products",
        "city": "Chennai", "state": "Tamil Nadu", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.52,  # Lowered — cyclone + flood history = very poor delivery
        "lead_time_days": 7,
        "risk_zone": "cyclone_coastal",
        "latitude": 13.082, "longitude": 80.270,
    },
    {
        "id": SUPPLIER_IDS[2],
        "name": "GreenLeaf Agro Processing",
        "city": "Kolkata", "state": "West Bengal", "region": "East",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.62,  # Lowered — flood zone + regulatory disruption
        "lead_time_days": 8,
        "risk_zone": "flood_prone",
        "latitude": 22.572, "longitude": 88.363,
    },
    {
        "id": SUPPLIER_IDS[3],
        "name": "PureFarm Naturals",
        "city": "Ahmedabad", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.64,  # Lowered — GMP audit failure + cyclone zone
        "lead_time_days": 6,
        "risk_zone": "cyclone_coastal",
        "latitude": 23.022, "longitude": 72.571,
    },
    {
        "id": SUPPLIER_IDS[4],
        "name": "NorthStar Essentials",
        "city": "New Delhi", "state": "Delhi", "region": "North",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.55,  # Lowered — strike zone, transport blocked
        "lead_time_days": 4,
        "risk_zone": "strike_prone",
        "latitude": 28.613, "longitude": 77.209,
    },

    # ────────────────────────────────────────────────────────────────────
    # TIER 2 — Packaging + Raw Material for each Tier-1  (indices 5-14)
    # ────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[5],
        "name": "PackRight Solutions",                  # Bharat FMCG – packaging
        "city": "Mumbai", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.88, "lead_time_days": 3,
        "risk_zone": None, "latitude": 19.033, "longitude": 73.029,
    },
    {
        "id": SUPPLIER_IDS[6],
        "name": "Gujarat Oleochemicals",               # Bharat FMCG – raw material
        "city": "Surat", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.82, "lead_time_days": 6,
        "risk_zone": "cyclone_coastal",
        "latitude": 21.170, "longitude": 72.831,
    },
    {
        "id": SUPPLIER_IDS[7],
        "name": "TN Packaging Corp",                   # Sunrise Consumer – packaging
        "city": "Coimbatore", "state": "Tamil Nadu", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.75, "lead_time_days": 5,
        "risk_zone": None, "latitude": 11.016, "longitude": 76.955,
    },
    {
        "id": SUPPLIER_IDS[8],
        "name": "Spice Valley Agro",                   # Sunrise Consumer – raw material
        "city": "Hyderabad", "state": "Telangana", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.86, "lead_time_days": 7,
        "risk_zone": None, "latitude": 17.385, "longitude": 78.486,
    },
    {
        "id": SUPPLIER_IDS[9],
        "name": "East Bengal Packaging",               # GreenLeaf – packaging
        "city": "Kolkata", "state": "West Bengal", "region": "East",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.72, "lead_time_days": 9,
        "risk_zone": "flood_prone",
        "latitude": 22.574, "longitude": 88.370,
    },
    {
        "id": SUPPLIER_IDS[10],
        "name": "Punjab Grain Traders",                # GreenLeaf – raw material
        "city": "Ludhiana", "state": "Punjab", "region": "North",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.84, "lead_time_days": 6,
        "risk_zone": "strike_prone",
        "latitude": 30.901, "longitude": 75.857,
    },
    {
        "id": SUPPLIER_IDS[11],
        "name": "Gujarat Container Pvt Ltd",           # PureFarm – packaging
        "city": "Ahmedabad", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.80, "lead_time_days": 4,
        "risk_zone": None, "latitude": 23.032, "longitude": 72.552,
    },
    {
        "id": SUPPLIER_IDS[12],
        "name": "Kerala Coconut Estates",              # PureFarm – raw material
        "city": "Kochi", "state": "Kerala", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.91, "lead_time_days": 8,
        "risk_zone": "flood_prone",
        "latitude": 9.931, "longitude": 76.267,
    },
    {
        "id": SUPPLIER_IDS[13],
        "name": "Rajasthan Print Pack",                # NorthStar – packaging
        "city": "Jaipur", "state": "Rajasthan", "region": "North",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.85, "lead_time_days": 7,
        "risk_zone": None, "latitude": 26.912, "longitude": 75.787,
    },
    {
        "id": SUPPLIER_IDS[14],
        "name": "Assam Tea Gardens",                   # NorthStar – raw material
        "city": "Guwahati", "state": "Assam", "region": "Northeast",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.76, "lead_time_days": 12,
        "risk_zone": "flood_prone",
        "latitude": 26.144, "longitude": 91.736,
    },

    # ────────────────────────────────────────────────────────────────────
    # ALTERNATE SUPPLIERS  (indices 15-22)
    # Dedicated alternates shown on the Alternative Supplier demo page
    # ────────────────────────────────────────────────────────────────────

    # — Alts for Bharat FMCG Industries (West region) ——
    {
        "id": SUPPLIER_IDS[15],
        "name": "Hindustan Consumer Care",
        "city": "Pune", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.90, "lead_time_days": 6,
        "risk_zone": None, "latitude": 18.520, "longitude": 73.856,
    },
    {
        "id": SUPPLIER_IDS[16],
        "name": "Bombay Home Products",
        "city": "Nagpur", "state": "Maharashtra", "region": "Central",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.84, "lead_time_days": 7,
        "risk_zone": None, "latitude": 21.145, "longitude": 79.088,
    },

    # — Alts for Sunrise Consumer Products (South region) ——
    {
        "id": SUPPLIER_IDS[17],
        "name": "Madras Foods Pvt Ltd",
        "city": "Bangalore", "state": "Karnataka", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.88, "lead_time_days": 5,
        "risk_zone": None, "latitude": 12.971, "longitude": 77.594,
    },
    {
        "id": SUPPLIER_IDS[18],
        "name": "Vizag Consumer Products",
        "city": "Visakhapatnam", "state": "Andhra Pradesh", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.80, "lead_time_days": 8,
        "risk_zone": "cyclone_coastal",
        "latitude": 17.686, "longitude": 83.218,
    },

    # — Alt for GreenLeaf Agro Processing (East region) ——
    {
        "id": SUPPLIER_IDS[19],
        "name": "Eastern Agro Products",
        "city": "Bhubaneswar", "state": "Odisha", "region": "East",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.79, "lead_time_days": 10,
        "risk_zone": "cyclone_coastal",
        "latitude": 20.296, "longitude": 85.824,
    },

    # — Alts for PureFarm Naturals (West region) ——
    {
        "id": SUPPLIER_IDS[20],
        "name": "Western Naturals Ltd",
        "city": "Rajkot", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.86, "lead_time_days": 7,
        "risk_zone": "cyclone_coastal",
        "latitude": 22.303, "longitude": 70.802,
    },
    {
        "id": SUPPLIER_IDS[21],
        "name": "Kerala Organics Cooperative",
        "city": "Thrissur", "state": "Kerala", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.92, "lead_time_days": 9,
        "risk_zone": "flood_prone",
        "latitude": 10.527, "longitude": 76.214,
    },

    # — Alt for NorthStar Essentials (North region) ——
    {
        "id": SUPPLIER_IDS[22],
        "name": "Capital FMCG Corp",
        "city": "Lucknow", "state": "Uttar Pradesh", "region": "North",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.81, "lead_time_days": 8,
        "risk_zone": "strike_prone",
        "latitude": 26.846, "longitude": 80.946,
    },
]
