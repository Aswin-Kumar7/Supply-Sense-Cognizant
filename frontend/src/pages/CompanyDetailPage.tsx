import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers, useSKUs, useDisruptions, useActionCards } from '../hooks/useQueries'
import { Package, Globe, ChevronRight, MapPin, Truck, ShieldAlert, Star, Box, Activity, CalendarDays, TrendingDown } from 'lucide-react'
import type { Supplier, SKURisk, Disruption } from '../types'

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string | number }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

const STOCK_COLORS: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' }
const STOCK_BG: Record<string, string> = { critical: '#FEF2F2', high: '#FFFBEB', medium: '#EFF6FF', low: '#ECFDF5' }
const STOCK_BORDER: Record<string, string> = { critical: '#FCA5A5', high: '#FDE68A', medium: '#BFDBFE', low: '#A7F3D0' }

/* ── SKU Inventory Cards ──────────────────────────────────────────────── */
function SKUInventoryGrid({ skus }: { skus: SKURisk[] }) {
  if (skus.length === 0) {
    return <div style={{ padding: '32px', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>No products provisioned for this vendor.</div>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px', padding: '16px' }}>
      {skus.map(sku => {
        const color = STOCK_COLORS[sku.stockout_risk] ?? '#059669'
        const bg = STOCK_BG[sku.stockout_risk] ?? '#ECFDF5'
        const borderCol = STOCK_BORDER[sku.stockout_risk] ?? '#A7F3D0'
        const runwayPct = Math.min(100, Math.max(5, (sku.days_of_stock / 30) * 100))

        return (
          <div key={sku.id} style={{ border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', background: '#FFF', display: 'flex', flexDirection: 'column', gap: '12px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)' }}>
            {/* Title & Tag */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
              <div>
                <h4 style={{ fontWeight: 805, color: '#0F172A', fontSize: '0.875rem', margin: 0, lineHeight: 1.25, letterSpacing: '-0.01em' }}>{sku.name}</h4>
                <div style={{ fontSize: '0.6875rem', color: '#64748B', fontFamily: 'monospace', marginTop: '2px' }}>{sku.sku_code} • {sku.category}</div>
              </div>
              <span style={{ 
                fontSize: '0.625rem', fontWeight: 800, color: color, background: bg, border: `1px solid ${borderCol}`,
                padding: '2px 6px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', flexShrink: 0
              }}>
                {sku.days_of_stock}d stock
              </span>
            </div>

            {/* Progress indicator */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', marginTop: '4px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.6875rem', fontWeight: 600, color: '#64748B' }}>
                <span>Runway Progress</span>
                <span style={{ color: color, fontWeight: 700 }}>{sku.days_of_stock} days remaining</span>
              </div>
              <div style={{ width: '100%', height: '6px', background: '#F1F5F9', borderRadius: '3px', overflow: 'hidden' }}>
                <div style={{ width: `${runwayPct}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 300ms ease' }} />
              </div>
            </div>

            {/* Details */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', borderTop: '1px solid #F1F5F9', paddingTop: '12px', marginTop: '4px' }}>
              <div>
                <span style={{ fontSize: '0.5625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Stock On Hand</span>
                <div style={{ fontSize: '0.8125rem', fontWeight: 750, color: '#0F172A', fontFamily: 'monospace', marginTop: '1px' }}>{sku.current_stock.toLocaleString()} u</div>
              </div>
              <div>
                <span style={{ fontSize: '0.5625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Daily Demand</span>
                <div style={{ fontSize: '0.8125rem', fontWeight: 750, color: '#0F172A', fontFamily: 'monospace', marginTop: '1px' }}>{sku.daily_demand_avg.toLocaleString()}/d</div>
              </div>
              <div>
                <span style={{ fontSize: '0.5625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Unit Cost</span>
                <div style={{ fontSize: '0.8125rem', fontWeight: 750, color: '#0F172A', fontFamily: 'monospace', marginTop: '1px' }}>₹{sku.unit_cost_inr.toLocaleString()}</div>
              </div>
              <div>
                <span style={{ fontSize: '0.5625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, letterSpacing: '0.05em' }}>Total Value</span>
                <div style={{ fontSize: '0.8125rem', fontWeight: 750, color: '#0F172A', fontFamily: 'monospace', marginTop: '1px' }}>₹{(sku.current_stock * sku.unit_cost_inr).toLocaleString()}</div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Alternate Suppliers section ──────────────────────────────────────── */
function AlternatesSection({ supplierId, actionCardId }: { supplierId: string; actionCardId: string | undefined }) {
  const navigate = useNavigate()
  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 600_000,
  })

  if (isLoading) return <Skeleton h={80} />
  if (!data || data.count === 0) return <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0 }}>No approved alternates found.</p>

  const seen = new Set<string>()
  const unique = data.alternates.filter(alt => {
    if (seen.has(alt.alternate_id)) return false
    seen.add(alt.alternate_id)
    return true
  }).slice(0, 4)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
      {unique.map(alt => (
        <button
          key={alt.alternate_id}
          onClick={() => navigate(`/alternate-suppliers/${alt.supplier_id}`, {
            state: { primarySupplierId: supplierId, actionCardId },
          })}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 14px', background: '#FFFFFF',
            border: '1px solid #E2E8F0', borderRadius: '8px',
            cursor: 'pointer', textAlign: 'left', width: '100%',
            transition: 'all 150ms ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1' }}
          onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0' }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0F172A', marginBottom: '2px', letterSpacing: '-0.01em' }}>{alt.supplier_name}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', display: 'flex', gap: '6px', alignItems: 'center', fontWeight: 500 }}>
              <MapPin size={11} color="#94A3B8" /> {alt.city} <span style={{ color: '#E2E8F0' }}>|</span> 
              <span style={{ color: '#D97706', fontWeight: 700 }}>+{alt.cost_premium_pct.toFixed(0)}% premium</span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            <span style={{ 
              fontSize: '0.75rem', fontWeight: 800, color: '#059669', background: '#ECFDF5', border: '1px solid #A7F3D0',
              padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace', whiteSpace: 'nowrap'
            }}>
              {(alt.reliability_score * 100).toFixed(0)}% reliable
            </span>
            <ChevronRight size={14} color="#94A3B8" />
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
  
  const activeDisruptions: Disruption[] = (disruptions?.disruptions ?? [])
    .filter(d => d.supplier_id === id && d.is_active)
    .sort((a, b) => b.impact_score - a.impact_score)

  const supplierActionCardId = (actionData?.action_cards ?? [])
    .find(c => c.supplier_id === id && !c.is_resolved)?.id

  if (!id) return null

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', minHeight: '100%', 
      background: '#F8FAFC', color: '#0F172A', 
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    }}>
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '14px 24px', background: '#FFF', borderBottom: '1px solid #E2E8F0',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
          <span 
            onClick={() => navigate('/')} 
            style={{ cursor: 'pointer', transition: 'color 150ms ease' }}
            onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
          >
            Dashboard
          </span>
          <span>/</span>
          <span 
            onClick={() => navigate('/companies')} 
            style={{ cursor: 'pointer', transition: 'color 150ms ease' }}
            onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
          >
            Suppliers
          </span>
          <span>/</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A' }}>{supplier?.name ?? <Skeleton w={120} h={16} />}</span>
        </div>
        <button 
          onClick={() => navigate('/companies')}
          style={{
            background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px',
            padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748B',
            cursor: 'pointer', transition: 'all 150ms ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#0F172A' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B' }}
        >
          Back to Directory
        </button>
      </div>

      {/* Main Page Layout Wrapper */}
      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Hero / Supplier Profile Header Card */}
        {supplier ? (
          <div style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.03em' }}>{supplier.name}</h1>
                {supplier.risk_zone && (
                  <span style={{ fontSize: '0.625rem', fontWeight: 800, color: '#D97706', background: '#FFFBEB', padding: '2px 8px', borderRadius: '4px', border: '1px solid #FDE68A', letterSpacing: '0.04em' }}>
                    {supplier.risk_zone.toUpperCase()} ZONE
                  </span>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '14px', color: '#64748B', fontSize: '0.8125rem', fontWeight: 500 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={13} color="#94A3B8" /> {supplier.city}, {supplier.state}</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}><Box size={13} color="#94A3B8" /> {supplier.category} (Tier {supplier.tier})</span>
              </div>
            </div>
            
            <div style={{ display: 'flex', gap: '20px', alignItems: 'center' }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.625rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Reliability Score</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  <Star size={16} color="#F59E0B" fill="#F59E0B" /> {(supplier.reliability_score * 100).toFixed(0)}%
                </span>
              </div>
              <div style={{ width: '1px', height: '36px', background: '#E2E8F0' }} />
              <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                <span style={{ fontSize: '0.625rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Avg Lead Time</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
                  <Truck size={16} color="#64748B" /> {supplier.lead_time_days} days
                </span>
              </div>
            </div>
          </div>
        ) : <Skeleton h={100} />}

        {/* 2-Column Suite Layout */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: '20px', alignItems: 'start' }}>

          {/* Left Column: SKU Inventory Details */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <div style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', overflow: 'hidden' }}>
              <div style={{ padding: '14px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#F8FAFC' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Package size={16} color="#64748B" />
                  <h3 style={{ fontSize: '0.875rem', fontWeight: 850, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Product Inventory Status</h3>
                </div>
                <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 700 }}>
                  {supplierSKUs.length} Provisioned SKUs
                </span>
              </div>
              <SKUInventoryGrid skus={supplierSKUs} />
            </div>
          </div>

          {/* Right Column: Alternates & Active Disruptions */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Approved Alternates */}
            <div style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Globe size={16} color="#64748B" />
                <h3 style={{ fontSize: '0.875rem', fontWeight: 850, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Approved Alternates</h3>
              </div>
              {id && <AlternatesSection supplierId={id} actionCardId={supplierActionCardId} />}
            </div>

            {/* Active Factual Disruptions */}
            <div style={{ background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px 20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                <Activity size={16} color="#EF4444" />
                <h3 style={{ fontSize: '0.875rem', fontWeight: 850, color: '#0F172A', margin: 0, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Disruptions</h3>
              </div>
              
              {activeDisruptions.length === 0 ? (
                <div style={{ padding: '24px 0', textAlign: 'center' }}>
                  <ShieldAlert size={32} color="#CBD5E1" style={{ margin: '0 auto 8px' }} />
                  <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: 0, fontWeight: 500 }}>No active disruptions impacting this supplier.</p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  {activeDisruptions.map((d, i) => (
                    <div key={d.id} style={{
                      paddingBottom: i === activeDisruptions.length - 1 ? 0 : '14px',
                      borderBottom: i === activeDisruptions.length - 1 ? 'none' : '1px solid #F1F5F9',
                    }}>
                      {/* Factual Event Header */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
                        <span style={{ fontSize: '0.5625rem', fontWeight: 800, color: '#DC2626', background: '#FEF2F2', padding: '2px 6px', borderRadius: '4px', border: '1px solid #FCA5A5', letterSpacing: '0.05em' }}>
                          ACTIVE EVENT
                        </span>
                        <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '4px', textTransform: 'uppercase' }}>
                          {d.disruption_type}
                        </span>
                      </div>

                      <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A', marginBottom: '6px', lineHeight: 1.3, letterSpacing: '-0.01em' }}>{d.title}</div>
                      
                      {/* Factual Data Points */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', background: '#F8FAFC', padding: '12px', borderRadius: '8px', border: '1px solid #E2E8F0', marginTop: '10px' }}>
                        {d.region && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                            <MapPin size={12} color="#94A3B8" /> <strong style={{ color: '#0F172A' }}>Region:</strong> {d.region}
                          </div>
                        )}
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                          <CalendarDays size={12} color="#94A3B8" /> <strong style={{ color: '#0F172A' }}>Reported:</strong> {new Date(d.start_date).toLocaleDateString()}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                          <TrendingDown size={12} color="#94A3B8" /> <strong style={{ color: '#0F172A' }}>Impact:</strong> {(d.impact_score * 100).toFixed(0)}%
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#475569', fontWeight: 500 }}>
                          <Box size={12} color="#94A3B8" /> <strong style={{ color: '#0F172A' }}>Affected SKUs:</strong> {d.affected_skus_count} SKUs
                        </div>
                      </div>

                      {d.description && (
                        <p style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5, marginTop: '10px', marginBottom: 0 }}>
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
    </div>
  )
}
