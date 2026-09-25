"""
Additive dashboard seeder for SupplySense.

Unlike seed_min10 / seed_all (which DROP and recreate the public schema), this
seeder is **purely additive and non-destructive**: it INSERTs extra rows into an
already-seeded, already-running database so the dashboard has more to show —
specifically the parts the base seed leaves empty:

  • Money Saved graph  → needs RESOLVED action cards with resolved_at timestamps
                         (the base seed creates none, so the chart is flat).
  • Total saved / KPI  → sum of resolved cards' estimated_impact_inr.
  • Disruption history → a few PAST (resolved) disruptions for a fuller timeline
                         (active count is left unchanged).

It attaches everything to whatever tier-1 suppliers / SKUs already exist, so it
works after either base seeder. Every row it writes is tagged with SEED_MARKER,
and the seeder deletes its own previously-tagged rows first — so it is safe to
re-run without piling up duplicates and it never touches hand-curated data.

Run (from backend/, against the live DB):  python -m seeders.seed_dashboard_extras
"""

import asyncio
import random
import uuid
from datetime import date, datetime, timedelta

from sqlalchemy import select, text as sa_text
from sqlalchemy.ext.asyncio import create_async_engine, async_sessionmaker, AsyncSession

from app.core.config import get_settings

settings = get_settings()
DATABASE_URL = settings.database_url

# Tag written into resolution_note (cards) and description (disruptions) so this
# seeder can find and remove exactly its own rows on a re-run.
SEED_MARKER = "[demo-seed]"

rng = random.Random(2024)
today = date.today()
now = datetime.now()


# ── Resolved-action templates ─────────────────────────────────────────────
# Each entry: (action_type, priority, title_tmpl, desc_tmpl, resolution_tmpl)
# {s} = supplier name, {k} = sku name, {c} = sku code.
ACTION_TEMPLATES = [
    ("switch_supplier", "critical",
     "{s} — switched {c} to backup source",
     "Primary supply of {k} from {s} was at risk; the deterministic engine priced "
     "the cheapest reliable alternate and the switch was approved.",
     "Order rerouted to the vetted alternate supplier; supply restored with no stockout."),
    ("expedite", "high",
     "{s} — expedited in-transit {c}",
     "{k} cover had fallen to a few days while stock was already in the pipeline; "
     "an expedite bridged the gap.",
     "Air/priority freight arranged; goods landed ahead of the projected stockout date."),
    ("increase_stock", "high",
     "{s} — pre-built buffer for {c}",
     "Festival demand was lifting {k} offtake above normal; a buffer build was the "
     "cheapest hedge versus switching.",
     "Safety stock raised for the festival window; demand surge absorbed without shortfall."),
    ("reorder", "medium",
     "{s} — replenished {c} to reorder point",
     "{k} had drawn below its reorder point while {s} was dispatching normally; a "
     "straightforward replenishment was all that was needed.",
     "Replenishment PO placed with the healthy primary; inventory back above reorder point."),
    ("substitute_sku", "high",
     "{s} — substituted an approved SKU for {c}",
     "A quality hold blocked this exact batch of {k}; a compatible, already-approved "
     "substitute was in stock.",
     "Approved substitute SKU promoted for the hold window; service level maintained."),
]

# How many resolved cards to spread across each recency band, and the day-range
# of each band. Weighted toward recent so 1W / 1M views also show movement.
RECENCY_BANDS = [
    (5, 0, 7),      # last week
    (10, 8, 30),    # last month
    (12, 31, 120),  # last quarter+
    (11, 121, 300),  # older history (fills the 1Y view)
]


async def seed():
    engine = create_async_engine(DATABASE_URL, echo=False)
    session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)

    from app.models.supplier import Supplier
    from app.models.sku import SKU
    from app.models.disruption import Disruption
    from app.models.action_card import ActionCard

    async with session_factory() as session:
        # ── Load what already exists (works after any base seeder) ──────────
        suppliers = (
            await session.execute(select(Supplier).where(Supplier.tier == 1))
        ).scalars().all()
        skus = (await session.execute(select(SKU))).scalars().all()
        if not suppliers or not skus:
            raise SystemExit(
                "No tier-1 suppliers / SKUs found. Run a base seeder "
                "(python -m seeders.seed_min10) first, then re-run this."
            )
        skus_by_supplier: dict[uuid.UUID, list] = {}
        for k in skus:
            skus_by_supplier.setdefault(k.supplier_id, []).append(k)

        # ── Clean up this seeder's own previously-written rows (re-runnable) ─
        del_cards = await session.execute(
            sa_text("DELETE FROM action_cards WHERE resolution_note LIKE :m"),
            {"m": f"%{SEED_MARKER}%"},
        )
        del_disr = await session.execute(
            sa_text("DELETE FROM disruptions WHERE description LIKE :m"),
            {"m": f"%{SEED_MARKER}%"},
        )
        await session.commit()
        print(f"[0/2] cleared prior demo rows — {del_cards.rowcount} cards, {del_disr.rowcount} disruptions")

        # ── [1/2] Historical RESOLVED action cards ──────────────────────────
        sup_by_id = {s.id: s for s in suppliers}
        made = 0
        band_specs: list[int] = []
        for count, lo, hi in RECENCY_BANDS:
            band_specs.extend([(lo, hi)] * count)

        for i, (lo, hi) in enumerate(band_specs):
            supplier = suppliers[i % len(suppliers)]
            cand_skus = skus_by_supplier.get(supplier.id) or skus
            sku = rng.choice(cand_skus)
            atype, priority, t_tmpl, d_tmpl, r_tmpl = ACTION_TEMPLATES[i % len(ACTION_TEMPLATES)]

            # Impact ≈ demand value protected over the days of cover the action bought.
            dd = float(sku.daily_demand_avg or 100)
            cost = float(sku.unit_cost_inr or 100)
            days_protected = rng.randint(4, 12)
            impact = round(dd * cost * days_protected * rng.uniform(0.35, 0.9), 2)

            days_ago = rng.randint(lo, hi)
            resolved_dt = now - timedelta(
                days=days_ago, hours=rng.randint(0, 23), minutes=rng.randint(0, 59)
            )
            created_dt = resolved_dt - timedelta(days=rng.randint(1, 5))

            fmt = dict(s=supplier.name, k=sku.name, c=sku.sku_code)
            session.add(ActionCard(
                id=uuid.uuid4(),
                title=t_tmpl.format(**fmt),
                description=d_tmpl.format(**fmt),
                action_type=atype,
                priority=priority,
                supplier_id=supplier.id,
                sku_id=sku.id,
                estimated_impact_inr=impact,
                is_resolved=True,
                resolution_note=f"{r_tmpl.format(**fmt)} {SEED_MARKER}",
                created_at=created_dt,
                resolved_at=resolved_dt,
            ))
            made += 1
        await session.commit()
        print(f"[1/2] inserted {made} resolved action cards (historical mitigation wins)")

        # ── [2/2] A few PAST (resolved) disruptions for timeline depth ──────
        # is_active=False + end_date in the past → does NOT change the active count.
        past_disruptions = [
            ("cyclone", "high", "Cyclone Fengal aftermath — Chennai coastal logistics",
             "Earlier coastal disruption that slowed South dispatches; since cleared.", 0.71, "South", 40, 22),
            ("strike", "medium", "Transporter strike — Western freight corridor",
             "A short-lived transporter strike delayed West-region movements; resolved after negotiations.", 0.55, "West", 95, 88),
            ("quality_hold", "high", "FSSAI sampling hold — earlier serum batch",
             "A previous batch quality hold, since released after re-testing cleared the SKU.", 0.63, "South", 150, 141),
            ("demand_surge", "medium", "Diwali demand surge — pan-India FMCG",
             "Festival demand spike across categories that has since normalised.", 0.5, "North", 210, 196),
        ]
        added_d = 0
        for i, (dtype, sev, title, desc, impact, region, start_ago, end_ago) in enumerate(past_disruptions):
            supplier = suppliers[i % len(suppliers)]
            session.add(Disruption(
                id=uuid.uuid4(),
                supplier_id=supplier.id,
                disruption_type=dtype,
                severity=sev,
                title=title,
                description=f"{desc} {SEED_MARKER}",
                start_date=today - timedelta(days=start_ago),
                end_date=today - timedelta(days=end_ago),
                impact_score=impact,
                affected_skus_count=2,
                region=region,
                is_active=False,
            ))
            added_d += 1
        await session.commit()
        print(f"[2/2] inserted {added_d} past (resolved) disruptions")

        # ── Summary ─────────────────────────────────────────────────────────
        saved_q = await session.execute(
            sa_text("SELECT COALESCE(SUM(estimated_impact_inr),0) FROM action_cards WHERE is_resolved = true")
        )
        total_saved = saved_q.scalar() or 0.0

    await engine.dispose()
    print("\n=== dashboard extras seeded (additive) ===")
    print(f"  resolved action cards now total ≈ ₹{total_saved:,.0f} saved → Money Saved graph + KPIs")
    print("  active disruption count unchanged; reload the dashboard to see the history fill in.")


if __name__ == "__main__":
    asyncio.run(seed())
