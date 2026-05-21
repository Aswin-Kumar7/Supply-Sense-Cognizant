import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { ChevronLeft, MapPin, Clock, Star, Package, AlertTriangle, CheckCircle2, ShoppingCart } from 'lucide-react'
import { api } from '../services/api'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function ScoreBar({ value, color = '#059669' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: '6px', background: '#F4F4F5', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${(value * 100).toFixed(0)}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color, width: '2.5rem', textAlign: 'right' }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}

export default function AlternateSupplierDetailPage() {
  const { altId } = useParams<{ altId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const primarySupplierId = (location.state as any)?.primarySupplierId as string | undefined

  const { data, isLoading, isError } = useQuery({
    queryKey: ['alt-detail', altId, primarySupplierId],
    queryFn: () => api.getAlternateSupplierDetail(altId!, primarySupplierId!),
    enabled: !!altId && !!primarySupplierId,
  })

  if (!primarySupplierId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
        Missing context. Please navigate here from a supplier page.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
        {[160, 220, 300].map(h => (
          <div key={h} className="skeleton" style={{ height: h, borderRadius: '0.5rem' }} />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#DC2626', fontSize: '0.875rem' }}>
        Could not load alternate supplier details.
      </div>
    )
  }

  const { supplier, skus_covered, estimated_order_value_inr } = data
  const reliabilityColor = supplier.reliability_score >= 0.8 ? '#059669' : supplier.reliability_score >= 0.6 ? '#D29729' : '#DC2626'
  const qualityColor = supplier.quality_score >= 0.85 ? '#059669' : supplier.quality_score >= 0.7 ? '#D29729' : '#DC2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', maxWidth: '860px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--ink-3)', fontSize: '0.8125rem', fontFamily: 'inherit', padding: '4px 0' }}
        >
          <ChevronLeft size={14} /> Back
        </button>
        <span style={{ color: 'var(--ink-4)', fontSize: '0.75rem' }}>/</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>Alternate Supplier</span>
        <span style={{ color: 'var(--ink-4)', fontSize: '0.75rem' }}>/</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>{supplier.supplier_name}</span>
      </div>

      {/* Profile card */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
              {supplier.cost_premium_pct <= 5 && (
                <span style={{ fontSize: '0.5rem', fontWeight: 700, background: '#F0FDF4', color: '#059669', border: '1px solid #BBF7D0', borderRadius: '4px', padding: '2px 6px', letterSpacing: '0.04em' }}>BEST VALUE</span>
              )}
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', margin: 0, lineHeight: 1.2 }}>{supplier.supplier_name}</h1>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem', color: 'var(--ink-4)', fontSize: '0.75rem' }}>
              <MapPin size={12} />
              <span>{supplier.city}, {supplier.state} · {supplier.region}</span>
              <span>·</span>
              <span style={{ fontWeight: 500, color: 'var(--ink-3)' }}>{supplier.category}</span>
            </div>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Cost Premium</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: supplier.cost_premium_pct <= 10 ? '#059669' : '#D29729', lineHeight: 1 }}>
              +{supplier.cost_premium_pct.toFixed(0)}%
            </div>
            <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '2px' }}>vs primary supplier</div>
          </div>
        </div>

        {/* Score bars */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', padding: '0.875rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '0.875rem' }}>
          <div>
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>Reliability</div>
            <ScoreBar value={supplier.reliability_score} color={reliabilityColor} />
          </div>
          <div>
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>Quality Score</div>
            <ScoreBar value={supplier.quality_score} color={qualityColor} />
          </div>
        </div>

        {/* Quick stats row */}
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
            <Clock size={13} style={{ color: 'var(--ink-4)' }} />
            <span><strong style={{ color: '#000' }}>{supplier.alt_lead_time_days}</strong> days lead time</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
            <Package size={13} style={{ color: 'var(--ink-4)' }} />
            <span>Covers <strong style={{ color: '#000' }}>{skus_covered.length}</strong> SKU{skus_covered.length !== 1 ? 's' : ''}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
            <Star size={13} style={{ color: 'var(--ink-4)' }} />
            <span>Region: <strong style={{ color: '#000' }}>{supplier.region}</strong></span>
          </div>
          {supplier.risk_zone && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
              <AlertTriangle size={13} style={{ color: '#D29729' }} />
              <span>Risk zone: <strong style={{ color: '#000' }}>{supplier.risk_zone}</strong></span>
            </div>
          )}
        </div>
      </div>

      {/* Order summary banner */}
      <div style={{ background: '#000', borderRadius: '0.625rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Estimated Order Value
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {formatINR(estimated_order_value_inr)}
          </div>
          <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
            {supplier.alt_lead_time_days}-day supply across {skus_covered.length} SKU{skus_covered.length !== 1 ? 's' : ''} · includes +{supplier.cost_premium_pct.toFixed(0)}% premium
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: '#fff', color: '#000', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 }}>
          <ShoppingCart size={13} />
          Ready to Order
        </div>
      </div>

      {/* SKUs covered */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          SKUs This Supplier Can Cover
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0' }}>
          {/* Header */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 90px 24px', gap: '0.75rem', padding: '0 0 0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
            {['SKU', 'Lead Time', 'Base Price', 'Your Price', 'Daily Demand', ''].map(h => (
              <div key={h} style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
            ))}
          </div>
          {skus_covered.map((sku: any) => (
            <div key={sku.sku_id} style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 80px 90px 90px 24px', gap: '0.75rem',
              padding: '0.625rem 0', borderBottom: '1px solid var(--border)',
              alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  {sku.is_critical && <AlertTriangle size={10} style={{ color: '#DC2626', flexShrink: 0 }} />}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>{sku.sku_name}</span>
                </div>
                <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '1px' }}>{sku.sku_code}</div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#000', fontWeight: 500 }}>{sku.lead_time_days}d</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{formatINR(sku.unit_cost_inr)}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: sku.cost_premium_pct > 10 ? '#D29729' : '#000' }}>
                {formatINR(sku.adjusted_unit_cost_inr)}
                <span style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 400, marginLeft: '2px' }}>+{sku.cost_premium_pct.toFixed(0)}%</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                {sku.daily_demand_avg.toFixed(0)} units/day
              </div>
              <CheckCircle2 size={14} style={{ color: '#059669' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Ordering guidance */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.625rem', padding: '1rem 1.25rem' }}>
        <h2 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.625rem' }}>
          Ordering Guidance
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {[
            { label: 'Minimum order quantity', value: 'Contact supplier — no MOQ set in system' },
            { label: 'Payment terms', value: 'Standard NET-30 (confirm with supplier)' },
            { label: 'Expected delivery window', value: `${supplier.alt_lead_time_days} days from PO confirmation` },
            { label: 'Quality certification', value: `${(supplier.quality_score * 100).toFixed(0)}% quality score · FSSAI compliant assumed` },
            { label: 'Contact', value: `${supplier.city}, ${supplier.state} — coordinate via procurement team` },
          ].map(row => (
            <div key={row.label} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
              <span style={{ color: '#166534', fontWeight: 600, minWidth: '180px', flexShrink: 0 }}>{row.label}</span>
              <span style={{ color: '#14532D' }}>{row.value}</span>
            </div>
          ))}
        </div>
      </div>

    </div>
  )
}
