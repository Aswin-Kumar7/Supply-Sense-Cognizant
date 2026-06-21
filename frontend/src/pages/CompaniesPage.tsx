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
  if (score >= 0.85) return '#10B981'
  if (score >= 0.70) return '#F59E0B'
  return '#EF4444'
}

/* ── Supplier row ───────────────────────────────────────────────────────── */
function SupplierRow({ supplier }: { supplier: Supplier }) {
  const navigate = useNavigate()

  return (
    <div
      onClick={() => navigate(`/companies/${supplier.id}`)}
      className="supplier-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '2fr 120px 160px 90px 90px 80px 32px',
        alignItems: 'center',
        gap: '1rem',
        padding: '12px 16px',
        borderBottom: '1px solid #F1F5F9',
        cursor: 'pointer',
        background: '#FFFFFF',
      }}
    >
      {/* Name */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
        <div style={{
          width: '32px', height: '32px', borderRadius: '8px', flexShrink: 0,
          background: '#F8FAFC', border: '1px solid #E2E8F0',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Building2 size={14} strokeWidth={1.5} color="#64748B" />
        </div>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {supplier.name}
          </div>
          <div style={{ fontSize: '0.6875rem', color: '#64748B', marginTop: '1px' }}>
            {TIER_LABEL[supplier.tier] ?? `Tier ${supplier.tier}`}
          </div>
        </div>
      </div>

      {/* Category */}
      <div>
        <span style={{
          fontSize: '0.6875rem', fontWeight: 600,
          padding: '3px 8px', borderRadius: '6px',
          background: '#F1F5F9', color: '#475569',
          border: '1px solid #E2E8F0',
          whiteSpace: 'nowrap',
        }}>
          {supplier.category}
        </span>
      </div>

      {/* Location */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', minWidth: 0 }}>
        <MapPin size={12} style={{ flexShrink: 0, color: '#94A3B8' }} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {supplier.city}, {supplier.state}
        </span>
      </div>

      {/* Reliability */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: reliabilityColor(supplier.reliability_score), fontFamily: 'monospace' }}>
          {(supplier.reliability_score * 100).toFixed(0)}%
        </div>
      </div>

      {/* Lead time */}
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>
          {supplier.lead_time_days}d
        </div>
      </div>

      {/* Region */}
      <div>
        <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 600 }}>{supplier.region}</span>
      </div>

      {/* Arrow */}
      <div style={{ display: 'flex', justifyContent: 'center' }}>
        <ArrowUpRight size={14} color="#94A3B8" />
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
  const [sortBy, setSortBy] = useState<'name' | 'reliability' | 'lead_time' | 'region'>('name')
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
      if (sortBy === 'region') return a.region.localeCompare(b.region)
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .supplier-row {
          transition: all 150ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .supplier-row:hover {
          background: #F8FAFC !important;
          transform: translateX(4px);
        }
        .filter-pill {
          transition: all 150ms ease;
        }
        .filter-pill:hover {
          border-color: #94A3B8 !important;
          color: #0F172A !important;
        }
        .header-sortable {
          transition: color 150ms ease;
        }
        .header-sortable:hover span {
          color: #0F172A !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
        <div style={{ 
          fontSize: '0.75rem', 
          color: '#64748B', 
          fontWeight: 500, 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
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
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Suppliers</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
              Suppliers Directory
            </h1>
            <p style={{ fontSize: '0.8125rem', color: '#64748B', marginTop: '4px', marginBottom: 0 }}>
              Browse and search all Tier-1 FMCG suppliers. Click any row for profile details.
            </p>
          </div>
          
          {/* Summary chips + view toggle */}
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            {[
              { label: 'Total Vendors', value: allSuppliers.length },
              { label: 'Regions', value: REGIONS.slice(1).filter(r => regionCounts[r] > 0).length },
            ].map(stat => (
              <div key={stat.label} style={{
                padding: '8px 12px', background: '#FFFFFF', border: '1px solid #E2E8F0',
                borderRadius: '8px', textAlign: 'center', minWidth: '80px',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)'
              }}>
                <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', lineHeight: 1 }}>{stat.value}</div>
                <div style={{ fontSize: '0.5625rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '2px' }}>{stat.label}</div>
              </div>
            ))}
            <div style={{ width: '1px', height: '32px', background: '#E2E8F0', margin: '0 4px' }} />
            <div style={{ display: 'flex', gap: '1px', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px', borderRadius: '8px' }}>
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
                    padding: '6px 12px', borderRadius: '6px', border: 'none',
                    background: viewMode === v.mode ? '#0F172A' : 'transparent',
                    color: viewMode === v.mode ? '#FFF' : '#64748B',
                    fontSize: '0.75rem', fontWeight: 700,
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap', background: '#FFFFFF', padding: '12px', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)' }}>
            {/* Search */}
            <div style={{ position: 'relative', flex: '1', minWidth: '220px', maxWidth: '300px' }}>
              <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#94A3B8' }} />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search name, city, category…"
                style={{
                  width: '100%', paddingLeft: '32px', paddingRight: '12px', height: '36px',
                  border: '1px solid #E2E8F0', borderRadius: '8px',
                  fontSize: '0.8125rem', outline: 'none', background: '#F8FAFC',
                  color: '#0F172A', transition: 'all 150ms ease',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.background = '#FFFFFF' }}
                onBlur={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.background = '#F8FAFC' }}
              />
            </div>

            {/* Region pills */}
            <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
              {REGIONS.map(r => {
                const isSelected = region === r
                return (
                  <button
                    key={r}
                    onClick={() => setRegion(r)}
                    className="filter-pill"
                    style={{
                      padding: '6px 12px', borderRadius: '20px',
                      border: `1px solid ${isSelected ? '#0F172A' : '#E2E8F0'}`,
                      background: isSelected ? '#0F172A' : '#fff',
                      color: isSelected ? '#fff' : '#475569',
                      fontSize: '0.75rem', fontWeight: isSelected ? 700 : 600,
                      cursor: 'pointer', transition: 'all 120ms ease',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {r}
                    {r !== 'All' && regionCounts[r] > 0 && (
                      <span style={{ marginLeft: '4px', opacity: isSelected ? 0.9 : 0.6, fontSize: '0.625rem', fontWeight: 800 }}>
                        {regionCounts[r]}
                      </span>
                    )}
                  </button>
                )
              })}
            </div>

            {/* Sort */}
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '6px' }}>
              <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Sort:</span>
              <div style={{ display: 'flex', gap: '1px', background: '#F1F5F9', border: '1px solid #E2E8F0', padding: '2px', borderRadius: '8px' }}>
                {(['name', 'reliability', 'lead_time', 'region'] as const).map(s => {
                  const isSelected = sortBy === s
                  return (
                    <button
                      key={s}
                      onClick={() => setSortBy(s)}
                      style={{
                        padding: '4px 10px', borderRadius: '6px',
                        border: 'none',
                        background: isSelected ? '#FFFFFF' : 'transparent',
                        color: isSelected ? '#0F172A' : '#64748B',
                        fontSize: '0.6875rem', fontWeight: 700,
                        cursor: 'pointer', transition: 'all 120ms ease',
                        textTransform: 'capitalize',
                        boxShadow: isSelected ? '0 1px 2px rgba(0, 0, 0, 0.05)' : 'none'
                      }}
                    >
                      {s === 'lead_time' ? 'Lead time' : s}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>

          {/* Table */}
          <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px rgba(15,23,42,0.02)' }}>
            {/* Column headers */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '2fr 120px 160px 90px 90px 80px 32px',
              gap: '1rem',
              padding: '10px 16px',
              background: '#F8FAFC',
              borderBottom: '1px solid #E2E8F0',
            }}>
              {[
                { label: 'Supplier', icon: <Building2 size={11} />, sortKey: 'name' as const },
                { label: 'Category', icon: <Package size={11} />, sortKey: null },
                { label: 'Location', icon: <MapPin size={11} />, sortKey: null },
                { label: 'Reliability', icon: null, sortKey: 'reliability' as const },
                { label: 'Lead Time', icon: null, sortKey: 'lead_time' as const },
                { label: 'Region', icon: null, sortKey: 'region' as const },
                { label: '', icon: null, sortKey: null },
              ].map((col, idx) => {
                const isSortable = col.sortKey !== null
                const isSelected = sortBy === col.sortKey
                return (
                  <div 
                    key={idx} 
                    onClick={() => { if (isSortable && col.sortKey) setSortBy(col.sortKey) }}
                    className={isSortable ? 'header-sortable' : ''}
                    style={{ 
                      display: 'flex', 
                      alignItems: 'center', 
                      gap: '6px', 
                      justifyContent: col.label === 'Reliability' || col.label === 'Lead Time' ? 'center' : 'flex-start',
                      cursor: isSortable ? 'pointer' : 'default',
                      userSelect: 'none',
                    }}
                  >
                    {col.icon && <span style={{ color: isSelected ? '#4F46E5' : '#64748B', display: 'flex', alignItems: 'center' }}>{col.icon}</span>}
                    <span style={{ 
                      fontSize: '0.5625rem', 
                      fontWeight: 800, 
                      color: isSelected ? '#4F46E5' : '#64748B', 
                      textTransform: 'uppercase', 
                      letterSpacing: '0.06em',
                      transition: 'color 150ms ease'
                    }}>
                      {col.label}
                    </span>
                  </div>
                )
              })}
            </div>

            {isLoading ? (
              <div style={{ padding: '1rem' }}><Skeleton /></div>
            ) : filtered.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>
                No vendors match your filters.
              </div>
            ) : (
              <div>
                {filtered.map(s => (
                  <SupplierRow key={s.id} supplier={s} />
                ))}
              </div>
            )}
          </div>

          <div style={{ fontSize: '0.6875rem', color: '#64748B', display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 500 }}>
            <Building2 size={12} />
            Showing Tier-1 vendors only · {allSuppliers.length} total tracked suppliers
          </div>
        </>
      ) : (
        <div style={{ height: 'calc(100vh - 220px)', minHeight: '500px' }}>
          <Suspense fallback={
            <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0' }}>
              <div style={{ textAlign: 'center', color: '#94A3B8' }}>
                <Globe size={28} style={{ margin: '0 auto 8px', opacity: 0.4 }} />
                <div style={{ fontSize: '0.8125rem', fontWeight: 600 }}>Loading map…</div>
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
