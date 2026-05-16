import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers, useRiskAnalysis, useSKUs, useDisruptions } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { Building2, MapPin, Activity, ChevronLeft, Package, AlertTriangle, Share2, Globe, ShieldCheck } from 'lucide-react'
import type { Supplier, SupplierRiskAnalysis, SKURisk, Disruption } from '../types'

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem' }}>
      <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 700, color: color ?? '#000', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.625rem', color: 'var(--ink-3)', marginTop: '0.375rem', fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

/* ── Runway bar ─────────────────────────────────────────────────────── */
function RunwayBar({ days, risk }: { days: number; risk: string }) {
  const pct = Math.min(100, (days / 30) * 100)
  const color: Record<string, string> = { critical: '#c55b55', high: '#D29729', medium: '#52bde0', low: '#4A8B50' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color[risk] ?? '#4A8B50', borderRadius: '999px', transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: '0.75rem', fontVariantNumeric: 'tabular-nums', color: 'var(--ink-3)', minWidth: '28px', textAlign: 'right' }}>
        {days}d
      </span>
    </div>
  )
}

/* ── Alternate suppliers section ─────────────────────────────────────── */
function AlternatesSection({ supplierId }: { supplierId: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 600_000,
  })

  if (isLoading) return <Skeleton h={80} />
  if (!data || data.count === 0) return <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>No alternates on record.</p>

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {data.alternates.slice(0, 4).map((alt, i) => (
        <div key={alt.alternate_id} style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.625rem 0',
          borderBottom: i === data.alternates.slice(0, 4).length - 1 ? 'none' : '1px solid var(--border)',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{alt.supplier_name}</div>
            <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)' }}>{alt.city} · +{alt.cost_premium_pct}% COST</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#000' }}>{(alt.reliability_score * 100).toFixed(0)}%</div>
            <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontWeight: 700 }}>RELIABILITY</div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── Company Detail Page ─────────────────────────────────────────────── */
export default function CompanyDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: supplierData } = useSuppliers()
  const { data: risks } = useRiskAnalysis()
  const { data: skuData } = useSKUs()
  const { data: disruptions } = useDisruptions()

  const supplier: Supplier | undefined = supplierData?.suppliers.find(s => s.id === id)
  const risk: SupplierRiskAnalysis | undefined = ((risks as SupplierRiskAnalysis[] | undefined) ?? []).find(r => r.supplier_id === id)
  const supplierSKUs: SKURisk[] = (skuData?.skus ?? []).filter(s => s.supplier_name === supplier?.name)
  const supplierDisruptions: Disruption[] = (disruptions?.disruptions ?? []).filter(d => d.supplier_id === id)

  if (!id) return null

  const RISK_BORDER: Record<string, string> = { critical: '#c55b55', high: '#D29729', medium: '#52bde0', low: '#4A8B50' }
  const accent = RISK_BORDER[risk?.risk_level ?? 'low'] ?? '#4A8B50'
  const initials = supplier?.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '??'

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

        {/* SKU table */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', boxShadow: 'var(--shadow-sm)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Package size={16} color="#000" />
            <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Provisioned Products</h3>
          </div>
          {supplierSKUs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.75rem' }}>
              No SKUs configured for this vendor.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-hover)', borderBottom: '1px solid var(--border)' }}>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Product Identifier</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Inventory</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Coverage</th>
                  <th style={{ padding: '0.75rem 1rem', textAlign: 'center', fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Signal</th>
                </tr>
              </thead>
              <tbody>
                {supplierSKUs.map((sku, idx) => (
                  <tr key={sku.id} style={{ borderBottom: idx === supplierSKUs.length - 1 ? 'none' : '1px solid #f8f8f8' }}>
                    <td style={{ padding: '0.875rem 1rem' }}>
                      <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{sku.name}</div>
                      <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '2px' }}>{sku.sku_code}</div>
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'right', fontSize: '0.75rem', fontWeight: 600, color: '#000', fontFamily: 'JetBrains Mono, monospace' }}>
                      {sku.current_stock.toLocaleString()}
                    </td>
                    <td style={{ padding: '0.875rem 1rem', width: '120px' }}>
                      <RunwayBar days={sku.days_of_stock} risk={sku.stockout_risk} />
                    </td>
                    <td style={{ padding: '0.875rem 1rem', textAlign: 'center' }}>
                      <Badge level={sku.stockout_risk} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
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
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Supply Redundancy</h3>
            </div>
            {id && <AlternatesSection supplierId={id} />}
          </div>
        </div>
      </div>
    </div>
  )
}
