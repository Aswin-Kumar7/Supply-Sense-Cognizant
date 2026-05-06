"""
Cascade Propagation Engine for SupplySense.

Implements recursive dependency propagation to model how disruptions
cascade through multi-tier supplier networks.

Architecture:
- Uses PostgreSQL recursive CTEs for graph traversal
- Weighted propagation: impact degrades by criticality at each hop
- Cycle-safe: tracks visited nodes to prevent infinite loops
- Deterministic: same disruption → same cascade result

Why Recursive CTEs:
- Database-native graph traversal (no app-level recursion)
- Handles arbitrary depth without stack overflow
- Efficient for sparse dependency graphs
- Returns full path for visualization

Propagation Formula:
  propagated_impact = source_impact × criticality × decay_factor^depth
  where decay_factor = 0.7 (configurable)
"""

from dataclasses import dataclass, field
from uuid import UUID
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

# Propagation decay: impact reduces by 30% at each tier
DECAY_FACTOR = 0.7
# Minimum impact threshold to stop propagation
MIN_IMPACT_THRESHOLD = 0.05
# Maximum propagation depth
MAX_DEPTH = 5


@dataclass
class CascadeNode:
    """A single node in the cascade propagation tree."""
    supplier_id: str
    supplier_name: str
    depth: int
    propagated_impact: float
    criticality: float
    dependency_type: str
    path: list[str] = field(default_factory=list)


@dataclass
class CascadeResult:
    """Complete cascade propagation result from a source disruption."""
    source_supplier_id: str
    source_supplier_name: str
    source_impact: float
    total_affected: int
    max_depth_reached: int
    total_propagated_impact: float
    nodes: list[CascadeNode] = field(default_factory=list)

    @property
    def severity(self) -> str:
        if self.total_propagated_impact >= 2.0:
            return "critical"
        elif self.total_propagated_impact >= 1.0:
            return "high"
        elif self.total_propagated_impact >= 0.5:
            return "medium"
        return "low"


class CascadePropagationEngine:
    """
    Computes cascading impact through supplier dependency networks.
    Uses recursive CTE for efficient graph traversal.
    """

    async def propagate(
        self, db: AsyncSession, source_supplier_id: UUID, source_impact: float
    ) -> CascadeResult:
        """
        Propagate disruption impact from a source supplier through dependencies.
        
        Returns all affected suppliers with their propagated impact scores.
        """
        # Recursive CTE: find all suppliers that depend on the source
        # (i.e., who has source_supplier_id in their depends_on_id chain)
        cascade_query = text("""
            WITH RECURSIVE cascade AS (
                -- Base case: direct dependents of the disrupted supplier
                SELECT 
                    sd.supplier_id,
                    s.name as supplier_name,
                    1 as depth,
                    sd.criticality,
                    sd.dependency_type,
                    ARRAY[sd.supplier_id::text] as path
                FROM supplier_dependencies sd
                JOIN suppliers s ON s.id = sd.supplier_id
                WHERE sd.depends_on_id = :source_id
                
                UNION ALL
                
                -- Recursive case: suppliers that depend on already-affected suppliers
                SELECT 
                    sd.supplier_id,
                    s.name as supplier_name,
                    c.depth + 1,
                    sd.criticality,
                    sd.dependency_type,
                    c.path || sd.supplier_id::text
                FROM supplier_dependencies sd
                JOIN suppliers s ON s.id = sd.supplier_id
                JOIN cascade c ON sd.depends_on_id = c.supplier_id
                WHERE c.depth < :max_depth
                AND NOT (sd.supplier_id::text = ANY(c.path))  -- cycle prevention
            )
            SELECT supplier_id, supplier_name, depth, criticality, dependency_type, path
            FROM cascade
            ORDER BY depth, criticality DESC
        """)

        result = await db.execute(
            cascade_query,
            {"source_id": str(source_supplier_id), "max_depth": MAX_DEPTH},
        )
        rows = result.fetchall()

        # Also get source supplier name
        source_name_q = await db.execute(
            text("SELECT name FROM suppliers WHERE id = :id"),
            {"id": str(source_supplier_id)},
        )
        source_name_row = source_name_q.fetchone()
        source_name = source_name_row[0] if source_name_row else "Unknown"

        # Compute propagated impacts
        nodes = []
        for row in rows:
            depth = row[2]
            criticality = row[3]
            # Impact decays with depth and is weighted by criticality
            propagated = source_impact * criticality * (DECAY_FACTOR ** depth)

            if propagated >= MIN_IMPACT_THRESHOLD:
                nodes.append(CascadeNode(
                    supplier_id=str(row[0]),
                    supplier_name=row[1],
                    depth=depth,
                    propagated_impact=round(propagated, 4),
                    criticality=criticality,
                    dependency_type=row[4],
                    path=[str(source_supplier_id)] + (row[5] if row[5] else []),
                ))

        max_depth = max((n.depth for n in nodes), default=0)
        total_impact = sum(n.propagated_impact for n in nodes)

        return CascadeResult(
            source_supplier_id=str(source_supplier_id),
            source_supplier_name=source_name,
            source_impact=source_impact,
            total_affected=len(nodes),
            max_depth_reached=max_depth,
            total_propagated_impact=round(total_impact, 4),
            nodes=nodes,
        )

    async def propagate_all_active(self, db: AsyncSession) -> list[CascadeResult]:
        """
        Propagate all currently active disruptions through the network.
        Returns cascade results for each disrupted supplier.
        """
        # Get all active disruptions with supplier associations
        active_q = await db.execute(text("""
            SELECT DISTINCT supplier_id, impact_score
            FROM disruptions
            WHERE is_active = true AND supplier_id IS NOT NULL
        """))
        active_disruptions = active_q.fetchall()

        results = []
        for row in active_disruptions:
            supplier_id = row[0]
            impact = row[1]
            cascade = await self.propagate(db, supplier_id, impact)
            if cascade.total_affected > 0:
                results.append(cascade)

        return results


# Singleton
cascade_engine = CascadePropagationEngine()
