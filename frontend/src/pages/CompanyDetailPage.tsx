import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers, useSKUs, useDisruptions, useActionCards } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { ChevronLeft, Package, AlertTriangle, Globe, ChevronRight, MapPin, Truck, ShieldAlert, Star, Box, Activity, CalendarDays, TrendingDown } from 'lucide-react'
import type { Supplier, SKURisk, Disruption } from '../types'

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

const STOCK_COLORS: Record<string, string> = { critical: '#DC2626', high: '#D29729', medium: '#2563EB', low: '#059669' }
const STOCK_BG: Record<string, string> = { critical: '#FEF2F2', high: '#FFFBEB', medium: '#EFF6FF', low: '#ECFDF5' }

/* ── SKU Inventory Cards (Clearer Picture of Stock) ───────────────────── */
function SKUInventoryGrid({ skus }: { skus: SKURisk[] }) {
  if (skus.length === 0) {
    return <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '0.875rem' }}>No products provisioned for this vendor.</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', padding: '16px' }}>
      {skus.map(sku => {
        const color = STOCK_COLORS[sku.stockout_risk] ?? '#059669'
        const bg = STOCK_BG[sku.stockout_risk] ?? '#ECFDF5'
        
        // Calculate a visual percentage for the progress bar (max 30 days)
        const runwayPct = Math.min(100, Math.max(5, (sku.days_of_stock / 30) * 100))

        return (
          <div key={sku.id} style={{ border: '1px solid #E5E7EB', borderRadius: '8px', padding: '16px', background: '#FFF', display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {/* Header */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 700, color: '#111827', fontSize: '0.9375rem', lineHeight: 1.2 }}>{sku.name}</div>
                <div style={{ fontSize: '0.6875rem', color: '#6B7280', fontFamily: 'monospace', marginTop: '4px' }}>{sku.sku_code} • {sku.category}</div>
              </div>
              {sku.is_critical && (
                <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FCA5A5' }}>
                  CRITICAL SKU
                </span>
              )}
            </div>

            {/* Visual Runway */}
            <div style={{ background: bg, border: `1px solid ${color}40`, borderRadius: '6px', padding: '12px', textAlign: 'center' }}>
              <div style={{ fontSize: '2rem', fontWeight: 800, color: color, lineHeight: 1, fontFamily: 'monospace' }}>
                {sku.days_of_stock}
              </div>
              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: color, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>
                Days Until Stockout
              </div>
              
              <div style={{ width: '100%', height: '6px', background: '#E5E7EB', borderRadius: '3px', marginTop: '12px', overflow: 'hidden' }}>
                <div style={{ width: `${runwayPct}%`, height: '100%', background: color, borderRadius: '3px' }} />
              </div>
            </div>

            {/* Factual Data Breakdown */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', borderTop: '1px solid #F3F4F6', paddingTop: '16px' }}>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Stock on Hand</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', fontFamily: 'monospace', marginTop: '2px' }}>
                  {sku.current_stock.toLocaleString()} units
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Avg Daily Demand</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', fontFamily: 'monospace', marginTop: '2px' }}>
                  {sku.daily_demand_avg.toLocaleString()} units/day
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Unit Cost</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', fontFamily: 'monospace', marginTop: '2px' }}>
                  ₹{sku.unit_cost_inr.toLocaleString()}
                </div>
              </div>
              <div>
                <div style={{ fontSize: '0.625rem', color: '#6B7280', textTransform: 'uppercase', fontWeight: 600 }}>Inventory Value</div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', fontFamily: 'monospace', marginTop: '2px' }}>
                  ₹{(sku.current_stock * sku.unit_cost_inr).toLocaleString()}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Alternate suppliers section ─────────────────────────────────────── */
function AlternatesSection({ supplierId, actionCardId }: { supplierId: string; actionCardId: string | undefined }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 600_000,
  })

  if (isLoading) return <Skeleton h={80} />
  if (!data || data.count === 0) return <p style={{ fontSize: '0.75rem', color: '#6B7280' }}>No alternate suppliers on record.</p>

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
          onClick={() => navigate(`/alternate-suppliers/${alt.supplier_id}`, {
            state: { primarySupplierId: supplierId, actionCardId },
          })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 0',
            borderBottom: i === unique.length - 1 ? 'none' : '1px solid #E5E7EB',
            background: 'none', border: 'none', cursor: 'pointer', width: '100%', textAlign: 'left',
          }}
          onMouseEnter={e => e.currentTarget.style.opacity = '0.7'}
          onMouseLeave={e => e.currentTarget.style.opacity = '1'}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#111827', marginBottom: '2px' }}>{alt.supplier_name}</div>
            <div style={{ fontSize: '0.75rem', color: '#6B7280', display: 'flex', gap: '6px', alignItems: 'center' }}>
              <MapPin size={10} /> {alt.city} <span style={{ color: '#D1D5DB' }}>|</span> 
              <span style={{ color: '#B45309', fontWeight: 500 }}>+{alt.cost_premium_pct.toFixed(0)}% cost</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ textAlign: 'right' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{(alt.reliability_score * 100).toFixed(0)}%</div>
              <div style={{ fontSize: '0.625rem', color: '#6B7280', fontWeight: 600, letterSpacing: '0.05em' }}>RELIABLE</div>
            </div>
            <ChevronRight size={16} color="#9CA3AF" />
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
  const { data: actionData } = useActionCards()

  const supplier: Supplier | undefined = supplierData?.suppliers.find(s => s.id === id)
  const supplierSKUs: SKURisk[] = (skuData?.skus ?? []).filter(s => s.supplier_name === supplier?.name)
  
  // Isolate strictly active disruptions and sort by impact score
  const activeDisruptions: Disruption[] = (disruptions?.disruptions ?? [])
    .filter(d => d.supplier_id === id && d.is_active)
    .sort((a, b) => b.impact_score - a.impact_score)

  const supplierActionCardId = (actionData?.action_cards ?? [])
    .find(c => c.supplier_id === id && !c.is_resolved)?.id

  if (!id) return null

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '40px' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 4px' }}>
        <button 
          onClick={() => navigate('/companies')} 
          style={{ 
            display: 'flex', alignItems: 'center', gap: '6px',
            fontSize: '0.8125rem', color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 500,
            padding: 0
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#111827'}
          onMouseLeave={e => e.currentTarget.style.color = '#6B7280'}
        >
          <ChevronLeft size={16} />
          Back to Vendors
        </button>
        <div style={{ width: '1px', height: '14px', background: '#E5E7EB' }} />
        <span style={{ fontSize: '0.8125rem', color: '#111827', fontWeight: 600 }}>{supplier?.name ?? <Skeleton w={150} h={16}/>}</span>
      </div>

      {/* Hero / Supplier Profile Header */}
      {supplier ? (
        <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
              <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#111827', margin: 0 }}>{supplier.name}</h1>
              {supplier.risk_zone && (
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#B45309', background: '#FFFBEB', padding: '4px 8px', borderRadius: '6px', border: '1px solid #FDE68A' }}>
                  {supplier.risk_zone.toUpperCase()} ZONE
                </span>
              )}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', color: '#4B5563', fontSize: '0.875rem' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><MapPin size={14} /> {supplier.city}, {supplier.state}</span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}><Box size={14} /> {supplier.category} (Tier {supplier.tier})</span>
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '24px', textAlign: 'right' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reliability Score</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                <Star size={16} color="#F59E0B" fill="#F59E0B" /> {(supplier.reliability_score * 100).toFixed(0)}%
              </span>
            </div>
            <div style={{ width: '1px', background: '#E5E7EB' }} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
              <span style={{ fontSize: '0.6875rem', color: '#6B7280', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Avg Lead Time</span>
              <span style={{ fontSize: '1.25rem', fontWeight: 700, color: '#111827', display: 'flex', alignItems: 'center', gap: '6px', justifyContent: 'flex-end' }}>
                <Truck size={16} color="#6B7280" /> {supplier.lead_time_days} days
              </span>
            </div>
          </div>
        </div>
      ) : <Skeleton h={100} />}

      <div style={{ display: 'grid', gridTemplateColumns: '1.5fr 1fr', gap: '24px', alignItems: 'start' }}>

        {/* Left Column: SKU Inventory Details */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F9FAFB' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Package size={18} color="#4B5563" />
                <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>Product Inventory Status</h3>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#6B7280', fontWeight: 600 }}>
                {supplierSKUs.length} Provisioned SKUs
              </span>
            </div>
            <SKUInventoryGrid skus={supplierSKUs} />
          </div>
        </div>

        {/* Right Column: Alternates & Active Disruptions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
          
          {/* Alternate suppliers (Moved to top) */}
          <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Globe size={18} color="#4B5563" />
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>Approved Alternates</h3>
            </div>
            {id && <AlternatesSection supplierId={id} actionCardId={supplierActionCardId} />}
          </div>

          {/* Active Factual Disruptions */}
          <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
              <Activity size={18} color="#DC2626" />
              <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', margin: 0 }}>Active Disruptions</h3>
            </div>
            
            {activeDisruptions.length === 0 ? (
              <div style={{ padding: '24px 0', textAlign: 'center' }}>
                <ShieldAlert size={32} color="#D1D5DB" style={{ margin: '0 auto 8px' }} />
                <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0 }}>No active disruptions impacting this supplier.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {activeDisruptions.map((d, i) => (
                  <div key={d.id} style={{
                    paddingBottom: i === activeDisruptions.length - 1 ? 0 : '16px',
                    borderBottom: i === activeDisruptions.length - 1 ? 'none' : '1px solid #E5E7EB',
                  }}>
                    {/* Factual Event Header */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                      <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FCA5A5', letterSpacing: '0.05em' }}>
                        ACTIVE EVENT
                      </span>
                      <span style={{ fontSize: '0.6875rem', color: '#4B5563', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                        {d.disruption_type}
                      </span>
                    </div>

                    <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827', marginBottom: '6px', lineHeight: 1.3 }}>{d.title}</div>
                    
                    {/* Factual Data Points */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#F9FAFB', padding: '12px', borderRadius: '6px', border: '1px solid #F3F4F6', marginTop: '10px' }}>
                      {d.region && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#4B5563' }}>
                          <MapPin size={12} color="#9CA3AF" /> <strong style={{ color: '#111827' }}>Region:</strong> {d.region}
                        </div>
                      )}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#4B5563' }}>
                        <CalendarDays size={12} color="#9CA3AF" /> <strong style={{ color: '#111827' }}>Reported:</strong> {new Date(d.start_date).toLocaleDateString()}
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#4B5563' }}>
                        <TrendingDown size={12} color="#9CA3AF" /> <strong style={{ color: '#111827' }}>Impact Score:</strong> {d.impact_score.toFixed(1)}/10
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#4B5563' }}>
                        <Box size={12} color="#9CA3AF" /> <strong style={{ color: '#111827' }}>Affected SKUs:</strong> {d.affected_skus_count} SKUs impacted
                      </div>
                    </div>

                    {d.description && (
                      <p style={{ fontSize: '0.8125rem', color: '#4B5563', lineHeight: 1.5, marginTop: '10px', marginBottom: 0 }}>
                        {d.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
