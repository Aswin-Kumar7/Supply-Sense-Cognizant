import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSuppliers, useRiskAnalysis } from '../hooks/useQueries'
import { api } from '../services/api'
import { Badge } from '../components/ui/Badge'
import type { Supplier, SupplierRiskAnalysis, AlternateSupplierRecord } from '../types'

const REGIONS = ['All', 'North', 'South', 'East', 'West', 'Central']

function Skeleton() {
  return <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 12 }} />
}

function reliabilityColor(score: number) {
  if (score >= 0.85) return '#059669'
  if (score >= 0.70) return '#D97706'
  return '#DC2626'
}

/* ── Inline Alternates Panel ─────────────────────────────────────────── */
function AlternatesPanel({ supplierId, primaryLead }: { supplierId: string; primaryLead: number }) {
  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 300_000,
  })

  const uniqueAlts = useMemo<AlternateSupplierRecord[]>(() => {
    const alts = data?.alternates ?? []
    return alts.reduce<AlternateSupplierRecord[]>((acc, a) => {
      if (!acc.find(x => x.supplier_id === a.supplier_id)) acc.push(a)
      return acc
    }, []).slice(0, 3)
  }, [data])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0' }}>
        {[1,2].map(i => <div key={i} className="skeleton" style={{ flex: 1, height: 72, borderRadius: 8 }} />)}
      </div>
    )
  }

  if (uniqueAlts.length === 0) {
    return (
      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0', fontSize: '0.75rem', color: 'var(--ink-4)', textAlign: 'center', padding: '0.75rem' }}>
        No alternates configured
      </div>
    )
  }

  return (
    <div style={{ paddingTop: '0.75rem', borderTop: '1px solid #E2E8F0' }}>
      <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
        Alternate Suppliers ({uniqueAlts.length})
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {uniqueAlts.map(alt => {
          const leadDelta = alt.lead_time_days - primaryLead
          const isPreferred = alt.cost_premium_pct < 10 && (alt.reliability_score ?? alt.quality_score) >= 0.85
          return (
            <div key={alt.supplier_id} style={{
              display: 'flex', alignItems: 'center', gap: '0.625rem',
              padding: '0.5rem 0.625rem',
              background: isPreferred ? '#F0FDF4' : 'var(--bg-hover)',
              border: `1px solid ${isPreferred ? '#BBF7D0' : 'var(--border)'}`,
              borderRadius: '0.5rem',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {alt.supplier_name}
                  {isPreferred && (
                    <span style={{ marginLeft: '0.375rem', fontSize: '0.5rem', background: '#DCFCE7', color: '#059669', border: '1px solid #BBF7D0', borderRadius: '999px', padding: '1px 5px', fontWeight: 700 }}>
                      PREFERRED
                    </span>
                  )}
                </div>
                <div style={{ fontSize: '0.5625rem', color: 'var(--ink-3)' }}>{alt.city} · {alt.region}</div>
              </div>
              <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
                <span style={{
                  fontSize: '0.5625rem', fontWeight: 700, padding: '2px 6px', borderRadius: '999px',
                  background: alt.cost_premium_pct < 10 ? '#DCFCE7' : '#FEF3C7',
                  color: alt.cost_premium_pct < 10 ? '#059669' : '#D97706',
                }}>
                  +{alt.cost_premium_pct.toFixed(0)}%
                </span>
                <span style={{
                  fontSize: '0.5625rem', fontWeight: 600, padding: '2px 6px', borderRadius: '999px',
                  background: 'var(--border-strong)', color: leadDelta > 0 ? '#D97706' : leadDelta < 0 ? '#059669' : 'var(--ink-3)',
                }}>
                  {alt.lead_time_days}d{leadDelta !== 0 ? ` (${leadDelta > 0 ? '+' : ''}${leadDelta})` : ''}
                </span>
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Company card ─────────────────────────────────────────────────────── */
function CompanyCard({ supplier, risk }: { supplier: Supplier; risk?: SupplierRiskAnalysis }) {
  const navigate = useNavigate()
  const [showAlts, setShowAlts] = useState(false)

  const riskLevel = risk?.risk_level ?? 'low'
  const riskScore = risk?.overall_score ?? 0

  const accentColor: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' }
  const accent = accentColor[riskLevel]
  const initials = supplier.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase()

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid var(--border)',
      borderRadius: '0.875rem',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-xs)',
      transition: 'box-shadow 150ms',
      display: 'flex', flexDirection: 'column',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = 'var(--shadow-md)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'var(--shadow-xs)')}
    >
      {/* Risk level accent bar */}
      <div style={{ height: '3px', background: accent }} />

      <div style={{ padding: '1.125rem', display: 'flex', flexDirection: 'column', gap: '0.875rem', flex: 1 }}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
          <div style={{
            width: '42px', height: '42px', borderRadius: '0.625rem', flexShrink: 0,
            background: `linear-gradient(135deg, ${accent}22, ${accent}10)`,
            border: `1px solid ${accent}30`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.875rem', fontWeight: 800, color: accent,
          }}>
            {initials}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {supplier.name}
            </div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px' }}>
              {supplier.city}, {supplier.state} · Tier {supplier.tier}
            </div>
          </div>
          <Badge level={riskLevel} />
        </div>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
          {[
            { label: 'Reliability', value: `${(supplier.reliability_score * 100).toFixed(0)}%`, color: reliabilityColor(supplier.reliability_score) },
            { label: 'Lead Time',   value: `${supplier.lead_time_days}d`,                        color: 'var(--ink-1)' },
            { label: 'Risk Score',  value: `${(riskScore * 100).toFixed(0)}%`,                   color: accent },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-hover)', borderRadius: '0.5rem' }}>
              <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: stat.color, lineHeight: 1 }}>{stat.value}</div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '3px', fontWeight: 500 }}>{stat.label}</div>
            </div>
          ))}
        </div>

        {/* Risk bar */}
        <div style={{ height: '5px', background: 'var(--border-strong)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{
            width: `${(riskScore * 100).toFixed(0)}%`, height: '100%',
            background: accent, borderRadius: '999px',
            transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
          }} />
        </div>

        {/* Region + category */}
        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', textTransform: 'capitalize' }}>
          {supplier.category} · {supplier.region} region
        </div>

        {/* Alternates panel */}
        {showAlts && (
          <AlternatesPanel supplierId={supplier.id} primaryLead={supplier.lead_time_days} />
        )}
      </div>

      {/* Action bar */}
      <div style={{
        display: 'flex', borderTop: '1px solid #F1F5F9',
        background: 'var(--bg-app)',
      }}>
        <button
          onClick={() => navigate(`/companies/${supplier.id}`)}
          style={{
            flex: 1, padding: '0.625rem',
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 600, color: '#2563EB',
            fontFamily: 'inherit',
            borderRight: '1px solid #F1F5F9',
            transition: 'background 120ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#EFF6FF')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          View Details →
        </button>
        <button
          onClick={e => { e.stopPropagation(); setShowAlts(v => !v) }}
          style={{
            flex: 1, padding: '0.625rem',
            background: showAlts ? '#F0FDF4' : 'none',
            border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 600,
            color: showAlts ? '#059669' : 'var(--ink-3)',
            fontFamily: 'inherit',
            transition: 'background 120ms',
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.3rem',
          }}
          onMouseEnter={e => { if (!showAlts) e.currentTarget.style.background = '#F0FDF4' }}
          onMouseLeave={e => { if (!showAlts) e.currentTarget.style.background = 'none' }}
        >
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none">
            <circle cx="4" cy="8" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="12" cy="4" r="2" stroke="currentColor" strokeWidth="1.5"/>
            <circle cx="12" cy="12" r="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M6.5 7l3-2M6.5 9l3 2" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round"/>
          </svg>
          {showAlts ? 'Hide Alternates' : 'Alt. Suppliers'}
        </button>
      </div>
    </div>
  )
}

/* ── Companies Page ───────────────────────────────────────────────────── */
export default function CompaniesPage() {
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('city') ?? '')
  const [region, setRegion] = useState('All')
  const [sortBy, setSortBy] = useState<'risk' | 'reliability' | 'name'>('risk')

  const { data: supplierData, isLoading } = useSuppliers()
  const { data: risks } = useRiskAnalysis()

  const riskMap = useMemo(
    () => new Map(((risks as SupplierRiskAnalysis[] | undefined) ?? []).map(r => [r.supplier_id, r])),
    [risks]
  )

  // ── Show only Tier-1 FMCG vendors as "companies" ──
  const suppliers = useMemo(() => {
    let list = (supplierData?.suppliers ?? []).filter(s => s.tier === 1)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(s =>
        s.name.toLowerCase().includes(q) ||
        s.city.toLowerCase().includes(q) ||
        s.state.toLowerCase().includes(q) ||
        s.category.toLowerCase().includes(q)
      )
    }
    if (region !== 'All') list = list.filter(s => s.region.toLowerCase() === region.toLowerCase())
    return [...list].sort((a, b) => {
      if (sortBy === 'risk') {
        const ra = riskMap.get(a.id)?.overall_score ?? 0
        const rb = riskMap.get(b.id)?.overall_score ?? 0
        return rb - ra
      }
      if (sortBy === 'reliability') return a.reliability_score - b.reliability_score
      return a.name.localeCompare(b.name)
    })
  }, [supplierData, search, region, sortBy, riskMap])

  const criticalCount = suppliers.filter(s => riskMap.get(s.id)?.risk_level === 'critical').length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            FMCG Vendors
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)' }}>
            {suppliers.length} Tier-1 primary vendors · {criticalCount > 0 && <span style={{ color: '#DC2626', fontWeight: 600 }}>{criticalCount} critical</span>} click a card to view details or expand alternates
          </p>
        </div>
        <div style={{
          padding: '0.5rem 0.875rem',
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: '0.625rem', fontSize: '0.75rem', color: '#2563EB', fontWeight: 600,
        }}>
          Tier-1 · FMCG
        </div>
      </div>

      {/* Controls */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <input
          className="input"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by name, city, state…"
          style={{ width: '240px' }}
        />

        {/* Region filter */}
        <div style={{ display: 'flex', gap: '0.25rem', background: 'var(--border-strong)', borderRadius: '0.625rem', padding: '0.25rem' }}>
          {REGIONS.map(r => (
            <button
              key={r}
              onClick={() => setRegion(r)}
              style={{
                padding: '0.3125rem 0.625rem', borderRadius: '0.375rem',
                fontSize: '0.75rem', fontWeight: region === r ? 600 : 500,
                background: region === r ? 'var(--bg-card)' : 'transparent',
                color: region === r ? 'var(--ink-1)' : 'var(--ink-3)',
                border: 'none', cursor: 'pointer',
                boxShadow: region === r ? '0 1px 3px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 150ms', fontFamily: 'inherit',
              }}
            >
              {r}
            </button>
          ))}
        </div>

        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as typeof sortBy)}
          className="input"
          style={{ width: 'auto' }}
        >
          <option value="risk">Sort: Highest Risk</option>
          <option value="reliability">Sort: Lowest Reliability</option>
          <option value="name">Sort: Name A–Z</option>
        </select>
      </div>

      {/* Grid — 3-col on wide, 2-col on medium */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
          {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
          No vendors match your filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(290px, 1fr))', gap: '1rem' }}>
          {suppliers.map(s => (
            <CompanyCard key={s.id} supplier={s} risk={riskMap.get(s.id)} />
          ))}
        </div>
      )}

      {/* Tier-2 footnote */}
      <div style={{
        padding: '0.75rem 1rem', background: 'var(--bg-hover)', border: '1px solid #E2E8F0',
        borderRadius: '0.625rem', fontSize: '0.75rem', color: 'var(--ink-4)',
      }}>
        💡 10 Tier-2 suppliers (packaging & raw material) and 8 alternate suppliers are tracked in the system — expand any card above to see alternates, or visit <strong style={{ color: '#2563EB' }}>Alt. Suppliers</strong> in the sidebar.
      </div>

    </div>
  )
}
