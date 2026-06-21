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
  critical: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.12)', label: 'Critical' },
  high:     { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.12)', label: 'High' },
  medium:   { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.12)', label: 'Medium' },
  low:      { color: '#10B981', bg: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.12)', label: 'Low' },
} as const

const FILTER_LEVELS = ['all', 'critical', 'high', 'medium'] as const
type FilterLevel = typeof FILTER_LEVELS[number]

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 60, borderRadius: '8px' }} />
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
      <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 34, height: 34, borderRadius: '50%', background: cfg.bg, border: cfg.border, color: cfg.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem' }}>
              {risk.supplier_name.charAt(0)}
            </div>
            {risk.risk_level === 'critical' && (
              <span style={{ 
                position: 'absolute', 
                top: -1, 
                right: -1, 
                width: 9, 
                height: 9, 
                background: '#EF4444', 
                borderRadius: '50%', 
                border: '2px solid #FFFFFF',
                boxShadow: '0 0 4px rgba(239, 68, 68, 0.4)' 
              }} />
            )}
          </div>
          <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{risk.supplier_name}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
              {card ? `${card.category} · ${card.region}` : 'Supplier'}
            </div>
          </div>
        </div>
      </td>

      <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9', textAlign: 'left' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 750, color: '#0F172A', letterSpacing: '-0.02em' }}>
            {Math.round(priority * 100)}%
          </span>
          <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>Priority</span>
        </div>
      </td>

      <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ display: 'inline-flex', alignSelf: 'flex-start', alignItems: 'center', gap: '4px', fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', color: cfg.color, borderRadius: '20px', background: cfg.bg, border: cfg.border, textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {cfg.label}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500, paddingLeft: '2px' }}>
            {(risk.overall_score * 100).toFixed(0)}% Risk Score
          </span>
        </div>
      </td>

      <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9', textAlign: 'left' }}>
        <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
          {card ? (
            <>
              <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                {formatINR(card.financial_exposure_inr)}
              </span>
              <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>Exposure</span>
            </>
          ) : (
            <span style={{ fontSize: '0.875rem', color: '#CBD5E1' }}>—</span>
          )}
        </div>
      </td>

      <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9' }}>
        {card ? (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: urgent ? '#EF4444' : '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
              {card.days_to_stockout} {card.days_to_stockout === 1 ? 'day' : 'days'}
            </span>
          </div>
        ) : (
          <span style={{ fontSize: '0.875rem', color: '#CBD5E1' }}>—</span>
        )}
      </td>

      <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9', textAlign: 'right' }}>
        <button className="btn-table-action" style={{
          background: needsAction ? '#0F172A' : '#FFFFFF',
          color: needsAction ? '#FFFFFF' : '#334155',
          border: needsAction ? '1px solid #0F172A' : '1px solid #E2E8F0',
          fontWeight: 600,
        }}>
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
    () => new Map(((cards as IntelligentActionCard[] | undefined) ?? []).map(c => [c.supplier_id, c])),
    [cards]
  )

  const resolvedSupplierIds = useMemo(() => {
    const cardsList = actionData?.action_cards ?? []
    const resolved = new Set<string>()
    for (const c of cardsList) {
      if (c.supplier_id && c.is_resolved) {
        resolved.add(c.supplier_id)
      }
    }
    return resolved
  }, [actionData])

  const activeRisks = useMemo(() => riskList.filter(r => {
    if (r.risk_level === 'low') return false
    const card = cardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    
    // Also ensure they actually have an unresolved action card
    const hasUnresolved = (actionData?.action_cards ?? []).some(c => c.supplier_id === r.supplier_id && !c.is_resolved)
    if (!hasUnresolved) return false

    return true
  }), [riskList, cardMap, actionData])

  const resolvedRisks = useMemo(() => riskList.filter(r => {
    if (!resolvedSupplierIds.has(r.supplier_id)) return false
    return true
  }), [riskList, resolvedSupplierIds])

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>

      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-end',
        borderBottom: '1px solid #F1F5F9',
        paddingBottom: '20px',
        marginBottom: '4px',
        flexWrap: 'wrap',
        gap: '16px'
      }}>
        <div>
          <div style={{ 
            fontSize: '0.75rem', 
            color: '#64748B', 
            fontWeight: 500, 
            marginBottom: '8px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}>
            <span 
              onClick={() => navigate('/')} 
              style={{ cursor: 'pointer', transition: 'color 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Dashboard
            </span>
            <span>/</span>
            <span style={{ color: '#0F172A', fontWeight: 600 }}>Risk Analysis</span>
          </div>
          <div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
              Risk Analysis
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px', marginBottom: 0 }}>
              Suppliers ranked by risk severity · take action before exposure grows
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '24px', alignItems: 'flex-end' }}>
          {totalActiveExposure > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.625rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Unresolved Exposure</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#EF4444', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {formatINR(totalActiveExposure)}
              </div>
            </div>
          )}
          {activeRisks.length > 0 && (
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.625rem', color: '#94A3B8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Suppliers at Risk</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#F59E0B', letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums' }}>
                {activeRisks.length}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* View Mode Toggle */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: '2px', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
          <button
            onClick={() => { setViewMode('active'); setSearch('') }}
            style={{
              padding: '6px 12px',
              borderRadius: '5px',
              border: 'none',
              background: viewMode === 'active' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'active' ? '#0F172A' : '#64748B',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: viewMode === 'active' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            Active Risks
          </button>
          <button
            onClick={() => { setViewMode('resolved'); setSearch('') }}
            style={{
              padding: '6px 12px',
              borderRadius: '5px',
              border: 'none',
              background: viewMode === 'resolved' ? '#FFFFFF' : 'transparent',
              color: viewMode === 'resolved' ? '#0F172A' : '#64748B',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: viewMode === 'resolved' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
              transition: 'all 150ms ease',
            }}
          >
            Resolved History ({resolvedRisks.length})
          </button>
        </div>

        {viewMode === 'resolved' && (
          <div style={{ position: 'relative' }}>
            <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
            <input
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search resolved history…"
              style={{
                paddingLeft: '2rem', paddingRight: '1rem', height: '36px',
                border: '1px solid #E2E8F0', borderRadius: '20px',
                fontSize: '0.75rem', outline: 'none', background: '#FFFFFF', width: '240px',
                boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.02)',
                color: '#0F172A',
                transition: 'border-color 150ms ease'
              }}
              onFocus={e => e.target.style.borderColor = '#0F172A'}
              onBlur={e => e.target.style.borderColor = '#E2E8F0'}
            />
          </div>
        )}
      </div>

      {viewMode === 'active' && (
        <>
          {/* Action-needed banner */}
          {actionNeeded > 0 && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: '12px',
              padding: '10px 16px',
              background: '#FFF5F5', border: '1px solid #FEE2E2', borderRadius: '10px',
              fontSize: '0.75rem',
            }}>
              {/* Pulsing Dot & label */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                <span 
                  className="alert-beacon"
                  style={{ 
                    width: 6, 
                    height: 6, 
                    background: '#EF4444', 
                  }} 
                />
                <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                  Risk Alert
                </span>
              </div>

              <div style={{ width: '1px', height: '16px', background: '#FCA5A5', flexShrink: 0 }} />

              <span style={{ color: '#7F1D1D', fontWeight: 700 }}>
                {actionNeeded} supplier{actionNeeded !== 1 ? 's' : ''} require immediate action
              </span>
              <span style={{ color: '#B91C1C' }}>—</span>
              <span style={{ color: '#B91C1C', fontWeight: 600 }}>
                {counts.critical > 0 && `${counts.critical} critical`}
                {counts.critical > 0 && counts.high > 0 && ' · '}
                {counts.high > 0 && `${counts.high} high risk`}
              </span>
            </div>
          )}

          {customWeightsActive && (
            <div style={{ padding: '10px 16px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '10px', fontSize: '0.75rem', color: '#475569', display: 'flex', alignItems: 'center', gap: '12px' }}>
              <AlertOctagon size={14} style={{ color: '#F59E0B' }} />
              <span><strong>Custom weights active</strong> — risk scores reflect your settings profile.</span>
            </div>
          )}

          {/* Filter tabs + search */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #F1F5F9', paddingBottom: '0' }}>
            <div style={{ display: 'flex', gap: '1.5rem' }}>
              {FILTER_LEVELS.map(level => {
                const count = level === 'all' ? activeRisks.length : counts[level as keyof typeof counts]
                const cfg = level !== 'all' ? LEVEL_CONFIG[level] : null
                const isActive = filter === level
                return (
                  <button
                    key={level}
                    onClick={() => setFilter(level)}
                    style={{
                      padding: '12px 0',
                      background: 'none', border: 'none',
                      borderBottom: `2px solid ${isActive ? '#0F172A' : 'transparent'}`,
                      fontSize: '0.875rem', fontWeight: 600,
                      color: isActive ? '#0F172A' : '#64748B',
                      cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: '6px',
                      marginBottom: '-1px', transition: 'all 150ms ease',
                      textTransform: 'capitalize',
                    }}
                  >
                    {level}
                    {count > 0 && (
                      <span style={{
                        fontSize: '0.6875rem', fontWeight: 700,
                        padding: '2px 8px', borderRadius: '20px',
                        background: isActive && cfg ? cfg.bg : '#F1F5F9',
                        color: isActive && cfg ? cfg.color : '#64748B',
                        border: isActive && cfg ? cfg.border : 'none',
                      }}>{count}</span>
                    )}
                  </button>
                )
              })}
            </div>
            <div style={{ position: 'relative', marginBottom: '8px' }}>
              <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search active suppliers…"
                style={{
                  paddingLeft: '2rem', paddingRight: '1rem', height: '36px',
                  border: '1px solid #E2E8F0', borderRadius: '20px',
                  fontSize: '0.75rem', outline: 'none', background: '#FFFFFF', width: '240px',
                  boxShadow: 'inset 0 1px 2px rgba(15,23,42,0.02)',
                  color: '#0F172A',
                  transition: 'border-color 150ms ease'
                }}
                onFocus={e => e.target.style.borderColor = '#0F172A'}
                onBlur={e => e.target.style.borderColor = '#E2E8F0'}
              />
            </div>
          </div>
        </>
      )}

      {/* Active Risks Table Wrapper */}
      {viewMode === 'active' && (
        <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 10px 20px rgba(0, 0, 0, 0.02)' }}>
          {isLoading ? (
            <div style={{ padding: '1.25rem' }}><Skeleton /></div>
          ) : filtered.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.875rem' }}>
              {activeRisks.length === 0 && resolvedRisks.length > 0
                ? '🎉 All risks have been resolved.'
                : 'No active suppliers match the current filter.'}
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '800px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <th style={{ width: '30%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Supplier</th>
                    <th style={{ width: '15%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Action Priority</th>
                    <th style={{ width: '15%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Risk Score</th>
                    <th style={{ width: '15%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Money at Risk</th>
                    <th style={{ width: '15%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Days of Stock Left</th>
                    <th style={{ width: '10%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}></th>
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
        <div style={{ display: 'flex', flexDirection: 'column', background: '#FFFFFF', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 10px 20px rgba(0, 0, 0, 0.02)' }}>
          {isLoading ? (
            <div style={{ padding: '1.25rem' }}><Skeleton /></div>
          ) : filteredResolved.length === 0 ? (
            <div style={{ padding: '4rem 2rem', textAlign: 'center', color: '#94A3B8', fontSize: '0.875rem' }}>
              No resolved suppliers match your search.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '700px' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid #F1F5F9', background: '#FAFAFA' }}>
                    <th style={{ width: '40%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Supplier</th>
                    <th style={{ width: '20%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Money Protected</th>
                    <th style={{ width: '25%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Risk Score at Time of Issue</th>
                    <th style={{ width: '15%', padding: '12px 20px', fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}></th>
                  </tr>
                </thead>
                <tbody>
                  {filteredResolved.map(r => {
                    const cardId = getResolvedCardId(r.supplier_id)
                    return (
                      <tr
                        key={r.supplier_id}
                        onClick={() => navigate(cardId ? `/activity/${cardId}` : `/risks/${r.supplier_id}`)}
                        style={{ cursor: 'pointer' }}
                        className="table-row-hover"
                      >
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9' }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                            <div style={{ position: 'relative', flexShrink: 0 }}>
                              <div style={{ width: 34, height: 34, borderRadius: '50%', background: '#D1FAE5', color: '#047857', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700, fontSize: '0.8125rem' }}>
                                {r.supplier_name.charAt(0)}
                              </div>
                              <div style={{ position: 'absolute', bottom: -1, right: -1, width: 14, height: 14, borderRadius: '50%', background: '#059669', border: '2px solid #FFFFFF', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                <CheckCircle2 size={10} color="#FFFFFF" />
                              </div>
                            </div>
                            <div style={{ minWidth: 0, display: 'flex', flexDirection: 'column', gap: '2px' }}>
                              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{r.supplier_name}</div>
                              <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
                                Supplier
                              </div>
                            </div>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9', textAlign: 'left' }}>
                          <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: '2px' }}>
                            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', fontVariantNumeric: 'tabular-nums' }}>
                              {formatINR((actionData?.action_cards ?? []).filter(c => c.supplier_id === r.supplier_id && c.is_resolved).reduce((acc, curr) => acc + (curr.estimated_impact_inr || 0), 0))}
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#94A3B8', fontWeight: 500 }}>Resolved</span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9' }}>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                            <span style={{ display: 'inline-flex', alignSelf: 'flex-start', fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', background: '#F1F5F9', color: '#334155', borderRadius: '20px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                              Mitigated
                            </span>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500, paddingLeft: '2px' }}>
                              {(r.overall_score * 100).toFixed(0)}% Risk Score
                            </span>
                          </div>
                        </td>
                        <td style={{ padding: '16px 20px', verticalAlign: 'middle', borderBottom: '1px solid #F1F5F9', textAlign: 'right' }}>
                          <button className="btn-table-action" style={{ fontWeight: 600 }}>
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
        .table-row-hover td {
          transition: background 150ms ease;
        }
        .table-row-hover:hover td {
          background: #F8FAFC;
        }
        .btn-table-action {
          background: #FFFFFF;
          color: #334155;
          border: 1px solid #E2E8F0;
          cursor: pointer;
          transition: all 150ms ease;
          outline: none;
          padding: 6px 14px;
          border-radius: 6px;
          font-size: 0.75rem;
          box-shadow: 0 1px 2px rgba(15,23,42,0.02);
        }
        .btn-table-action:hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
        }
        @keyframes beacon-glow {
          0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.75); }
          70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
          100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
        }
        .alert-beacon {
          display: inline-block;
          border-radius: 50%;
          animation: beacon-glow 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
        }
      `}</style>
    </div>
  )
}
