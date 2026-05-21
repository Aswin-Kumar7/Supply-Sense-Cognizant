import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers, useSKUs, useDisruptions } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { ChevronLeft, Package, AlertTriangle, Globe, ChevronRight } from 'lucide-react'
import type { Supplier, SKURisk, Disruption } from '../types'

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}


const STOCK_COLORS: Record<string, string> = { critical: '#DC2626', high: '#D29729', medium: '#2563EB', low: '#059669' }
const STOCK_STATUS: Record<string, string> = {
  critical: 'Critical — stock out imminent',
  high: 'Low — reorder urgently',
  medium: 'Moderate — monitor closely',
  low: 'Healthy',
}

/* ── SKU Stock Card ──────────────────────────────────────────────────── */
function SKUStockCard({ sku }: { sku: SKURisk }) {
  const color = STOCK_COLORS[sku.stockout_risk] ?? '#059669'
  const status = STOCK_STATUS[sku.stockout_risk] ?? 'Healthy'
  const pct = Math.min(100, Math.max(4, (sku.days_of_stock / 30) * 100))

  return (
    <div style={{
      background: '#fff', border: `1px solid var(--border)`,
      borderLeft: `3px solid ${color}`,
      borderRadius: '0.5rem', padding: '0.75rem 1rem',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#000', lineHeight: 1.2 }}>{sku.name}</div>
          <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '2px', fontFamily: 'monospace' }}>{sku.sku_code}</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color, lineHeight: 1, fontFamily: 'monospace' }}>{sku.days_of_stock}</div>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase' }}>days left</div>
        </div>
      </div>
      <div style={{ height: '4px', background: 'var(--bg-hover)', borderRadius: '2px', overflow: 'hidden', marginBottom: '0.375rem' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color, borderRadius: '2px', transition: 'width 0.6s ease' }} />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.5625rem', color, fontWeight: 700 }}>{status}</span>
        <span style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontFamily: 'monospace' }}>{sku.current_stock.toLocaleString()} units</span>
      </div>
    </div>
  )
}

/* ── Alternate suppliers section ─────────────────────────────────────── */
function AlternatesSection({ supplierId }: { supplierId: string }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 600_000,
  })

  if (isLoading) return <Skeleton h={80} />
  if (!data || data.count === 0) return <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>No alternates on record.</p>

  // Deduplicate by alternate_id
  const seen = new Set<string>()
  const unique = data.alternates.filter(alt => {
    if (seen.has(alt.alternate_id)) return false
    seen.add(alt.alternate_id)
    return true
  }).slice(0, 4)

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {unique.map((alt, i) => (
        <button
          key={alt.alternate_id}
          onClick={() => navigate(`/alternate-suppliers/${alt.supplier_id}`, { state: { primarySupplierId: supplierId } })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '0.625rem 0',
            borderBottom: i === unique.length - 1 ? 'none' : '1px solid var(--border)',
            background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
            borderBottomColor: i === unique.length - 1 ? 'transparent' : 'var(--border)',
            borderBottomStyle: 'solid', borderBottomWidth: i === unique.length - 1 ? '0' : '1px',
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{alt.supplier_name}</div>
            <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)' }}>{alt.city} · +{alt.cost_premium_pct.toFixed(0)}% extra cost</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#000' }}>{(alt.reliability_score * 100).toFixed(0)}%</div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontWeight: 700 }}>RELIABILITY</div>
            </div>
            <ChevronRight size={14} color="var(--ink-4)" />
          </div>
        </button>
      ))}
    </div>
  )
}

/* ── Company Detail Page ─────────────────────────────────────────────── */
export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: supplierData } = useSuppliers()
  const { data: skuData } = useSKUs()
  const { data: disruptions } = useDisruptions()

  const supplier: Supplier | undefined = supplierData?.suppliers.find(s => s.id === id)
  const supplierSKUs: SKURisk[] = (skuData?.skus ?? []).filter(s => s.supplier_name === supplier?.name)
  const supplierDisruptions: Disruption[] = (disruptions?.disruptions ?? []).filter(d => d.supplier_id === id)

  if (!id) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <button 
          onClick={() => navigate('/companies')} 
          style={{ 
            display: 'flex', alignItems: 'center', gap: '0.375rem',
            fontSize: '0.75rem', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            padding: 0
          }}
        >
          <ChevronLeft size={14} />
          Back to Vendors
        </button>
        <div style={{ width: '1px', height: '12px', background: 'var(--border)' }} />
        <span style={{ fontSize: '0.75rem', color: '#000', fontWeight: 600 }}>{supplier?.name ?? 'Loading Profile…'}</span>
      </div>

      {/* Hero */}
      {/* ... Hero content is already updated ... */}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem' }}>

        {/* SKU cards */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={16} color="#000" />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provisioned Products</h3>
            <span style={{ marginLeft: 'auto', fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 600 }}>{supplierSKUs.length} SKUs</span>
          </div>
          {supplierSKUs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.75rem' }}>
              No SKUs configured for this vendor.
            </div>
          ) : (
            <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.625rem' }}>
              {supplierSKUs.map(sku => (
                <SKUStockCard key={sku.id} sku={sku} />
              ))}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Active disruptions */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <AlertTriangle size={16} color="#000" />
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Recent Disruptions</h3>
            </div>
            {supplierDisruptions.length === 0 ? (
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>No active disruptions recorded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {supplierDisruptions.slice(0, 3).map((d, i) => (
                  <div key={d.id} style={{
                    padding: '0.75rem 0',
                    borderBottom: i === supplierDisruptions.slice(0, 3).length - 1 ? 'none' : '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <Badge level={d.severity} />
                      {d.is_active && <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#c55b55' }}>ACTIVE SIGNAL</span>}
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000', marginTop: '0.375rem' }}>{d.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alternate suppliers */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Globe size={16} color="#000" />
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Alternate Suppliers</h3>
            </div>
            {id && <AlternatesSection supplierId={id} />}
          </div>
        </div>
      </div>
    </div>
  )
}
