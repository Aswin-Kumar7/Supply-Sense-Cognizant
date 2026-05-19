import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers, useRiskAnalysis, useSKUs, useDisruptions } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import type { Supplier, SupplierRiskAnalysis, SKURisk, Disruption } from '../types'

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{ background: 'var(--bg-hover)', border: '1px solid #E2E8F0', borderRadius: '0.625rem', padding: '0.875rem' }}>
      <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', fontWeight: 500, marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: color ?? 'var(--ink-1)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  )
}

/* ── Runway bar ─────────────────────────────────────────────────────── */
function RunwayBar({ days, risk }: { days: number; risk: string }) {
  const pct = Math.min(100, (days / 30) * 100)
  const color: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: '5px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
        <div style={{ width: `${pct}%`, height: '100%', background: color[risk] ?? '#059669', borderRadius: '999px', transition: 'width 0.6s ease' }} />
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
  if (!data || data.count === 0) {
    return <p style={{ fontSize: '0.875rem', color: 'var(--ink-4)' }}>No alternate suppliers on record.</p>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {data.alternates.slice(0, 5).map(alt => (
        <div key={alt.alternate_id} style={{
          display: 'flex', alignItems: 'center', gap: '0.75rem',
          padding: '0.625rem 0.875rem',
          background: 'var(--bg-hover)', border: '1px solid #E2E8F0', borderRadius: '0.625rem',
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>{alt.supplier_name}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', marginTop: '2px' }}>{alt.city}, {alt.state}</div>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', flexShrink: 0 }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669' }}>{(alt.reliability_score * 100).toFixed(0)}%</div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>Reliability</div>
            </div>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: alt.cost_premium_pct > 10 ? '#D97706' : 'var(--ink-1)' }}>
                {alt.cost_premium_pct > 0 ? `+${alt.cost_premium_pct}%` : `${alt.cost_premium_pct}%`}
              </div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>Cost premium</div>
            </div>
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
  const supplierSKUs: SKURisk[] = (skuData?.skus ?? []).filter(s => s.supplier_id === id)
  const supplierDisruptions: Disruption[] = (disruptions?.disruptions ?? []).filter(d => d.supplier_id === id)

  if (!id) return null

  const RISK_BORDER: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' }
  const accent = RISK_BORDER[risk?.risk_level ?? 'low'] ?? '#059669'
  const initials = supplier?.name.split(' ').slice(0, 2).map(w => w[0]).join('').toUpperCase() ?? '??'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button onClick={() => navigate('/companies')} style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Companies
        </button>
        <span style={{ color: 'var(--ink-5)' }}>/</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-1)', fontWeight: 500 }}>{supplier?.name ?? '…'}</span>
      </div>

      {/* Hero */}
      <div style={{
        background: 'var(--bg-card)', border: '1px solid #E2E8F0',
        borderRadius: '0.875rem', padding: '1.5rem',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        {supplier ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
              <div style={{
                width: '56px', height: '56px', borderRadius: '0.875rem',
                background: `linear-gradient(135deg, ${accent}25, ${accent}10)`,
                border: `2px solid ${accent}30`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.125rem', fontWeight: 800, color: accent,
                flexShrink: 0,
              }}>
                {initials}
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                  <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--ink-1)' }}>{supplier.name}</h1>
                  {risk && <Badge level={risk.risk_level} />}
                </div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
                  {supplier.city}, {supplier.state} · {supplier.region} · {supplier.category} · Tier {supplier.tier}
                </div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.75rem' }}>
              <StatBox label="Reliability" value={`${(supplier.reliability_score * 100).toFixed(0)}%`} color={supplier.reliability_score >= 0.85 ? '#059669' : '#D97706'} />
              <StatBox label="Lead Time"   value={`${supplier.lead_time_days}d`} />
              <StatBox label="Risk Score"  value={`${((risk?.overall_score ?? 0) * 100).toFixed(0)}%`} color={accent} />
              <StatBox label="Active Issues" value={String(supplierDisruptions.filter(d => d.is_active).length)} color={supplierDisruptions.some(d => d.is_active) ? '#DC2626' : '#059669'} />
              <StatBox label="SKUs"        value={String(supplierSKUs.length)} />
            </div>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            <Skeleton h={56} />
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: '0.75rem' }}>
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} h={64} />)}
            </div>
          </div>
        )}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

        {/* SKU table */}
        <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)', overflow: 'hidden' }}>
          <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #F1F5F9' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)' }}>Products / SKUs</h3>
          </div>
          {supplierSKUs.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
              No SKUs linked to this supplier.
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>Product</th>
                  <th style={{ textAlign: 'right' }}>Stock</th>
                  <th style={{ minWidth: '90px' }}>Runway</th>
                  <th style={{ textAlign: 'center' }}>Risk</th>
                </tr>
              </thead>
              <tbody>
                {supplierSKUs.map(sku => (
                  <tr key={sku.id}>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        {sku.is_critical && (
                          <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#DC2626', flexShrink: 0 }} />
                        )}
                        <div>
                          <div style={{ fontWeight: 600, color: 'var(--ink-1)', fontSize: '0.8125rem', maxWidth: '140px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {sku.name}
                          </div>
                          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)' }}>{sku.sku_code}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ textAlign: 'right', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.75rem' }}>
                      {sku.current_stock.toLocaleString('en-IN')}
                    </td>
                    <td><RunwayBar days={sku.days_of_stock} risk={sku.stockout_risk} /></td>
                    <td style={{ textAlign: 'center' }}><Badge level={sku.stockout_risk} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Active disruptions */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.875rem' }}>Disruptions</h3>
            {supplierDisruptions.length === 0 ? (
              <p style={{ fontSize: '0.875rem', color: 'var(--ink-4)' }}>No disruptions recorded.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {supplierDisruptions.slice(0, 4).map(d => (
                  <div key={d.id} style={{
                    padding: '0.625rem 0.75rem',
                    background: d.is_active ? 'rgba(220,38,38,0.04)' : 'var(--bg-app)',
                    border: `1px solid ${d.is_active ? 'rgba(220,38,38,0.15)' : 'var(--border)'}`,
                    borderRadius: '0.5rem',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <Badge level={d.severity} />
                      {d.is_active && <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase' }}>ACTIVE</span>}
                    </div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink-1)', marginTop: '0.25rem' }}>{d.title}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Alternate suppliers */}
          <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
            <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.875rem' }}>Alternate Suppliers</h3>
            {id && <AlternatesSection supplierId={id} />}
          </div>
        </div>
      </div>
    </div>
  )
}
