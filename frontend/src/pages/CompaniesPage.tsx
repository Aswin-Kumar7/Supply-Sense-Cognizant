import { useState, useMemo } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useSuppliers, useRiskAnalysis } from '../hooks/useQueries'
import { api } from '../services/api'
import { Badge } from '../components/ui/Badge'
import { Building2, MapPin, Search, ChevronRight, ChevronDown, Activity, Map as MapIcon, Filter, ArrowUpRight } from 'lucide-react'
import type { Supplier, SupplierRiskAnalysis, AlternateSupplierRecord } from '../types'

const REGIONS = ['All', 'North', 'South', 'East', 'West', 'Central']

function Skeleton() {
  return <div className="skeleton" style={{ width: '100%', height: 200, borderRadius: 12 }} />
}

function reliabilityColor(score: number) {
  if (score >= 0.85) return '#4A8B50'
  if (score >= 0.70) return '#D29729'
  return '#c55b55'
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

  if (isLoading) return <div style={{ paddingTop: '0.5rem' }}><div className="skeleton" style={{ height: 60, borderRadius: '4px' }} /></div>

  if (uniqueAlts.length === 0) return null

  return (
    <div style={{ paddingTop: '0.5rem', marginTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
        Recommended Alternates
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
        {uniqueAlts.map(alt => (
          <div key={alt.supplier_id} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.375rem 0',
            borderBottom: '1px solid #f8f8f8'
          }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis' }}>{alt.supplier_name}</div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>{alt.city} · +{alt.cost_premium_pct.toFixed(0)}% COST</div>
            </div>
            <ArrowUpRight size={10} color="var(--ink-4)" />
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Company card ─────────────────────────────────────────────────────── */
function CompanyCard({ supplier, risk }: { supplier: Supplier; risk?: SupplierRiskAnalysis }) {
  const navigate = useNavigate()
  const riskLevel = risk?.risk_level ?? 'low'
  const riskScore = risk?.overall_score ?? 0
  const accentColor: Record<string, string> = { critical: '#c55b55', high: '#D29729', medium: '#52bde0', low: '#4A8B50' }
  const accent = accentColor[riskLevel]

  return (
    <div 
      onClick={() => navigate(`/companies/${supplier.id}`)}
      style={{
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: '0.5rem',
        boxShadow: 'var(--shadow-sm)',
        transition: 'all 200ms cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex', flexDirection: 'column',
        cursor: 'pointer',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#000'
        e.currentTarget.style.boxShadow = 'var(--shadow-md)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = 'var(--border)'
        e.currentTarget.style.boxShadow = 'var(--shadow-sm)'
      }}
    >
      <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', flex: 1 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.875rem' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '8px', flexShrink: 0,
            background: '#fff', border: '1px solid var(--border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#000'
          }}>
            <Building2 size={20} strokeWidth={1.5} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', letterSpacing: '-0.01em' }}>
              {supplier.name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '3px' }}>
              <MapPin size={12} color="var(--ink-4)" />
              <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>{supplier.city} · Tier {supplier.tier}</span>
            </div>
          </div>
          <Badge level={riskLevel} />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.25rem 0' }}>
          <div style={{ flex: 1, textAlign: 'left' }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '0.05em' }}>Reliability</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{(supplier.reliability_score * 100).toFixed(0)}%</div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
          <div style={{ flex: 1, textAlign: 'left', paddingLeft: '0.5rem' }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '0.05em' }}>Lead Time</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{supplier.lead_time_days}d</div>
          </div>
          <div style={{ width: '1px', height: '24px', background: 'var(--border)' }} />
          <div style={{ flex: 1, textAlign: 'left', paddingLeft: '0.5rem' }}>
            <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.25rem', letterSpacing: '0.05em' }}>Risk Index</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: accent, fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{(riskScore * 100).toFixed(0)}%</div>
          </div>
        </div>
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

      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1.5rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span 
              onClick={() => navigate('/')}
              style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Dashboard / Suppliers
            </span>
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#000000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Vendor Directory
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '2.5rem' }}>
          <div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Active Vendors</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 500, color: '#000000', lineHeight: 1 }}>
              {suppliers.length}
            </div>
          </div>
          <div style={{ borderLeft: '1px solid var(--border)', paddingLeft: '2.5rem' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Strategic Risks</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 500, color: criticalCount > 0 ? '#c55b55' : '#000000', lineHeight: 1 }}>
              {criticalCount}
            </div>
          </div>
        </div>
      </div>

      {/* Modern Filter + Search Bar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '2rem', marginBottom: '1rem', borderBottom: '1px solid #f1f5f9' }}>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          {REGIONS.map(r => {
            const isActive = region === r
            return (
              <button
                key={r}
                onClick={() => setRegion(r)}
                style={{
                  padding: '0.75rem 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: `2px solid ${isActive ? '#000000' : 'transparent'}`,
                  fontSize: '0.875rem',
                  fontWeight: isActive ? 600 : 500,
                  color: isActive ? '#000000' : 'var(--ink-4)',
                  cursor: 'pointer',
                  transition: 'all 200ms ease',
                  marginBottom: '-1px',
                }}
              >
                {r}
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
            placeholder="Filter vendors..."
            style={{ 
              width: '100%', paddingLeft: '2.25rem', borderRadius: '0.5rem', 
              fontSize: '0.8125rem', height: '36px', border: '1px solid var(--border)',
              background: '#fff', outline: 'none'
            }}
          />
        </div>
      </div>

      {/* Grid — 3 cards per row */}
      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} />)}
        </div>
      ) : suppliers.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
          No vendors match your filters.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1.25rem' }}>
          {suppliers.map(s => (
            <CompanyCard key={s.id} supplier={s} risk={riskMap.get(s.id)} />
          ))}
        </div>
      )}

      {/* Footnote */}
      <div style={{
        padding: '0.625rem 0.75rem', background: 'var(--bg-hover)', border: '1px solid var(--border)',
        borderRadius: '0.5rem', fontSize: '0.6875rem', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: '0.5rem'
      }}>
        <Building2 size={12} />
        <span>Tracked Tier-1 vendors with real-time risk signal synchronization active. Visit <strong>Alternate Suppliers</strong> for supply chain redundancy options.</span>
      </div>

    </div>
  )
}
