import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeightedRiskAnalysis, useProcurementCards, useActionCards } from '../hooks/useQueries'
import {
  Search, AlertOctagon, CheckCircle2
} from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

const LEVEL_CONFIG = {
  critical: { color: '#B91C1C', bg: '#FEE2E2', border: 'transparent', label: 'Critical' },
  high:     { color: '#B45309', bg: '#FEF3C7', border: 'transparent', label: 'High' },
  medium:   { color: '#1D4ED8', bg: '#DBEAFE', border: 'transparent', label: 'Medium' },
  low:      { color: '#047857', bg: '#D1FAE5', border: 'transparent', label: 'Low' },
} as const

const FILTER_LEVELS = ['all', 'critical', 'high', 'medium'] as const
type FilterLevel = typeof FILTER_LEVELS[number]



function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 64, borderRadius: '0.5rem' }} />
      ))}
    </div>
  )
}

function priorityScore(riskScore: number, exposureInr: number): number {
  const normExposure = Math.min(exposureInr / 500_000, 1)
  return riskScore * 0.5 + normExposure * 0.5
}

/* ── Risk Row ───────────────────────────────────────────────────────────── */
function RiskRow({ risk, card }: { risk: SupplierRiskAnalysis; card?: IntelligentActionCard }) {
  const navigate = useNavigate()
  const cfg = LEVEL_CONFIG[risk.risk_level] ?? LEVEL_CONFIG.low
  const urgent = card && card.days_to_stockout <= 7
  const needsAction = risk.risk_level === 'critical' || risk.risk_level === 'high'
  const priority = priorityScore(risk.overall_score, card?.financial_exposure_inr ?? 0)

  return (
    <tr
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      style={{ cursor: 'pointer' }}
      className="table-row-hover"
    >
      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 36, height: 36, borderRadius: '50%', background: cfg.bg, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
              {risk.supplier_name.charAt(0)}
            </div>
            {risk.risk_level === 'critical' && <div style={{ position: 'absolute', top: -1, right: -1, width: 10, height: 10, background: '#EF4444', borderRadius: '50%', border: '2px solid #fff' }} />}
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{risk.supplier_name}</div>
            <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'capitalize' }}>
              {card ? `${card.category} · ${card.region}` : 'Supplier'}
            </div>
          </div>
        </div>
      </td>

      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
            {Math.round(priority * 100)}%
          </span>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Priority</span>
        </div>
      </td>

      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '4px', fontSize: '0.75rem', fontWeight: 500, padding: '2px 8px', color: cfg.color, borderRadius: '99px', background: cfg.bg }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#6B7280', paddingLeft: '2px' }}>
            {(risk.overall_score * 100).toFixed(0)}% Likelihood
          </span>
        </div>
      </td>

      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          {card ? (
            <>
              <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                {formatINR(card.financial_exposure_inr)}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Exposure</span>
            </>
          ) : (
            <span style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>—</span>
          )}
        </div>
      </td>

      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
        {card ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: urgent ? '#B91C1C' : '#111827' }}>
              {card.days_to_stockout} {card.days_to_stockout === 1 ? 'day' : 'days'}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '0.875rem', color: '#9CA3AF' }}>—</span>
        )}
      </td>

      <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
        <button className="btn-table-action">
          {needsAction ? 'Act Now' : 'Review'}
        </button>
      </td>
    </tr>
  )
}

/* ── Risks Page ─────────────────────────────────────────────────────────── */
export default function RisksPage() {
  const navigate = useNavigate()
  const [viewMode, setViewMode] = useState<'active' | 'resolved'>('active')
  const [filter, setFilter] = useState<FilterLevel>('all')
  const [search, setSearch] = useState('')

  const { data: risks, isLoading, isCustom: customWeightsActive } = useWeightedRiskAnalysis()
  const { data: cards } = useProcurementCards()
  const { data: actionData } = useActionCards()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const cardMap = useMemo(
    () => new Map((cards as IntelligentActionCard[] | undefined ?? []).map(c => [c.supplier_id, c])),
    [cards]
  )

  const resolvedSupplierIds = useMemo(() => {
    const cardsList = actionData?.action_cards ?? []
    const bySupplier = new Map<string, { resolved: number; total: number }>()
    for (const c of cardsList) {
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

  const activeRisks = useMemo(() => riskList.filter(r => {
    if (resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = cardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    return true
  }), [riskList, resolvedSupplierIds, cardMap])

  const resolvedRisks = useMemo(() => riskList.filter(r => {
    if (!resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = cardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    return true
  }), [riskList, resolvedSupplierIds, cardMap])

  const counts = useMemo(() => ({
    critical: activeRisks.filter(r => r.risk_level === 'critical').length,
    high:     activeRisks.filter(r => r.risk_level === 'high').length,
    medium:   activeRisks.filter(r => r.risk_level === 'medium').length,
  }), [activeRisks])

  const filtered = useMemo(() => {
    let list = [...activeRisks].sort((a, b) => {
      const expA = cardMap.get(a.supplier_id)?.financial_exposure_inr ?? 0
      const expB = cardMap.get(b.supplier_id)?.financial_exposure_inr ?? 0
      return expB - expA
    })
    if (filter !== 'all') list = list.filter(r => r.risk_level === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => r.supplier_name.toLowerCase().includes(q))
    }
    return list
  }, [activeRisks, cardMap, filter, search])

  const filteredResolved = useMemo(() => {
    let list = [...resolvedRisks]
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => r.supplier_name.toLowerCase().includes(q))
    }
    return list
  }, [resolvedRisks, search])

  const actionNeeded = activeRisks.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length

  const totalActiveExposure = useMemo(
    () => activeRisks.reduce((sum, r) => sum + (cardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0), 0),
    [activeRisks, cardMap]
  )

  function getResolvedCardId(supplierId: string): string | null {
    const cardsList = actionData?.action_cards ?? []
    return cardsList
      .filter(c => c.supplier_id === supplierId && c.is_resolved)
      .sort((a: any, b: any) => new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime())[0]?.id ?? null
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: '0.375rem' }}>
          Dashboard / Risk Analysis
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
              Risk Analysis
            </h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
              Suppliers ranked by risk severity · take action before exposure grows
            </p>
          </div>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'flex-end' }}>
            {totalActiveExposure > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Unresolved Exposure</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#DC2626', fontFamily: 'monospace' }}>
                  {formatINR(totalActiveExposure)}
                </div>
              </div>
            )}
            {activeRisks.length > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Suppliers at Risk</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#D97706', fontFamily: 'monospace' }}>
                  {activeRisks.length}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* View Mode Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '1rem' }}>
        <div style={{ display: 'flex', gap: '2px', background: '#F3F4F6', padding: '4px', borderRadius: '8px', width: 'fit-content' }}>
          <button
            onClick={() => { setViewMode('active'); setSearch('') }}
            style={{
              padding: '0.375rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'active' ? '#fff' : 'transparent',
              color: viewMode === 'active' ? '#111827' : '#6B7280',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: viewMode === 'active' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            Active Risks
          </button>
          <button
            onClick={() => { setViewMode('resolved'); setSearch('') }}
            style={{
              padding: '0.375rem 1rem',
              borderRadius: '6px',
              border: 'none',
              background: viewMode === 'resolved' ? '#fff' : 'transparent',
              color: viewMode === 'resolved' ? '#111827' : '#6B7280',
              fontSize: '0.8125rem',
              fontWeight: 500,
              cursor: 'pointer',
              boxShadow: viewMode === 'resolved' ? '0 1px 3px rgba(0,0,0,0.1)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            Resolved History ({resolvedRisks.length})
          </button>
        </div>

        {viewMode === 'resolved' && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search resolved history…"
              style={{
                paddingLeft: '2rem', paddingRight: '1rem', height: '36px',
                border: '1px solid #D1D5DB', borderRadius: '8px',
                fontSize: '0.8125rem', outline: 'none', background: '#fff', width: '240px',
                boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
              }}
            />
          </div>
        )}
      </div>

      {viewMode === 'active' && (
        <>
          {/* Action-needed banner */}
          {actionNeeded > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.75rem',
              padding: '0.625rem 1rem',
              background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.5rem',
              fontSize: '0.8125rem',
            }}>
              <AlertOctagon size={14} style={{ color: '#DC2626', flexShrink: 0 }} />
              <span style={{ color: '#991B1B', fontWeight: 600 }}>
                {actionNeeded} supplier{actionNeeded !== 1 ? 's' : ''} require immediate action
              </span>
              <span style={{ color: '#B91C1C' }}>—</span>
              <span style={{ color: '#B91C1C' }}>
                {counts.critical > 0 && `${counts.critical} critical`}
                {counts.critical > 0 && counts.high > 0 && ', '}
                {counts.high > 0 && `${counts.high} high risk`}
              </span>
            </div>
          )}

          {customWeightsActive && (
            <div style={{ padding: '0.625rem 1rem', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink-2)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <AlertOctagon size={13} style={{ color: '#D97706' }} />
              <span><strong>Custom weights active</strong> — risk scores reflect your settings profile.</span>
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
            <div style={{ display: 'flex', gap: '1rem' }}>
              {FILTER_LEVELS.map(level => {
                const count = level === 'all' ? activeRisks.length : counts[level as keyof typeof counts]
                const cfg = level !== 'all' ? LEVEL_CONFIG[level] : null
                const isActive = filter === level
                return (
                  <button
                    key={level}
                    onClick={() => setFilter(level)}
                    style={{
                      padding: '0.75rem 0',
                      background: 'none', border: 'none',
                      borderBottom: `2px solid ${isActive ? '#111827' : 'transparent'}`,
                      fontSize: '0.875rem', fontWeight: 500,
                      color: isActive ? '#111827' : '#6B7280',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '0.375rem',
                      marginBottom: '-1px', transition: 'color 150ms',
                      textTransform: 'capitalize',
                    }}
                  >
                    {level}
                    {count > 0 && (
                      <span style={{
                        fontSize: '0.6875rem', fontWeight: 600,
                        padding: '1px 6px', borderRadius: '99px',
                        background: isActive && cfg ? cfg.bg : '#F3F4F6',
                        color: isActive && cfg ? cfg.color : '#6B7280',
                      }}>{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#9CA3AF' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search active suppliers…"
                style={{
                  paddingLeft: '2rem', paddingRight: '1rem', height: '36px',
                  border: '1px solid #D1D5DB', borderRadius: '8px',
                  fontSize: '0.8125rem', outline: 'none', background: '#fff', width: '240px',
                  boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
                }}
              />
            </div>
          </div>
        </>
      )}

      {/* Active Risks Table Wrapper */}
      {viewMode === 'active' && (
        <div className="card-flush" style={{ display: 'flex', flexDirection: 'column', background: '#fff', borderRadius: '1.5rem' }}>
          {isLoading ? (
            <div style={{ padding: '1.25rem' }}><Skeleton /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
              {activeRisks.length === 0 && resolvedRisks.length > 0
                ? '🎉 All risks have been resolved.'
                : 'No active suppliers match the current filter.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'transparent' }}>
                    <th style={{ width: '30%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Supplier</th>
                    <th style={{ width: '15%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Action Priority</th>
                    <th style={{ width: '15%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Chance of Failure</th>
                    <th style={{ width: '15%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Money at Risk</th>
                    <th style={{ width: '15%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Days of Stock Left</th>
                    <th style={{ width: '10%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(r => (
                    <RiskRow key={r.supplier_id} risk={r} card={cardMap.get(r.supplier_id)} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Resolved History Table Wrapper */}
      {viewMode === 'resolved' && (
        <div className="card-flush" style={{ display: 'flex', flexDirection: 'column', background: '#fff' }}>
          {isLoading ? (
            <div style={{ padding: '1.25rem' }}><Skeleton /></div>
          ) : filteredResolved.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
              No resolved suppliers match your search.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)', background: 'transparent' }}>
                    <th style={{ width: '40%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Supplier</th>
                    <th style={{ width: '20%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Money Protected</th>
                    <th style={{ width: '25%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Original Likelihood</th>
                    <th style={{ width: '15%', padding: '0.75rem 1rem', fontSize: '0.6875rem', fontWeight: 600, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResolved.map(r => {
                    const card = cardMap.get(r.supplier_id)
                    const cardId = getResolvedCardId(r.supplier_id)
                    return (
                      <tr
                        key={r.supplier_id}
                        onClick={() => navigate(cardId ? `/activity/${cardId}` : `/risks/${r.supplier_id}`)}
                        style={{ cursor: 'pointer' }}
                        className="table-row-hover"
                      >
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#D1FAE5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 600, fontSize: '0.875rem' }}>
                                {r.supplier_name.charAt(0)}
                              </div>
                              <div style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: '50%', background: '#059669', border: '2px solid #fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle2 size={10} color="#fff" />
                              </div>
                            </div>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>{r.supplier_name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#6B7280', textTransform: 'capitalize' }}>
                                {card ? `${card.category} · ${card.region}` : 'Supplier'}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827' }}>
                              {card ? formatINR(card.financial_exposure_inr) : '—'}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>Resolved</span>
                          </div>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ display: 'inline-flex', alignSelf: 'flex-start', fontSize: '0.75rem', fontWeight: 500, padding: '2px 8px', background: '#F3F4F6', color: '#374151', borderRadius: '99px' }}>
                              Mitigated
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#6B7280', paddingLeft: '2px' }}>
                              {(r.overall_score * 100).toFixed(0)}% Risk Score
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '0.875rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)', textAlign: 'right' }}>
                          <button className="btn-table-action">
                            View Detail
                          </button>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <style>{`
        .table-row-hover {
          background: var(--bg-card);
        }
        .table-row-hover td {
          transition: background 150ms ease;
        }
        .table-row-hover:hover td {
          background: var(--bg-hover);
        }
        .btn-table-action {
          background: #fff;
          color: #374151;
          border: 1px solid #D1D5DB;
          cursor: pointer;
          transition: all 150ms ease;
          outline: none;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 0.75rem;
          font-weight: 500;
          box-shadow: 0 1px 2px rgba(0,0,0,0.05);
        }
        .table-row-hover:hover .btn-table-action {
          background: #F9FAFB;
          border-color: #9CA3AF;
        }
        @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
      `}</style>
    </div>
  )
}
