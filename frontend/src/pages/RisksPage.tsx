import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWeightedRiskAnalysis, useProcurementCards, useDisruptions, useFinancialSummary } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Skeleton({ h = 80 }: { h?: number }) {
  return <div className="skeleton" style={{ width: '100%', height: h, borderRadius: 10 }} />
}

const FILTER_LEVELS = ['all', 'critical', 'high', 'medium', 'low'] as const
type FilterLevel = typeof FILTER_LEVELS[number]

const RISK_BORDER: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
}
const RISK_BG: Record<string, string> = {
  critical: 'rgba(220,38,38,0.03)', high: 'rgba(217,119,6,0.02)', medium: 'rgba(37,99,235,0.02)', low: 'rgba(5,150,105,0.02)',
}

const FACTOR_ICON: Record<string, string> = {
  disruption_severity:      '🌀',
  inventory_pressure:       '📦',
  delivery_reliability:     '🚚',
  logistics_vulnerability:  '🛣️',
  dependency_exposure:      '🔗',
  festival_proximity:       '🎆',
}

/* ── Risk card ──────────────────────────────────────────────────────── */
function RiskCard({ risk, card }: { risk: SupplierRiskAnalysis; card?: IntelligentActionCard }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)

  const border = RISK_BORDER[risk.risk_level] ?? 'var(--border)'
  const bg     = hovered ? 'var(--bg-hover)' : RISK_BG[risk.risk_level] ?? 'var(--bg-card)'

  const sortedFactors = Object.entries(risk.factors ?? {})
    .sort(([, a], [, b]) => b.weighted - a.weighted)

  const [primaryName, primaryFactor] = sortedFactors[0] ?? ['', null]
  const primaryIcon = FACTOR_ICON[primaryName] ?? '⚠️'
  const secondaryFactors = sortedFactors.slice(1, 4)

  return (
    <div
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: 'var(--bg-card)',
        border: `1px solid ${hovered ? border : 'var(--border)'}`,
        borderLeft: `4px solid ${border}`,
        borderRadius: '0.875rem',
        padding: '1.125rem 1.25rem',
        cursor: 'pointer',
        transition: 'all 150ms cubic-bezier(0.16,1,0.3,1)',
        boxShadow: hovered ? '0 4px 16px rgba(0,0,0,0.08)' : '0 1px 3px rgba(0,0,0,0.05)',
        backgroundColor: bg,
      }}
    >
      {/* Header row: signal headline + score */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Signal badges row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <Badge level={risk.risk_level} />
            <span style={{
              fontSize: '0.625rem', padding: '2px 7px', borderRadius: '999px',
              background: 'var(--border-strong)', color: 'var(--ink-3)', fontWeight: 600, textTransform: 'capitalize',
            }}>
              {primaryIcon} {primaryName.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'var(--ink-4)' }}>
              {(risk.confidence * 100).toFixed(0)}% confidence
            </span>
            {risk.human_review_required && (
              <span style={{
                fontSize: '0.625rem', padding: '1px 6px', borderRadius: '999px',
                background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', fontWeight: 600,
              }}>
                Review Required
              </span>
            )}
          </div>

          {/* Event/issue title as headline */}
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-1)', marginTop: '0.375rem', lineHeight: 1.4 }}>
            {card?.title ?? (primaryFactor?.explanation ?? 'Risk score elevated')}
          </h3>

          {/* Supplier meta row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.375rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-2)' }}>{risk.supplier_name}</span>
            {card && (
              <>
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-5)' }}>·</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{card.city}, {card.region}</span>
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-5)' }}>·</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{card.category}</span>
              </>
            )}
          </div>

          {/* Primary signal explanation (secondary detail) */}
          {primaryFactor && (
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '0.375rem', lineHeight: 1.5 }}>
              {primaryFactor.explanation}
            </p>
          )}
        </div>

        {/* Score */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: border, letterSpacing: '-0.03em', lineHeight: 1 }}>
            {(risk.overall_score * 100).toFixed(0)}
            <span style={{ fontSize: '1rem', fontWeight: 500, color: 'var(--ink-4)' }}>%</span>
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '0.125rem' }}>risk score</div>
        </div>
      </div>

      {/* Secondary signals */}
      {secondaryFactors.length > 0 && (
        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.875rem', flexWrap: 'wrap' }}>
          {secondaryFactors.map(([name, f]) => (
            <div key={name} style={{
              flex: '1 1 150px',
              background: 'var(--bg-hover)',
              border: '1px solid #E2E8F0',
              borderRadius: '0.5rem',
              padding: '0.5rem 0.625rem',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginBottom: '4px' }}>
                <span style={{ fontSize: '0.75rem' }}>{FACTOR_ICON[name] ?? '·'}</span>
                <div style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--ink-3)', textTransform: 'capitalize' }}>
                  {name.replace(/_/g, ' ')}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                <div style={{ flex: 1, height: '4px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${(f.value * 100).toFixed(0)}%`,
                    height: '100%',
                    background: border,
                    borderRadius: '999px',
                    transition: 'width 0.5s ease',
                  }} />
                </div>
                <span style={{ fontSize: '0.6875rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-2)', flexShrink: 0 }}>
                  {(f.value * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '3px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {f.explanation}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Footer: products + financial context + action */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
          {card ? (
            <>
              <div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500 }}>Exposure</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#DC2626', fontFamily: 'JetBrains Mono, monospace' }}>
                  {formatINR(card.financial_exposure_inr)}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500 }}>Stockout in</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: card.days_to_stockout <= 7 ? '#DC2626' : card.days_to_stockout <= 14 ? '#D97706' : 'var(--ink-2)' }}>
                  {card.days_to_stockout}d
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500 }}>Products</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink-2)' }}>
                  {card.affected_skus} SKU{card.affected_skus !== 1 ? 's' : ''}
                </div>
              </div>
              {card.escalation_window && (
                <div>
                  <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500 }}>Escalate by</div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#D97706' }}>{card.escalation_window}</div>
                </div>
              )}
            </>
          ) : (
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>No procurement data available</span>
          )}
        </div>
        <span style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, flexShrink: 0 }}>View details →</span>
      </div>
    </div>
  )
}

/* ── Risks page ─────────────────────────────────────────────────────── */
export default function RisksPage() {
  const [searchParams] = useSearchParams()
  const initFilter = (searchParams.get('filter') ?? 'all') as FilterLevel
  const [filter, setFilter] = useState<FilterLevel>(initFilter)
  const [search, setSearch] = useState(searchParams.get('q') ?? '')

  const { data: risks, isLoading: loadingRisks, isCustom: customWeightsActive } = useWeightedRiskAnalysis()
  const { data: cards } = useProcurementCards()
  const { data: disruptions } = useDisruptions()
  const { data: financial } = useFinancialSummary()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const cardMap = useMemo(
    () => new Map((cards as IntelligentActionCard[] | undefined ?? []).map(c => [c.supplier_id, c])),
    [cards]
  )

  const filtered = useMemo(() => {
    let list = [...riskList].sort((a, b) => {
      const ORDER = { critical: 3, high: 2, medium: 1, low: 0 }
      const lvlDiff = (ORDER[b.risk_level as keyof typeof ORDER] ?? 0) - (ORDER[a.risk_level as keyof typeof ORDER] ?? 0)
      return lvlDiff !== 0 ? lvlDiff : b.overall_score - a.overall_score
    })
    if (filter !== 'all') list = list.filter(r => r.risk_level === filter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(r => r.supplier_name.toLowerCase().includes(q))
    }
    return list
  }, [riskList, filter, search])

  const counts = useMemo(() => ({
    critical: riskList.filter(r => r.risk_level === 'critical').length,
    high:     riskList.filter(r => r.risk_level === 'high').length,
    medium:   riskList.filter(r => r.risk_level === 'medium').length,
    low:      riskList.filter(r => r.risk_level === 'low').length,
  }), [riskList])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>Risks</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
            {filtered.length} supplier{filtered.length !== 1 ? 's' : ''} · sorted by severity
          </p>
        </div>

        {/* Summary pills */}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {financial && (
            <div style={{ padding: '0.5rem 0.875rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.625rem' }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500 }}>Total Exposure</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#DC2626', lineHeight: 1.2 }}>
                {formatINR(financial.total_financial_exposure_inr)}
              </div>
            </div>
          )}
          {disruptions && disruptions.total_active > 0 && (
            <div style={{ padding: '0.5rem 0.875rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.625rem' }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500 }}>Active Disruptions</div>
              <div style={{ fontSize: '1rem', fontWeight: 700, color: '#D97706', lineHeight: 1.2 }}>
                {disruptions.total_active}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom weights notice */}
      {customWeightsActive && (
        <div style={{
          padding: '0.625rem 1rem',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '0.625rem',
          fontSize: '0.8125rem',
          color: '#1D4ED8',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>⚖️</span>
          <span><strong>Custom risk weights active</strong> — scores shown are recomputed using your Settings configuration.</span>
        </div>
      )}

      {/* Filter bar + search */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', gap: '0.375rem', background: 'var(--border-strong)', borderRadius: '0.625rem', padding: '0.25rem' }}>
          {FILTER_LEVELS.map(level => {
            const count = level === 'all' ? riskList.length : counts[level as keyof typeof counts]
            const isActive = filter === level
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                style={{
                  padding: '0.3125rem 0.75rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? 600 : 500,
                  background: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive
                    ? (level === 'all' ? 'var(--ink-1)' : RISK_BORDER[level] ?? 'var(--ink-1)')
                    : 'var(--ink-3)',
                  border: 'none',
                  cursor: 'pointer',
                  boxShadow: isActive ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                  transition: 'all 150ms',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.375rem',
                  fontFamily: 'inherit',
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{level}</span>
                <span style={{
                  fontSize: '0.6875rem',
                  background: isActive ? (level === 'all' ? 'var(--border)' : `${RISK_BORDER[level ?? '']}20`) : 'var(--border)',
                  color: isActive ? (level === 'all' ? 'var(--ink-2)' : RISK_BORDER[level]) : 'var(--ink-4)',
                  padding: '0 5px', borderRadius: '999px', fontWeight: 600,
                }}>
                  {count}
                </span>
              </button>
            )
          })}
        </div>

        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search supplier name…"
          style={{ width: '240px' }}
        />
      </div>

      {/* Cards */}
      {loadingRisks ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={130} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
          No risks match the current filter.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {filtered.map(r => (
            <RiskCard key={r.supplier_id} risk={r} card={cardMap.get(r.supplier_id)} />
          ))}
        </div>
      )}
    </div>
  )
}
