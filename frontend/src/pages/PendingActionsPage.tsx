import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useActionCards, useWeightedRiskAnalysis, useProcurementCards } from '../hooks/useQueries'
import { queryKeys } from '../hooks/queryKeys'
import { api } from '../services/api'
import { ClipboardList, CheckCircle2, ArrowUpRight, TrendingDown, ShieldCheck, AlertTriangle } from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'

function formatINR(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v}`
}

const LEVEL_CONFIG = {
  critical: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Critical' },
  high:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'High' },
  medium:   { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Medium' },
  low:      { color: '#059669', bg: '#F0FDF4', border: '#BBF7D0', label: 'Low' },
} as const

/* ── Pending row — mirrors RisksPage RiskRow exactly ─────────────────── */
function PendingRow({ risk, card }: { risk: SupplierRiskAnalysis; card: IntelligentActionCard }) {
  const navigate = useNavigate()
  const cfg = LEVEL_CONFIG[risk.risk_level] ?? LEVEL_CONFIG.low
  const urgent = card.days_to_stockout <= 7
  const needsAction = risk.risk_level === 'critical' || risk.risk_level === 'high'

  return (
    <div
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr 90px 100px 110px 100px',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.875rem 1rem 0.875rem 0',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: '#fff',
        transition: 'background 120ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#FAFAFA' }}
      onMouseLeave={e => { e.currentTarget.style.background = '#fff' }}
    >
      <div style={{ width: '4px', height: '40px', borderRadius: '2px', background: cfg.color, flexShrink: 0 }} />

      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000' }}>{risk.supplier_name}</span>
          <span style={{ fontSize: '0.45rem', fontWeight: 800, padding: '2px 5px', borderRadius: '3px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, letterSpacing: '0.05em' }}>
            {cfg.label.toUpperCase()}
          </span>
        </div>
        {card.title && (
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '340px' }}>
            {card.title}
          </div>
        )}
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: cfg.color, fontFamily: 'monospace', lineHeight: 1 }}>
          {(risk.overall_score * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>likelihood</div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', fontFamily: 'monospace', lineHeight: 1 }}>
          {formatINR(card.financial_exposure_inr)}
        </div>
        <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>if it fails</div>
      </div>

      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: urgent ? '#DC2626' : '#000', fontFamily: 'monospace', lineHeight: 1 }}>
          {card.days_to_stockout}d
        </div>
        <div style={{ fontSize: '0.5rem', color: urgent ? '#DC2626' : 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
          {urgent ? '⚠ stockout' : 'to stockout'}
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', fontSize: '0.6875rem', fontWeight: 600, color: needsAction ? cfg.color : 'var(--ink-4)' }}>
          {needsAction ? 'Take action' : 'View detail'}
          <ArrowUpRight size={12} />
        </div>
      </div>
    </div>
  )
}

/* ── Resolved row ────────────────────────────────────────────────────── */
function ResolvedRow({ risk, card, resolvedCardId }: {
  risk: SupplierRiskAnalysis
  card: IntelligentActionCard
  resolvedCardId: string | null
}) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(resolvedCardId ? `/activity/${resolvedCardId}` : `/risks/${risk.supplier_id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr 100px 100px 80px',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem 1rem',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        opacity: 0.6,
        transition: 'opacity 120ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.opacity = '1'; e.currentTarget.style.background = '#F9FAF9' }}
      onMouseLeave={e => { e.currentTarget.style.opacity = '0.6'; e.currentTarget.style.background = 'transparent' }}
    >
      <div style={{ width: '4px', height: '32px', borderRadius: '2px', background: '#16a34a', flexShrink: 0 }} />
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={12} color="#16a34a" />
          <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#166534', textDecoration: 'line-through', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {risk.supplier_name}
          </span>
        </div>
        <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '2px', marginLeft: '1.25rem' }}>
          Action completed
        </div>
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: 'var(--ink-4)' }}>
        {(risk.overall_score * 100).toFixed(0)}% risk
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.75rem', color: '#16a34a', fontWeight: 600, fontFamily: 'monospace' }}>
        {formatINR(card.financial_exposure_inr)}
      </div>
      <div style={{ textAlign: 'right', fontSize: '0.6875rem', color: '#16a34a', fontWeight: 600 }}>
        Resolved
      </div>
    </div>
  )
}

type Filter = 'pending' | 'resolved' | 'all'

export default function PendingActionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data: actionData, isLoading: cardsLoading } = useActionCards()
  const { data: risks, isLoading: risksLoading } = useWeightedRiskAnalysis()
  const { data: procCards, isLoading: procLoading } = useProcurementCards()
  const [filter, setFilter] = useState<Filter>('pending')

  const isLoading = cardsLoading || risksLoading || procLoading

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

  // Procurement card map: supplierId → card
  const procCardMap = useMemo(
    () => new Map((procCards as IntelligentActionCard[] ?? []).map(c => [c.supplier_id, c])),
    [procCards]
  )

  // Resolved supplier IDs (all action cards resolved)
  const resolvedSupplierIds = useMemo(() => {
    const bySupplier = new Map<string, { resolved: number; total: number }>()
    for (const c of actionData?.action_cards ?? []) {
      if (!c.supplier_id) continue
      const entry = bySupplier.get(c.supplier_id) ?? { resolved: 0, total: 0 }
      entry.total++
      if (c.is_resolved) entry.resolved++
      bySupplier.set(c.supplier_id, entry)
    }
    return new Set(
      [...bySupplier.entries()]
        .filter(([, { resolved, total }]) => total > 0 && resolved === total)
        .map(([id]) => id)
    )
  }, [actionData])

  // Resolved card ID per supplier (for navigation to activity summary)
  const resolvedCardIdMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of actionData?.action_cards ?? []) {
      if (!c.supplier_id || !c.is_resolved) continue
      const existing = m.get(c.supplier_id)
      if (!existing || new Date(c.resolved_at ?? c.created_at) > new Date(
        (actionData!.action_cards.find(x => x.id === existing)?.resolved_at ?? '')
      )) {
        m.set(c.supplier_id, c.id)
      }
    }
    return m
  }, [actionData])

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []

  // Active risks — identical filter to RisksPage
  const activeRisks = useMemo(() => riskList.filter(r => {
    if (resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = procCardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    return true
  }), [riskList, resolvedSupplierIds, procCardMap])

  // Resolved risks — identical filter to RisksPage resolved section
  const resolvedRisks = useMemo(() => riskList.filter(r => {
    if (!resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = procCardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    return true
  }), [riskList, resolvedSupplierIds, procCardMap])

  // Sort active by exposure descending (same as Risks page)
  const sortedActive = useMemo(
    () => [...activeRisks].sort((a, b) =>
      (procCardMap.get(b.supplier_id)?.financial_exposure_inr ?? 0) -
      (procCardMap.get(a.supplier_id)?.financial_exposure_inr ?? 0)
    ),
    [activeRisks, procCardMap]
  )

  const totalExposure = useMemo(
    () => activeRisks.reduce((s, r) => s + (procCardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0), 0),
    [activeRisks, procCardMap]
  )
  const totalSaved = useMemo(
    () => resolvedRisks.reduce((s, r) => s + (procCardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0), 0),
    [resolvedRisks, procCardMap]
  )

  const actionNeeded = activeRisks.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length

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
          Mirrors the Risks page — same suppliers, same data
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
              across {activeRisks.length} supplier{activeRisks.length !== 1 ? 's' : ''}
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
              across {resolvedRisks.length} supplier{resolvedRisks.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Action-needed banner */}
      {actionNeeded > 0 && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.625rem 1rem',
          background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.5rem',
          fontSize: '0.8125rem',
        }}>
          <AlertTriangle size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
          <span style={{ color: '#991B1B', fontWeight: 600 }}>
            {actionNeeded} supplier{actionNeeded !== 1 ? 's' : ''} require immediate action
          </span>
        </div>
      )}

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {(['pending', 'resolved'] as Filter[]).map(f => (
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
            {f === 'pending' ? `Pending (${activeRisks.length})` : `Resolved (${resolvedRisks.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '4px 1fr 90px 100px 110px 100px',
          gap: '1rem', padding: '0.625rem 1rem 0.625rem 0',
          background: '#F9F9F9', borderBottom: '1px solid var(--border)',
        }}>
          <div />
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier</div>
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Likelihood</div>
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>If It Fails</div>
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Stockout</div>
          <div />
        </div>

        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>Loading…</div>
        ) : filter === 'pending' ? (
          sortedActive.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center' }}>
              <CheckCircle2 size={32} color="#16a34a" style={{ marginBottom: '0.75rem' }} />
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000' }}>All clear</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>No pending actions at this time</div>
            </div>
          ) : (
            sortedActive.map(r => (
              <PendingRow key={r.supplier_id} risk={r} card={procCardMap.get(r.supplier_id)!} />
            ))
          )
        ) : (
          resolvedRisks.length === 0 ? (
            <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
              No resolved actions yet.
            </div>
          ) : (
            resolvedRisks.map(r => (
              <ResolvedRow
                key={r.supplier_id}
                risk={r}
                card={procCardMap.get(r.supplier_id)!}
                resolvedCardId={resolvedCardIdMap.get(r.supplier_id) ?? null}
              />
            ))
          )
        )}
      </div>

      <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <ClipboardList size={11} />
        Click any row to view supplier risk detail
      </div>

    </div>
  )
}
