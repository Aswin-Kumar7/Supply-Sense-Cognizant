import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useWeightedRiskAnalysis, useProcurementCards, useDisruptions, useFinancialSummary } from '../hooks/useQueries'
import { Search, AlertTriangle, ArrowRight } from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

const LEVEL_CONFIG = {
  critical: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'Critical' },
  high:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'High' },
  medium:   { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'Medium' },
  low:      { color: '#059669', bg: '#F0FDF4', border: '#BBF7D0', label: 'Low' },
} as const

const FILTER_LEVELS = ['all', 'critical', 'high', 'medium', 'low'] as const
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

// Priority = normalised risk × normalised exposure. Both must matter.
// Exposure is normalised against a ₹5L ceiling for display purposes.
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
    <div
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr 72px 90px 100px 110px 100px',
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
      {/* Severity strip */}
      <div style={{ width: '4px', height: '40px', borderRadius: '2px', background: cfg.color, flexShrink: 0 }} />

      {/* Name + issue */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000' }}>{risk.supplier_name}</span>
          <span style={{ fontSize: '0.45rem', fontWeight: 800, padding: '2px 5px', borderRadius: '3px', background: cfg.bg, color: cfg.color, border: `1px solid ${cfg.border}`, letterSpacing: '0.05em' }}>
            {cfg.label.toUpperCase()}
          </span>
        </div>
        {card?.title && (
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '380px' }}>
            {card.title}
          </div>
        )}
      </div>

      {/* Priority score — the combined metric */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: priority >= 0.6 ? '#DC2626' : priority >= 0.4 ? '#D97706' : 'var(--ink-3)', fontFamily: 'monospace', lineHeight: 1 }}>
          {(priority * 100).toFixed(0)}
          <span style={{ fontSize: '0.6rem', fontWeight: 500 }}>%</span>
        </div>
        <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>priority</div>
      </div>

      {/* Risk score */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: cfg.color, fontFamily: 'monospace', lineHeight: 1 }}>
          {(risk.overall_score * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>likelihood</div>
      </div>

      {/* Exposure */}
      <div style={{ textAlign: 'right' }}>
        {card ? (
          <>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', fontFamily: 'monospace', lineHeight: 1 }}>
              {formatINR(card.financial_exposure_inr)}
            </div>
            <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', marginTop: '2px' }}>if it fails</div>
          </>
        ) : (
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>—</div>
        )}
      </div>

      {/* Days to stockout */}
      <div style={{ textAlign: 'right' }}>
        {card ? (
          <>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: urgent ? '#DC2626' : '#000', fontFamily: 'monospace', lineHeight: 1 }}>
              {card.days_to_stockout}d
            </div>
            <div style={{ fontSize: '0.5rem', color: urgent ? '#DC2626' : 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginTop: '2px' }}>
              {urgent ? '⚠ stockout' : 'to stockout'}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>—</div>
        )}
      </div>

      {/* Action */}
      <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.25rem',
          fontSize: '0.6875rem', fontWeight: 600,
          color: needsAction ? cfg.color : 'var(--ink-4)',
        }}>
          {needsAction ? 'Take action' : 'View detail'}
          <ArrowRight size={12} />
        </div>
      </div>
    </div>
  )
}

/* ── Risks Page ─────────────────────────────────────────────────────────── */
export default function RisksPage() {
  const [filter, setFilter] = useState<FilterLevel>('all')
  const [search, setSearch] = useState('')

  const { data: risks, isLoading, isCustom: customWeightsActive } = useWeightedRiskAnalysis()
  const { data: cards } = useProcurementCards()
  const { data: disruptions } = useDisruptions()
  const { data: financial } = useFinancialSummary()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const cardMap = useMemo(
    () => new Map((cards as IntelligentActionCard[] | undefined ?? []).map(c => [c.supplier_id, c])),
    [cards]
  )

  const counts = useMemo(() => ({
    critical: riskList.filter(r => r.risk_level === 'critical').length,
    high:     riskList.filter(r => r.risk_level === 'high').length,
    medium:   riskList.filter(r => r.risk_level === 'medium').length,
    low:      riskList.filter(r => r.risk_level === 'low').length,
  }), [riskList])

  const filtered = useMemo(() => {
    // Sort by exposure descending — highest financial impact first
    let list = [...riskList].sort((a, b) => {
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
  }, [riskList, cardMap, filter, search])

  const actionNeeded = riskList.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length

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
            {financial && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Exposure</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#DC2626', fontFamily: 'monospace' }}>
                  {formatINR(financial.total_financial_exposure_inr)}
                </div>
              </div>
            )}
            {disruptions && disruptions.total_active > 0 && (
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Active Disruptions</div>
                <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#D97706', fontFamily: 'monospace' }}>
                  {disruptions.total_active}
                </div>
              </div>
            )}
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
          <AlertTriangle size={13} style={{ color: '#D97706' }} />
          <span><strong>Custom weights active</strong> — risk scores reflect your settings profile.</span>
        </div>
      )}

      {/* Filter tabs + search */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '0' }}>
        <div style={{ display: 'flex', gap: '0' }}>
          {FILTER_LEVELS.map(level => {
            const count = level === 'all' ? riskList.length : counts[level as keyof typeof counts]
            const cfg = level !== 'all' ? LEVEL_CONFIG[level] : null
            const isActive = filter === level
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                style={{
                  padding: '0.625rem 1rem',
                  background: 'none', border: 'none',
                  borderBottom: `2px solid ${isActive ? '#000' : 'transparent'}`,
                  fontSize: '0.8125rem', fontWeight: isActive ? 700 : 500,
                  color: isActive ? '#000' : 'var(--ink-4)',
                  cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.4rem',
                  marginBottom: '-1px', transition: 'color 150ms',
                  textTransform: 'capitalize',
                }}
              >
                {level}
                {count > 0 && (
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 700,
                    padding: '1px 5px', borderRadius: '99px',
                    background: isActive && cfg ? cfg.bg : 'var(--bg-hover)',
                    color: isActive && cfg ? cfg.color : 'var(--ink-4)',
                    border: `1px solid ${isActive && cfg ? cfg.border : 'transparent'}`,
                  }}>{count}</span>
                )}
              </button>
            )
          })}
        </div>
        <div style={{ position: 'relative', marginBottom: '2px' }}>
          <Search size={13} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search suppliers…"
            style={{
              paddingLeft: '2rem', paddingRight: '0.75rem', height: '32px',
              border: '1px solid var(--border)', borderRadius: '0.375rem',
              fontSize: '0.8125rem', outline: 'none', background: '#fff', width: '220px',
            }}
          />
        </div>
      </div>

      {/* Table header */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '4px 1fr 72px 90px 100px 110px 100px',
        gap: '1rem', padding: '0 1rem 0.5rem 0',
        borderBottom: '2px solid #000',
      }}>
        <div />
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supplier</div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Priority ↓</div>
          <div style={{ fontSize: '0.45rem', color: 'var(--ink-4)', marginTop: '1px' }}>risk × exposure</div>
        </div>
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Likelihood</div>
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>If It Fails</div>
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Stockout</div>
        <div />
      </div>

      {/* Rows */}
      {isLoading ? (
        <Skeleton />
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
          No suppliers match the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {filtered.map(r => (
            <RiskRow key={r.supplier_id} risk={r} card={cardMap.get(r.supplier_id)} />
          ))}
        </div>
      )}

    </div>
  )
}
