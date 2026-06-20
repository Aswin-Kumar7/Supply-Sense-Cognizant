import { useState, useMemo, lazy, Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useSuppliers } from '../hooks/useQueries'
import { Building2, MapPin, Search, ArrowUpRight, Package, List, Globe } from 'lucide-react'
import type { Supplier } from '../types'

const SupplierNetworkMap = lazy(() => import('./SupplierNetworkMap'))

const REGIONS = ['All', 'North', 'South', 'East', 'West', 'Central']

function Skeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="skeleton" style={{ height: 52, borderRadius: '0.375rem' }} />
      ))}
    </div>
  )
}

const TIER_LABEL: Record<number, string> = { 1: 'Tier 1', 2: 'Tier 2' }

function reliabilityColor(score: number) {
  if (score >= 0.85) return '#059669'
  if (score >= 0.70) return '#D97706'
  return '#DC2626'
}

/* ── Supplier row ───────────────────────────────────────────────────────── */
function SupplierRow({ supplier, index }: { supplier: Supplier; index: number }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/companies/${supplier.id}`)}
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 120px 160px 90px 90px 80px 32px',
        alignItems: 'center',
        gap: '1rem',
        padding: '0.75rem 0.875rem',
        borderRadius: '0.375rem',
        cursor: 'pointer',
        background: index % 2 === 0 ? '#fff' : '#FAFAFA',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#F4F4F5' }}
      onMouseLeave={e => { e.currentTarget.style.background = index % 2 === 0 ? '#fff' : '#FAFAFA' }}
    >
      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
        <div style={{
          width: '30px', height: '30px', borderRadius: '6px', flexShrink: 0,
          background: '#F4F4F5', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={14} strokeWidth={1.5} color="#71717A" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {supplier.name}
          </div>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '1px' }}>
            {TIER_LABEL[supplier.tier] ?? `Tier ${supplier.tier}`}
          </div>
        </div>
      </div>

      {/* Category */}
      <div>
        <span style={{
          fontSize: '0.6875rem', fontWeight: 500,
          padding: '2px 8px', borderRadius: '99px',
          background: '#F4F4F5', color: '#3F3F46',
          border: '1px solid var(--border)',
          whiteSpace: 'nowrap',
        }}>
          {supplier.category}
        </span>
      </div>

      {/* Location */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.75rem', color: 'var(--ink-3)', minWidth: 0 }}>
        <MapPin size={11} style={{ flexShrink: 0, color: 'var(--ink-4)' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {supplier.city}, {supplier.state}
        </span>
      </div>

      {/* Reliability */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: reliabilityColor(supplier.reliability_score), fontFamily: 'monospace' }}>
          {(supplier.reliability_score * 100).toFixed(0)}%
        </div>
      </div>

      {/* Lead time */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000', fontFamily: 'monospace' }}>
          {supplier.lead_time_days}d
        </div>
      </div>

      {/* Region */}
      <div>
        <span style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', fontWeight: 500 }}>{supplier.region}</span>
      </div>

      {/* Arrow */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ArrowUpRight size={14} color="var(--ink-4)" />
      </div>
    </div>
  )
}

/* ── Vendor Directory Page ──────────────────────────────────────────────── */
export default function CompaniesPage() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const [search, setSearch] = useState(searchParams.get('q') ?? '')
  const [region, setRegion] = useState('All')
  const [category] = useState('All')
  const [sortBy, setSortBy] = useState<'name' | 'reliability' | 'lead_time'>('name')
  const [viewMode, setViewMode] = useState<'list' | 'map'>('list')

  const { data: supplierData, isLoading } = useSuppliers()

  const allSuppliers = (supplierData?.suppliers ?? []).filter(s => s.tier === 1)

  const filtered = useMemo(() => {
    let list = [...allSuppliers]
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
    if (category !== 'All') list = list.filter(s => s.category.toLowerCase().includes(category.toLowerCase()))
    list.sort((a, b) => {
      if (sortBy === 'reliability') return b.reliability_score - a.reliability_score
      if (sortBy === 'lead_time') return a.lead_time_days - b.lead_time_days
      return a.name.localeCompare(b.name)
    })
    return list
  }, [allSuppliers, search, region, category, sortBy])

  const regionCounts = useMemo(() =>
    REGIONS.slice(1).reduce((acc, r) => {
      acc[r] = allSuppliers.filter(s => s.region.toLowerCase() === r.toLowerCase()).length
      return acc
    }, {} as Record<string, number>),
    [allSuppliers]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: '0.375rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
          Dashboard / Suppliers
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
              Vendor Directory
            </h1>
            <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
              Browse and search all Tier-1 FMCG suppliers · click any row for full profile
            </p>
          </div>
          {/* Summary chips + view toggle */}
          <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
            {[
              { label: 'Total Vendors', value: allSuppliers.length },
              { label: 'Regions', value: REGIONS.slice(1).filter(r => regionCounts[r] > 0).length },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '0.5rem 0.875rem', background: '#F4F4F5',
                borderRadius: '0.5rem', textAlign: 'center',
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000' }}>{stat.value}</div>
                <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{stat.label}</div>
              </div>
            ))}
            <div style={{ width: '1px', height: '28px', background: '#E2E8F0', margin: '0 4px' }} />
            <div style={{ display: 'flex', gap: '1px', background: '#E2E8F0', padding: '2px', borderRadius: '6px' }}>
              {[
                { mode: 'list' as const, icon: <List size={14} />, label: 'List' },
                { mode: 'map' as const, icon: <Globe size={14} />, label: 'Map' },
              ].map(v => (
                <button
                  key={v.mode}
                  onClick={() => setViewMode(v.mode)}
                  title={v.label}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '4px',
                    padding: '5px 10px', borderRadius: '5px', border: 'none',
                    background: viewMode === v.mode ? '#0F172A' : 'transparent',
                    color: viewMode === v.mode ? '#FFF' : '#64748B',
                    fontSize: '0.75rem', fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 150ms ease',
                  }}
                >
                  {v.icon}
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {viewMode === 'list' ? (
        <>
          {/* Filters row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1', minWidth: '180px', maxWidth: '280px' }}>
              <Search size={13} style={{ position: 'absolute', left: '0.625rem', top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-4)' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, city, category…"
                style={{
                  width: '100%', paddingLeft: '2rem', paddingRight: '0.75rem', height: '34px',
                  border: '1px solid #E2E8F0', borderRadius: '0.375rem',
                  fontSize: '0.8125rem', outline: 'none', background: '#fff',
                }}
              />
            </div>

            {/* Region pills */}
            <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
              {REGIONS.map(r => (
                <button
                  key={r}
                  onClick={() => setRegion(r)}
                  style={{
                    padding: '0.3rem 0.75rem', borderRadius: '99px',
                    border: `1px solid ${region === r ? '#000' : '#E2E8F0'}`,
                    background: region === r ? '#000' : '#fff',
                    color: region === r ? '#fff' : 'var(--ink-3)',
                    fontSize: '0.75rem', fontWeight: region === r ? 700 : 500,
                    cursor: 'pointer', transition: 'all 120ms ease',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {r}
                  {r !== 'All' && regionCounts[r] > 0 && (
                    <span style={{ marginLeft: '4px', opacity: 0.6, fontSize: '0.625rem' }}>
                      {regionCounts[r]}
                    </span>
                  )}
                </button>
              ))}
            </div>

            {/* Sort */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <span style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600 }}>Sort:</span>
              {(['name', 'reliability', 'lead_time'] as const).map(s => (
                <button
                  key={s}
                  onClick={() => setSortBy(s)}
                  style={{
                    padding: '0.25rem 0.625rem', borderRadius: '4px',
                    border: '1px solid #E2E8F0',
                    background: sortBy === s ? '#000' : '#fff',
                    color: sortBy === s ? '#fff' : 'var(--ink-3)',
                    fontSize: '0.6875rem', fontWeight: 600,
                    cursor: 'pointer', transition: 'all 120ms ease',
                    textTransform: 'capitalize',
                  }}
                >
                  {s === 'lead_time' ? 'Lead time' : s.charAt(0).toUpperCase() + s.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '0.5rem', overflow: 'hidden' }}>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 120px 160px 90px 90px 80px 32px',
              gap: '1rem',
              padding: '0.625rem 0.875rem',
              background: '#F9F9F9',
              borderBottom: '1px solid #E2E8F0',
            }}>
              {[
                { label: 'Supplier', icon: <Building2 size={11} /> },
                { label: 'Category', icon: <Package size={11} /> },
                { label: 'Location', icon: <MapPin size={11} /> },
                { label: 'Reliability', icon: null },
                { label: 'Lead Time', icon: null },
                { label: 'Region', icon: null },
                { label: '', icon: null },
              ].map(col => (
                <div key={col.label} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', justifyContent: col.label === 'Reliability' || col.label === 'Lead Time' ? 'flex-end' : 'flex-start' }}>
                  {col.icon && <span style={{ color: 'var(--ink-4)' }}>{col.icon}</span>}
                  <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{col.label}</span>
                </div>
              ))}
            </div>

            {isLoading ? (
              <div style={{ padding: '1rem' }}><Skeleton /></div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
                No vendors match your filters.
              </div>
            ) : (
              <div>
                {filtered.map((s, i) => (
                  <SupplierRow key={s.id} supplier={s} index={i} />
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
            <Building2 size={11} />
            Showing Tier-1 vendors only · {allSuppliers.length} total tracked suppliers
          </div>
        </>
      ) : (
        <div style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
          <Suspense fallback={
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '10px', border: '1px solid #E2E8F0' }}>
              <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                <Globe size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontSize: '0.8125rem' }}>Loading map…</div>
              </div>
            </div>
          }>
            <SupplierNetworkMap />
          </Suspense>
        </div>
      )}

    </div>
  )
}
