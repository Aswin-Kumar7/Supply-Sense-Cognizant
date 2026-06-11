# SupplySense

**AI-Powered Retail Supply Chain Resilience Platform**

Built for the Cognizant Technoverse Hackathon · Problem Domain: Predictive Stockout Management

SupplySense predicts supplier disruptions, quantifies cascading financial risk, and delivers prescriptive procurement actions — 7–14 days before a stockout hits. It covers Indian FMCG supply chains with deterministic risk scoring, multi-agent AI analysis, and real-time monitoring.

---

## Problem Statement

Tier-1 and Tier-2 suppliers in Indian retail constantly face unforeseen disruptions — cyclones, floods, strikes, raw material shortages — that result in costly stockouts. Current management practices offer no early warning within the critical 7–14 day intervention window. SupplySense closes that gap by combining live inventory data, external disruption signals, and AI-driven scenario analysis to surface actionable insights before damage occurs.

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        React 18 + TypeScript Frontend               │
│                                                                     │
│  Dashboard  ·  Risk Monitor  ·  SKU Forecast                       │
│  Risk Detail  ·  Suppliers  ·  Alternates  ·  Settings             │
│                                                                     │
│  useWeightedRiskAnalysis()  <--  localStorage weights               │
│  TanStack Query (30s stale, 10m gc)  ·  SSE real-time feed         │
│  Recharts  ·  react-simple-maps (India heatmap)                    │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ REST + SSE  /api/v1/...
┌──────────────────────────────▼──────────────────────────────────────┐
│                     FastAPI  (Python 3.12, async)                   │
│                                                                     │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │                  Service Layer                                │  │
│  │  RiskEngine  ·  StockoutEngine  ·  CascadeEngine            │  │
│  │  FinancialEngine  ·  ProcurementAgent  ·  SyntheticEngine   │  │
│  │  RiskIntelligence  ·  DashboardService  ·  DisruptionSvc    │  │
│  └──────────────────────┬───────────────────────────────────────┘  │
│                         │                                           │
│  ┌──────────────────────▼───────────────────────────────────────┐  │
│  │               AWS Strands Multi-Agent Pipeline               │  │
│  │                                                              │  │
│  │  Supervisor --> Signal Intelligence                          │  │
│  │             --> Risk Assessment                              │  │
│  │             --> Prescriptive Action                          │  │
│  │                                                              │  │
│  │  BedrockModel (Claude 3 Haiku · us-east-1)                  │  │
│  │  AWS Guardrails (ID: big59xwx9384)                          │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                                                     │
│  Async Event Bus (asyncio pub/sub) --> SSE fan-out to clients      │
└──────────────────────────────┬──────────────────────────────────────┘
                               │ asyncpg  SQLAlchemy 2.0
┌──────────────────────────────▼──────────────────────────────────────┐
│              AWS RDS PostgreSQL  (us-east-1)                        │
│  suppliers · skus · disruptions · delivery_records                  │
│  risk_snapshots · action_cards · festivals · analysis_cache        │
└─────────────────────────────────────────────────────────────────────┘
```

---

## Key Features

### Real-Time Risk Monitoring
- **Supplier Risk Heatmap** — India map with per-state colour coding (low / medium / high / critical)
- **Live Activity Feed** — SSE stream of disruption alerts, risk updates, stockout warnings with severity badges
- **Synthetic Disruption Engine** — generates realistic events at configurable intervals to demo live monitoring without external APIs

### Deterministic Risk Scoring Engine
Six-factor weighted model (all arithmetic, fully auditable):

| Factor | Weight | Signals Used |
|---|---|---|
| Delivery Reliability | 25% | 90-day on-time rate, avg delay days |
| Disruption Severity | 25% | Active disruptions x severity multipliers |
| Inventory Pressure | 20% | Days of stock cover vs safety stock threshold |
| Logistics Vulnerability | 15% | Risk zone (cyclone / flood / strike-prone) |
| Dependency Exposure | 10% | SKU count, alternate supplier availability |
| Festival Proximity | 5% | Diwali / Holi / harvest season demand surge |

Risk levels: **Low** (0–0.45) · **Medium** (0.45–0.65) · **High** (0.65–0.80) · **Critical** (0.80–1.0)

### Client-Side Custom Weight Recomputation
Users can override scoring weights in Settings without redeploying:
- Drag sliders → live preview shows score delta and risk level change per supplier
- Click Save → weights stored in `localStorage` under `ss_risk_weights`
- All risk-displaying pages (Dashboard, Risks, Risk Detail) pick up weights instantly via `useWeightedRiskAnalysis()` — zero API calls

### Stockout Forecasting (7–14 Day Window)
```
days_to_stockout = current_stock / adjusted_daily_demand
adjusted_demand  = base_demand x festival_multiplier x disruption_factor
```
- Projects per-SKU depletion dates with INR revenue-at-risk quantification
- Flags critical SKUs (< 7 days to stockout)
- Accounts for lead-time degradation during active disruptions

### Cascade Impact Analysis
- Identifies downstream SKUs affected when a Tier-2 supplier fails
- Computes propagation depth (Tier-1 → Tier-2 → alternate sourcing)
- Simulates financial exposure across the cascade chain

### AI Multi-Agent Pipeline (AWS Strands)

```
User query
    │
    ▼
PrescriptiveActionAgent
    ├── Tool: query_supplier_risk    (live DB lookup)
    ├── Tool: query_sku_stockout     (stockout engine)
    ├── Tool: get_financial_summary  (financial engine)
         │
         ▼
    BedrockModel (Claude 3 Haiku · us-east-1)
    + AWS Guardrails validation
         │
         ▼
    Structured response with sources + confidence
```

Four specialist agents:
- **Signal Intelligence** — classifies disruption events, identifies affected suppliers
- **Risk Assessment** — cascade impact scoring, financial exposure
- **Prescriptive Action** — generates alternate sourcing recommendations, TFE calculations

### Scenario Simulation
One-click trigger of four pre-configured crisis scenarios:

| Scenario | Suppliers Affected | SKUs at Risk |
|---|---|---|
| Chennai Cyclone | 2 coastal suppliers | 6 SKUs |
| Maharashtra Transport Strike | 3 suppliers | 8 SKUs |
| Kolkata Flash Floods | 2 warehouse zones | 5 SKUs |
| Diwali Demand Surge | All suppliers | 18 SKUs |

### Procurement Action Cards
AI-generated, confidence-scored recommendations surfaced automatically when risk crosses thresholds:
- Alternate supplier sourcing with cost delta
- Emergency purchase order suggestions
- Buffer stock build-up recommendations
- Lead-time renegotiation triggers

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, TypeScript 5, Vite, TailwindCSS 3 |
| State / Data | TanStack Query v5, React Router v7 |
| Charts | Recharts 2, react-simple-maps |
| Backend | FastAPI, Python 3.12, Uvicorn |
| ORM | SQLAlchemy 2.0 async + asyncpg |
| Database | PostgreSQL 15 (AWS RDS) |
| AI Agents | AWS Strands Agents SDK 0.1.0 |
| LLM | AWS Bedrock — Claude 3 Haiku (us-east-1) |
| Guardrails | AWS Bedrock Guardrails |
| Real-time | Server-Sent Events (SSE) via sse-starlette |

---

## Project Structure

```
supplysense/
├── backend/
│   ├── app/
│   │   ├── agents/          # AWS Strands multi-agent pipeline
│   │   ├── core/            # Config, DB, event bus, logging, Bedrock client
│   │   ├── models/          # SQLAlchemy ORM (suppliers, SKUs, disruptions, ...)
│   │   ├── repositories/    # Data-access layer
│   │   ├── routers/         # FastAPI route handlers (12 routers)
│   │   ├── schemas/         # Pydantic request/response schemas
│   │   ├── services/        # Business logic (risk, stockout, cascade, financial, ...)
│   │   └── main.py
│   ├── seeders/             # Deterministic synthetic data (FMCG, 5+10 suppliers)
│   ├── requirements.txt
│   └── requirements-ai.txt  # strands-agents (optional)
├── frontend/
│   └── src/
│       ├── components/      # Reusable UI (Badge, MetricCard, IndiaMap)
│       ├── hooks/           # useWeightedRiskAnalysis, useRiskWeights, useQueries
│       ├── pages/           # Dashboard, Risks, RiskDetail, Settings, ...
│       └── router.tsx
├── infrastructure/          # SQL init scripts
├── shared/                  # API contracts
└── .env.example
```

---

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/v1/health` | Health check + DB status |
| GET | `/api/v1/dashboard/overview` | KPI summary (risk counts, revenue at risk) |
| GET | `/api/v1/suppliers` | All suppliers with current risk |
| GET | `/api/v1/suppliers/{id}/risk` | Full risk breakdown with factor scores |
| GET | `/api/v1/skus` | All SKUs with stockout forecast |
| GET | `/api/v1/skus/stockout-risk` | SKUs sorted by days to stockout |
| GET | `/api/v1/disruptions` | Active disruption timeline |
| GET | `/api/v1/risk/analysis` | Weighted risk analysis (all suppliers) |
| GET | `/api/v1/action-cards` | AI-generated procurement recommendations |
| POST | `/api/v1/scenarios/{name}/trigger` | Trigger crisis scenario |
| GET | `/api/v1/events` | SSE stream (real-time disruption feed) |

---

## Seed Data

Deterministic FMCG supply chain with:
- **5 Tier-1 vendors** (Bharat Agro, Sunrise Foods, GreenLeaf, PureFarm, NorthStar)
- **10 Tier-2 suppliers** + **8 alternate suppliers**
- **18 SKUs** across oils, grains, pulses, snacks
- **10 active disruptions** (5 critical · 2 medium · 3 low)
- **90 days** of delivery history with supplier-realistic delay distributions
- **Risk scores**: Sunrise 0.88 · NorthStar 0.83 · GreenLeaf 0.82 · PureFarm 0.78 · Bharat 0.65

---

## Quick Start

### Prerequisites
- Python 3.12+
- Node 18+
- PostgreSQL (or use AWS RDS URL from `.env`)
- AWS credentials with Bedrock access (us-east-1)

### Backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # Windows
source .venv/bin/activate        # Mac/Linux

pip install -r requirements.txt
pip install -r requirements-ai.txt   # optional: Strands agents

cp .env.example .env
# Edit .env with your DB URL and AWS credentials

uvicorn app.main:app --reload --port 8000
```

Seed the database (first run):

```bash
cd backend/seeders
python seed_all.py
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# App runs at http://localhost:5173
```

---

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | Yes | PostgreSQL connection string (asyncpg) |
| `AWS_ACCESS_KEY_ID` | Yes | AWS credentials for Bedrock |
| `AWS_SECRET_ACCESS_KEY` | Yes | AWS credentials for Bedrock |
| `AWS_REGION` | Yes | AWS region (us-east-1) |
| `BEDROCK_MODEL_ID` | No | Claude model ID (default: claude-3-haiku) |
| `BEDROCK_GUARDRAIL_ID` | No | AWS Guardrail ID for hallucination prevention |
| `BACKEND_PORT` | No | Server port (default: 8000) |

---

## Design Decisions

**Deterministic scoring over AI scoring** — Risk is arithmetic. Weighted factors give auditors a reproducible, explainable trail. AI is reserved for reasoning and natural language tasks.

**Client-side weight recomputation** — Avoids a round-trip to the backend when users adjust weights. The backend returns raw factor values (0–1); the frontend multiplies by weights and recomputes locally. Instant feedback, no API cost.

**SSE over WebSockets** — The live feed is read-only and append-only. SSE is simpler to proxy, requires no upgrade handshake, and reconnects automatically. WebSockets would add complexity with no benefit here.

**asyncio.Queue fan-out** — Each SSE client gets its own queue. Slow clients don't block fast ones. Future scaling path: swap for Redis Pub/Sub with zero application-layer changes.

**Strands errors surface directly** — Removed all fallback approval loops. When Strands fails, the error message is returned immediately instead of blocking the UI for 60 seconds waiting for user approval.

---

## Contributors

| Name | Role | GitHub |
|---|---|---|
| Naveen | UI / Frontend Development | [@naveen](https://github.com/naveen) |

### UI Contributions (Naveen)
- Redesigned Sidebar with gradient logo mark and contributor identity card
- Enhanced TopBar user avatar with gradient initials and hover tooltips
- Improved CSS design tokens — refined shadow scale and color palette
- Added live date display in dashboard welcome header
- Improved visual hierarchy across layout components
