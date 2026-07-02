"""
Indian FMCG supply chain supplier data for SupplySense.

27 suppliers total:
  - 7 Tier-1 FMCG manufacturers (primary vendors)
  - 14 Tier-2 suppliers (2 per Tier-1: packaging + raw material)
  - 6 Alternate suppliers (backup sources for Tier-1 vendors)

Geography spans all major Indian industrial corridors:
  North (Delhi, Punjab), South (Chennai, Kochi, Bangalore),
  East (Kolkata), West (Mumbai, Ahmedabad, Pune), Central (Indore)
"""

import uuid

SUPPLIER_IDS = [
    uuid.UUID(f"00000000-0000-0000-0000-{str(i).zfill(12)}")
    for i in range(1, 41)
]

SUPPLIERS = [
    # ────────────────────────────────────────────────────────────────────
    # TIER 1 — 7 Primary FMCG Manufacturers  (indices 0–6)
    # ────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[0],
        "name": "Vikas Home Care Ltd",
        "city": "Mumbai", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.91, "lead_time_days": 4,
        "risk_zone": "cyclone_coastal",
        "latitude": 19.076, "longitude": 72.877,
    },
    {
        "id": SUPPLIER_IDS[1],
        "name": "Dakshin Foods Corporation",
        "city": "Chennai", "state": "Tamil Nadu", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.54, "lead_time_days": 7,
        "risk_zone": "cyclone_coastal",
        "latitude": 13.082, "longitude": 80.270,
    },
    {
        "id": SUPPLIER_IDS[2],
        "name": "Ganga Agri Products",
        "city": "Kolkata", "state": "West Bengal", "region": "East",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.60, "lead_time_days": 8,
        "risk_zone": "flood_prone",
        "latitude": 22.572, "longitude": 88.363,
    },
    {
        "id": SUPPLIER_IDS[3],
        "name": "Saurashtra Naturals Pvt Ltd",
        "city": "Ahmedabad", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.66, "lead_time_days": 6,
        "risk_zone": "cyclone_coastal",
        "latitude": 23.022, "longitude": 72.571,
    },
    {
        "id": SUPPLIER_IDS[4],
        "name": "Arya Consumer Brands",
        "city": "New Delhi", "state": "Delhi", "region": "North",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.57, "lead_time_days": 5,
        "risk_zone": "strike_prone",
        "latitude": 28.613, "longitude": 77.209,
    },
    {
        "id": SUPPLIER_IDS[5],
        "name": "Malabar Ayur Essentials",
        "city": "Kochi", "state": "Kerala", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.73, "lead_time_days": 9,
        "risk_zone": "flood_prone",
        "latitude": 9.931, "longitude": 76.267,
    },
    {
        "id": SUPPLIER_IDS[6],
        "name": "Narmada Dairy & Beverages",
        "city": "Indore", "state": "Madhya Pradesh", "region": "Central",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.85, "lead_time_days": 5,
        "risk_zone": None,
        "latitude": 22.719, "longitude": 75.857,
    },

    # ────────────────────────────────────────────────────────────────────
    # TIER 2 — Packaging + Raw Material for each Tier-1  (indices 7–20)
    # ────────────────────────────────────────────────────────────────────

    # Vikas Home Care — packaging
    {
        "id": SUPPLIER_IDS[7],
        "name": "Konkan Flexi Pack",
        "city": "Navi Mumbai", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.89, "lead_time_days": 3,
        "risk_zone": None, "latitude": 19.033, "longitude": 73.029,
    },
    # Vikas Home Care — raw material (oleochemicals for detergents)
    {
        "id": SUPPLIER_IDS[8],
        "name": "Vapi Oleochem Industries",
        "city": "Vapi", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.83, "lead_time_days": 6,
        "risk_zone": "cyclone_coastal",
        "latitude": 20.371, "longitude": 72.904,
    },
    # Dakshin Foods — packaging
    {
        "id": SUPPLIER_IDS[9],
        "name": "Coimbatore Carton Works",
        "city": "Coimbatore", "state": "Tamil Nadu", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.76, "lead_time_days": 5,
        "risk_zone": None, "latitude": 11.016, "longitude": 76.955,
    },
    # Dakshin Foods — raw material (spices, grains)
    {
        "id": SUPPLIER_IDS[10],
        "name": "Telangana Spice Growers",
        "city": "Warangal", "state": "Telangana", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.87, "lead_time_days": 7,
        "risk_zone": None, "latitude": 17.978, "longitude": 79.599,
    },
    # Ganga Agri — packaging
    {
        "id": SUPPLIER_IDS[11],
        "name": "Howrah Paper & Board",
        "city": "Howrah", "state": "West Bengal", "region": "East",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.71, "lead_time_days": 9,
        "risk_zone": "flood_prone",
        "latitude": 22.593, "longitude": 88.264,
    },
    # Ganga Agri — raw material (grains from Punjab)
    {
        "id": SUPPLIER_IDS[12],
        "name": "Amritsar Grain Exchange",
        "city": "Amritsar", "state": "Punjab", "region": "North",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.84, "lead_time_days": 6,
        "risk_zone": "strike_prone",
        "latitude": 31.634, "longitude": 74.872,
    },
    # Saurashtra Naturals — packaging
    {
        "id": SUPPLIER_IDS[13],
        "name": "Baroda Container Corp",
        "city": "Vadodara", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.81, "lead_time_days": 4,
        "risk_zone": None, "latitude": 22.307, "longitude": 73.181,
    },
    # Saurashtra Naturals — raw material (coconut, herbs)
    {
        "id": SUPPLIER_IDS[14],
        "name": "Kannur Coconut Collective",
        "city": "Kannur", "state": "Kerala", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.90, "lead_time_days": 8,
        "risk_zone": "flood_prone",
        "latitude": 11.874, "longitude": 75.370,
    },
    # Arya Consumer Brands — packaging
    {
        "id": SUPPLIER_IDS[15],
        "name": "Sonipat Laminate Pack",
        "city": "Sonipat", "state": "Haryana", "region": "North",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.86, "lead_time_days": 3,
        "risk_zone": None, "latitude": 28.988, "longitude": 77.021,
    },
    # Arya Consumer Brands — raw material (tea, coffee beans)
    {
        "id": SUPPLIER_IDS[16],
        "name": "Jorhat Tea & Coffee Estate",
        "city": "Jorhat", "state": "Assam", "region": "Northeast",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.77, "lead_time_days": 12,
        "risk_zone": "flood_prone",
        "latitude": 26.757, "longitude": 94.216,
    },
    # Malabar Ayur — packaging
    {
        "id": SUPPLIER_IDS[17],
        "name": "Thrissur Bottle & Label",
        "city": "Thrissur", "state": "Kerala", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.82, "lead_time_days": 4,
        "risk_zone": None, "latitude": 10.527, "longitude": 76.214,
    },
    # Malabar Ayur — raw material (ayurvedic herbs, oils)
    {
        "id": SUPPLIER_IDS[18],
        "name": "Nilgiri Herb Farms",
        "city": "Ooty", "state": "Tamil Nadu", "region": "South",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.88, "lead_time_days": 7,
        "risk_zone": None, "latitude": 11.410, "longitude": 76.695,
    },
    # Narmada Dairy — packaging
    {
        "id": SUPPLIER_IDS[19],
        "name": "Ujjain Tetra Pak Unit",
        "city": "Ujjain", "state": "Madhya Pradesh", "region": "Central",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.87, "lead_time_days": 3,
        "risk_zone": None, "latitude": 23.179, "longitude": 75.784,
    },
    # Narmada Dairy — raw material (milk solids, sugar)
    {
        "id": SUPPLIER_IDS[20],
        "name": "Anand Dairy Cooperative",
        "city": "Anand", "state": "Gujarat", "region": "West",
        "category": "FMCG", "tier": 2,
        "reliability_score": 0.93, "lead_time_days": 4,
        "risk_zone": None, "latitude": 22.556, "longitude": 72.955,
    },

    # ────────────────────────────────────────────────────────────────────
    # ALTERNATE SUPPLIERS  (indices 21–26)
    # Backup sources that can cover Tier-1 vendor SKUs in a disruption
    # ────────────────────────────────────────────────────────────────────

    # Alt for Vikas Home Care (West)
    {
        "id": SUPPLIER_IDS[21],
        "name": "Pune Consumer Goods Co",
        "city": "Pune", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.88, "lead_time_days": 5,
        "risk_zone": None, "latitude": 18.520, "longitude": 73.856,
    },
    # Alt for Dakshin Foods (South)
    {
        "id": SUPPLIER_IDS[22],
        "name": "Bangalore Processed Foods",
        "city": "Bangalore", "state": "Karnataka", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.86, "lead_time_days": 6,
        "risk_zone": None, "latitude": 12.971, "longitude": 77.594,
    },
    # Alt for Ganga Agri (East)
    {
        "id": SUPPLIER_IDS[23],
        "name": "Cuttack Agro Traders",
        "city": "Cuttack", "state": "Odisha", "region": "East",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.78, "lead_time_days": 10,
        "risk_zone": "cyclone_coastal",
        "latitude": 20.462, "longitude": 85.882,
    },
    # Alt for Saurashtra Naturals (West)
    {
        "id": SUPPLIER_IDS[24],
        "name": "Nashik Herbal Products",
        "city": "Nashik", "state": "Maharashtra", "region": "West",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.84, "lead_time_days": 7,
        "risk_zone": None, "latitude": 19.997, "longitude": 73.790,
    },
    # Alt for Arya Consumer Brands (North)
    {
        "id": SUPPLIER_IDS[25],
        "name": "Lucknow FMCG Works",
        "city": "Lucknow", "state": "Uttar Pradesh", "region": "North",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.80, "lead_time_days": 6,
        "risk_zone": "strike_prone",
        "latitude": 26.846, "longitude": 80.946,
    },
    # Alt for Malabar Ayur + Narmada Dairy (shared)
    {
        "id": SUPPLIER_IDS[26],
        "name": "Mysore Health & Wellness",
        "city": "Mysore", "state": "Karnataka", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.83, "lead_time_days": 8,
        "risk_zone": None, "latitude": 12.295, "longitude": 76.639,
    },

    # ────────────────────────────────────────────────────────────────────
    # TIER 1 — Historical / Resolved Suppliers (indices 27-32)
    # ────────────────────────────────────────────────────────────────────
    {
        "id": SUPPLIER_IDS[27],
        "name": "Bharat Spices & Extracts",
        "city": "Hyderabad", "state": "Telangana", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.95, "lead_time_days": 4,
        "risk_zone": None, "latitude": 17.385, "longitude": 78.486,
    },
    {
        "id": SUPPLIER_IDS[28],
        "name": "Himalayan Spring Waters",
        "city": "Dehradun", "state": "Uttarakhand", "region": "North",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.88, "lead_time_days": 5,
        "risk_zone": None, "latitude": 30.316, "longitude": 78.032,
    },
    {
        "id": SUPPLIER_IDS[29],
        "name": "Kaveri Agro Products",
        "city": "Trichy", "state": "Tamil Nadu", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.92, "lead_time_days": 3,
        "risk_zone": None, "latitude": 10.790, "longitude": 78.704,
    },
    {
        "id": SUPPLIER_IDS[30],
        "name": "Rajputana Grains",
        "city": "Jaipur", "state": "Rajasthan", "region": "North",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.89, "lead_time_days": 6,
        "risk_zone": None, "latitude": 26.912, "longitude": 75.787,
    },
    {
        "id": SUPPLIER_IDS[31],
        "name": "Deccan Edibles",
        "city": "Vijayawada", "state": "Andhra Pradesh", "region": "South",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.94, "lead_time_days": 4,
        "risk_zone": "cyclone_coastal", "latitude": 16.506, "longitude": 80.648,
    },
    {
        "id": SUPPLIER_IDS[32],
        "name": "Vidarbha Cotton & Oils",
        "city": "Nagpur", "state": "Maharashtra", "region": "Central",
        "category": "FMCG", "tier": 1,
        "reliability_score": 0.91, "lead_time_days": 5,
        "risk_zone": None, "latitude": 21.145, "longitude": 79.088,
    },

    # ────────────────────────────────────────────────────────────────────
    # TIER 2 — Logistics / Transport partner per Tier-1 vendor (indices 33–39)
    # Gives every vendor a 3rd upstream dependency type (logistics) alongside
    # packaging + raw material, for a more realistic supply graph.
    # ────────────────────────────────────────────────────────────────────
    # Vikas Home Care — logistics (West)
    {
        "id": SUPPLIER_IDS[33],
        "name": "Konkan Cold Chain Logistics",
        "city": "Bhiwandi", "state": "Maharashtra", "region": "West",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.85, "lead_time_days": 2,
        "risk_zone": None, "latitude": 19.296, "longitude": 73.063,
    },
    # Dakshin Foods — logistics (South)
    {
        "id": SUPPLIER_IDS[34],
        "name": "Madras Freight Carriers",
        "city": "Chennai", "state": "Tamil Nadu", "region": "South",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.72, "lead_time_days": 3,
        "risk_zone": "cyclone_coastal", "latitude": 13.082, "longitude": 80.270,
    },
    # Ganga Agri — logistics (East)
    {
        "id": SUPPLIER_IDS[35],
        "name": "Bengal Riverline Transport",
        "city": "Kolkata", "state": "West Bengal", "region": "East",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.69, "lead_time_days": 4,
        "risk_zone": "flood_prone", "latitude": 22.572, "longitude": 88.363,
    },
    # Saurashtra Naturals — logistics (West)
    {
        "id": SUPPLIER_IDS[36],
        "name": "Kandla Port Logistics",
        "city": "Gandhidham", "state": "Gujarat", "region": "West",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.83, "lead_time_days": 3,
        "risk_zone": "cyclone_coastal", "latitude": 23.075, "longitude": 70.133,
    },
    # Arya Consumer Brands — logistics (North)
    {
        "id": SUPPLIER_IDS[37],
        "name": "Delhi NCR Roadways",
        "city": "Gurugram", "state": "Haryana", "region": "North",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.74, "lead_time_days": 2,
        "risk_zone": "strike_prone", "latitude": 28.459, "longitude": 77.026,
    },
    # Malabar Ayur — logistics (South)
    {
        "id": SUPPLIER_IDS[38],
        "name": "Malabar Coast Carriers",
        "city": "Kochi", "state": "Kerala", "region": "South",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.86, "lead_time_days": 4,
        "risk_zone": "flood_prone", "latitude": 9.931, "longitude": 76.267,
    },
    # Narmada Dairy — logistics / cold chain (Central)
    {
        "id": SUPPLIER_IDS[39],
        "name": "Malwa Express Cold Logistics",
        "city": "Indore", "state": "Madhya Pradesh", "region": "Central",
        "category": "Logistics", "tier": 2,
        "reliability_score": 0.88, "lead_time_days": 2,
        "risk_zone": None, "latitude": 22.719, "longitude": 75.857,
    },
]
