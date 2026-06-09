import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useActionCards } from '../hooks/useQueries'
import { queryKeys } from '../hooks/queryKeys'
import { api } from '../services/api'
import { ClipboardList, CheckCircle2, ArrowUpRight, Circle, TrendingDown, ShieldCheck } from 'lucide-react'
import type { ActionCard } from '../types'

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#6B7280',
}
const PRIORITY_BG: Record<string, string> = {
  critical: '#FEF2F2', high: '#FFFBEB', medium: '#EFF6FF', low: '#F9FAFB',
}
const PRIORITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

function formatINR(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v}`
}

/* ── Supplier entry (one row per supplier) ────────────────────────────── */
interface SupplierEntry {
  supplierId: string
  cards: ActionCard[]
  isResolved: boolean
  representative: ActionCard   // card shown for display
  topPriority: string
  totalExposure: number
}

function buildSupplierEntries(cards: ActionCard[]): SupplierEntry[] {
  // Group by supplier_id — skip cards without a supplier
  const groups = new Map<string, ActionCard[]>()
  for (const card of cards) {
    if (!card.supplier_id) continue
    const g = groups.get(card.supplier_id) ?? []
    g.push(card)
    groups.set(card.supplier_id, g)
  }

  return [...groups.entries()].map(([supplierId, grp]) => {
    const hasUnresolved = grp.some(c => !c.is_resolved)
    const isResolved = !hasUnresolved

    // Best card to display: most urgent unresolved, or most recently resolved
    const representative = [...grp].sort((a, b) => {
      if (a.is_resolved !== b.is_resolved) return a.is_resolved ? 1 : -1
      const pa = PRIORITY_ORDER[a.priority] ?? 9
      const pb = PRIORITY_ORDER[b.priority] ?? 9
      if (pa !== pb) return pa - pb
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    })[0]

    const unresolvedCards = grp.filter(c => !c.is_resolved)
    const topPriority = [...grp].sort(
      (a, b) => (PRIORITY_ORDER[a.priority] ?? 9) - (PRIORITY_ORDER[b.priority] ?? 9)
    )[0]?.priority ?? 'low'
    const totalExposure = unresolvedCards.reduce((s, c) => s + c.estimated_impact_inr, 0)
      || grp.reduce((s, c) => s + c.estimated_impact_inr, 0)

    return { supplierId, cards: grp, isResolved, representative, topPriority, totalExposure }
  })
}

/* ── Supplier row ─────────────────────────────────────────────────────── */
function SupplierRow({ entry, onToggle }: {
  entry: SupplierEntry
  onToggle: (supplierId: string, currentlyResolved: boolean) => Promise<void>
}) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)
  const { representative, isResolved, topPriority, totalExposure, supplierId } = entry
  const color = PRIORITY_COLOR[topPriority] ?? '#6B7280'
  const bg = PRIORITY_BG[topPriority] ?? '#F9FAFB'

  async function handleToggle(e: React.MouseEvent) {
    e.stopPropagation()
    setBusy(true)
    await onToggle(supplierId, isResolved)
    setBusy(false)
  }

  function handleRowClick() {
    if (isResolved) {
      // Go to resolution summary
      navigate(`/activity/${representative.id}`)
    } else {
      // Go to mitigation plan
      navigate(`/risks/${supplierId}/mitigation`)
    }
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto auto',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.25rem',
        cursor: 'pointer',
        transition: 'background 120ms ease',
        opacity: isResolved ? 0.55 : 1,
      }}
      onClick={handleRowClick}
      onMouseEnter={e => { e.currentTarget.style.background = '#F9F9F9' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Toggle */}
      <button
        onClick={handleToggle}
        disabled={busy}
        title={isResolved ? 'Mark as pending' : 'Mark as done'}
        style={{
          width: 36, height: 36, borderRadius: '50%',
          border: `2px solid ${isResolved ? '#16a34a' : color}`,
          background: isResolved ? '#dcfce7' : bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: busy ? 'wait' : 'pointer',
          flexShrink: 0, transition: 'all 150ms ease',
        }}
      >
        {isResolved
          ? <CheckCircle2 size={16} color="#16a34a" />
          : <Circle size={16} color={color} style={{ opacity: busy ? 0.4 : 0.3 }} />
        }
      </button>

      {/* Title + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '0.875rem', fontWeight: 600,
          color: isResolved ? '#6B7280' : '#000',
          textDecoration: isResolved ? 'line-through' : 'none',
          marginBottom: '0.25rem', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {representative.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{
            fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color, padding: '2px 7px',
            borderRadius: '99px', background: bg, border: `1px solid ${color}22`,
          }}>
            {topPriority}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{representative.action_type}</span>
          {isResolved && (
            <span style={{ fontSize: '0.6875rem', color: '#16a34a', fontWeight: 600 }}>✓ Resolved</span>
          )}
        </div>
      </div>

      {/* Impact */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: topPriority === 'critical' ? '#DC2626' : '#000', fontFamily: 'monospace' }}>
          {formatINR(totalExposure)}
        </div>
        <div style={{ fontSize: '0.5625rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Impact</div>
      </div>

      {/* Arrow */}
      {!isResolved
        ? <ArrowUpRight size={14} color="#9CA3AF" style={{ flexShrink: 0 }} />
        : <div style={{ width: 14 }} />
      }
    </div>
  )
}

type Filter = 'pending' | 'resolved' | 'all'

export default function PendingActionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading } = useActionCards()
  const [filter, setFilter] = useState<Filter>('pending')

  // Sync on page open so counts stay aligned with Risks page
  useEffect(() => {
    api.syncRisks()
      .then(({ synced }) => {
        if (synced > 0) {
          queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
          queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
        }
      })
      .catch(() => {})
  }, [queryClient])

  const allCards = data?.action_cards ?? []

  // One entry per supplier — this is the source of truth for all counts
  const entries = useMemo(() => buildSupplierEntries(allCards), [allCards])

  const pendingEntries  = entries.filter(e => !e.isResolved)
  const resolvedEntries = entries.filter(e => e.isResolved)

  const totalExposure = pendingEntries.reduce((s, e) => s + e.totalExposure, 0)
  const totalSaved    = resolvedEntries.reduce((s, e) => s + e.totalExposure, 0)

  const filtered = [...entries]
    .filter(e => {
      if (filter === 'pending')  return !e.isResolved
      if (filter === 'resolved') return e.isResolved
      return true
    })
    .sort((a, b) => {
      if (a.isResolved !== b.isResolved) return a.isResolved ? 1 : -1
      return (PRIORITY_ORDER[a.topPriority] ?? 9) - (PRIORITY_ORDER[b.topPriority] ?? 9)
    })

  const handleToggle = useCallback(async (
    supplierId: string,
    currentlyResolved: boolean,
  ) => {
    if (currentlyResolved) {
      // Unresolve ALL cards for the supplier — not just the representative one
      await api.unresolveAllSupplierCards(supplierId)
    } else {
      // Resolve ALL cards for this supplier at once
      await api.resolveAllSupplierCards(supplierId)
    }
    queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
    queryClient.invalidateQueries({ queryKey: queryKeys.financial })
    queryClient.invalidateQueries({ queryKey: queryKeys.disruptions })
    queryClient.invalidateQueries({ queryKey: queryKeys.stockout })
    queryClient.invalidateQueries({ queryKey: queryKeys.procurement })
    queryClient.invalidateQueries({ queryKey: queryKeys.executiveBrief })
  }, [queryClient])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div>
        <div
          style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: '0.375rem', cursor: 'pointer' }}
          onClick={() => navigate('/')}
        >
          Dashboard / Pending Actions
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
          Pending Actions
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
          One action per supplier · resolve to clear from the Risks page
        </p>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        <div style={{ padding: '1.25rem 1.5rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingDown size={22} color="#DC2626" />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#DC2626', marginBottom: '0.25rem' }}>Exposure at Risk</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#DC2626', lineHeight: 1, fontFamily: 'monospace' }}>{formatINR(totalExposure)}</div>
            <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: '0.25rem' }}>
              across {pendingEntries.length} supplier{pendingEntries.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        <div style={{ padding: '1.25rem 1.5rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.75rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ width: 44, height: 44, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={22} color="#16a34a" />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#16a34a', marginBottom: '0.25rem' }}>Risk Mitigated</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', lineHeight: 1, fontFamily: 'monospace' }}>{formatINR(totalSaved)}</div>
            <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '0.25rem' }}>
              across {resolvedEntries.length} supplier{resolvedEntries.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {(['pending', 'resolved', 'all'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.375rem 0.875rem', borderRadius: '99px',
              border: `1px solid ${filter === f ? '#000' : 'var(--border)'}`,
              background: filter === f ? '#000' : '#fff',
              color: filter === f ? '#fff' : 'var(--ink-3)',
              fontSize: '0.75rem', fontWeight: filter === f ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {f === 'pending'  ? `Pending (${pendingEntries.length})`
            : f === 'resolved' ? `Resolved (${resolvedEntries.length})`
            : `All (${entries.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '40px 1fr auto auto', gap: '1rem', padding: '0.625rem 1.25rem', background: '#F9F9F9', borderBottom: '1px solid var(--border)' }}>
          {['', 'Supplier', 'Impact', ''].map((col, i) => (
            <div key={i} style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 2 ? 'right' : 'left' }}>
              {col}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>Loading actions…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <CheckCircle2 size={32} color="#16a34a" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000' }}>All clear</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>No pending actions at this time</div>
          </div>
        ) : (
          <div>
            {filtered.map((entry, i, arr) => (
              <div key={entry.supplierId}>
                <SupplierRow entry={entry} onToggle={handleToggle} />
                {i < arr.length - 1 && <div style={{ height: '1px', background: 'var(--border)', margin: '0 1.25rem' }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <ClipboardList size={11} />
        Click the circle to toggle resolved · click any row to view the mitigation plan
      </div>

    </div>
  )
}
