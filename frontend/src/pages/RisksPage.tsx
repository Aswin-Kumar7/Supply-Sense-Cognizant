import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useWeightedRiskAnalysis, useProcurementCards, useDisruptions, useFinancialSummary } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { Search, Wind, Package, Truck, Activity, Link as LinkIcon, Calendar, AlertTriangle, Zap } from 'lucide-react'
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
  critical: '#c55b55', high: '#D29729', medium: '#47a3c9', low: '#4A8B50',
}




/* ── Risk card ──────────────────────────────────────────────────────── */
function RiskCard({ risk, card }: { risk: SupplierRiskAnalysis; card?: IntelligentActionCard }) {
  const navigate = useNavigate()
  const [hovered, setHovered] = useState(false)

  const border = RISK_BORDER[risk.risk_level] ?? 'var(--border)'

  const sortedFactors = Object.entries(risk.factors ?? {})
    .sort(([, a], [, b]) => b.weighted - a.weighted)
  const primaryFactor = sortedFactors[0]?.[1]

  return (
    <div
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.25rem 1.75rem',
        cursor: 'pointer',
        transition: 'all 200ms ease',
        boxShadow: hovered ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        borderColor: hovered ? border : 'var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
      }}
    >
      {/* Score Column */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.25rem', width: '60px', flexShrink: 0 }}>
        <div style={{ fontSize: '1.75rem', fontWeight: 600, color: border, letterSpacing: '-0.04em', lineHeight: 1 }}>
          {(risk.overall_score * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Score</div>
      </div>

      {/* Main Info */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.5rem' }}>
          <Badge level={risk.risk_level} />
          <h3 style={{ fontSize: '1rem', fontWeight: 600, color: '#000000', letterSpacing: '-0.01em' }}>
            {risk.supplier_name}
          </h3>
        </div>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-2)', lineHeight: 1.5, maxWidth: '500px' }}>
          {card?.title ?? (primaryFactor?.explanation ?? 'Primary risk factor identified')}
        </p>
      </div>

      {/* Metrics Column */}
      <div style={{ display: 'flex', gap: '3rem', alignItems: 'center', flexShrink: 0 }}>
        {card && (
          <>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase' }}>
                <LinkIcon size={12} /> Exposure
              </div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#000000', fontFamily: 'JetBrains Mono, monospace' }}>
                {formatINR(card.financial_exposure_inr)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase' }}>
                <Package size={12} /> Inventory
              </div>
              <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: card.days_to_stockout <= 7 ? '#c55b55' : '#000000' }}>
                {card.days_to_stockout}d to stockout
              </div>
            </div>
          </>
        )}
        <div style={{ color: 'var(--ink-5)', marginLeft: '1rem' }}>
          <Zap size={18} />
        </div>
      </div>
    </div>
  )
}

/* ── Risks page ─────────────────────────────────────────────────────── */
export default function RisksPage() {
  const navigate = useNavigate()
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

      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span 
              onClick={() => navigate('/')}
              style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Dashboard / Risks
            </span>
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#000000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Risk Analysis
          </h1>
        </div>

        {/* Minimalist Summary */}
        <div style={{ display: 'flex', gap: '2.5rem' }}>
          {financial && (
            <div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Total Financial Exposure</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 500, color: '#000000', lineHeight: 1 }}>
                {formatINR(financial.total_financial_exposure_inr)}
              </div>
            </div>
          )}
          {disruptions && (
            <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '2.5rem' }}>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Active Risk Factors</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 500, color: '#000000', lineHeight: 1 }}>
                {disruptions.total_active}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Custom weights notice */}
      {customWeightsActive && (
        <div style={{
          padding: '0.75rem 1.25rem',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: '0.75rem',
          fontSize: '0.8125rem',
          color: 'var(--ink-2)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <AlertTriangle size={14} style={{ color: '#D29729' }} />
          <span><strong style={{ color: '#000' }}>Custom Risk Configuration Active</strong> — Calculations are currently weighted based on your specific settings profile.</span>
        </div>
      )}

      {/* Modern Filter + Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {FILTER_LEVELS.map(level => {
            const count = level === 'all' ? riskList.length : counts[level as keyof typeof counts]
            const isActive = filter === level

            
            return (
              <button
                key={level}
                onClick={() => setFilter(level)}
                style={{
                  padding: '0.75rem 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? '#000000' : 'transparent'}`,
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#000000' : 'var(--ink-4)',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.5rem',
                  transition: 'all 200ms ease',
                  position: 'relative',
                  marginBottom: '-1px',
                }}
              >
                <span style={{ textTransform: 'capitalize' }}>{level}</span>
                {count > 0 && (
                  <span style={{
                    fontSize: '0.6875rem',
                    background: isActive ? '#f1f5f9' : 'transparent',
                    border: isActive ? 'none' : '1px solid var(--border)',
                    color: isActive ? '#000000' : 'var(--ink-4)',
                    padding: '1px 6px', borderRadius: '4px', fontWeight: 600,
                  }}>
                    {count}
                  </span>
                )}
              </button>
            )
          })}
        </div>

        <div style={{ position: 'relative', flex: 1, maxWidth: '280px', marginBottom: '0.75rem' }}>
          <Search size={14} style={{ position: 'absolute', left: '0.75rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
          <input
            className="input"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Search resources..."
            style={{ 
              width: '100%', paddingLeft: '2.25rem', borderRadius: '0.5rem', 
              fontSize: '0.8125rem', height: '36px', border: '1px solid var(--border)',
              background: '#fff', outline: 'none'
            }}
          />
        </div>
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
