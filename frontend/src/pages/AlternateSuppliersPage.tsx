/**
 * Alternate Suppliers Page
 * Shows vetted alternative vendors per Tier-1 FMCG supplier.
 * Surfaces cost premium, lead time delta, quality score, and SKU coverage.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { Building2, MapPin, ChevronRight, ChevronDown, Info, Package, ShieldCheck } from 'lucide-react'
import type { AlternateSupplierRecord } from '../types'

function formatReliability(score: number) {
  return `${(score * 100).toFixed(0)}%`
}

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

function reliabilityLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 0.88) return 'low'
  if (score >= 0.78) return 'medium'
  if (score >= 0.65) return 'high'
  return 'critical'
}

function buildRationale(alt: AlternateSupplierRecord, primaryLead: number): string {
  const lead = alt.lead_time_days
  const leadDelta = lead - primaryLead
  const leadStr = leadDelta === 0
    ? 'same lead time as primary'
    : leadDelta > 0
    ? `${leadDelta}-day longer lead time`
    : `${Math.abs(leadDelta)}-day faster delivery`

  const qual = (alt.quality_score * 100).toFixed(0)
  const prem = alt.cost_premium_pct.toFixed(1)
  const rel = formatReliability(alt.reliability_score ?? alt.quality_score)

  return `${alt.supplier_name} offers ${rel} reliability with ${leadStr} and ${qual}% quality score. ` +
    `Cost premium vs. primary: +${prem}%. Suitable as ${alt.cost_premium_pct < 10 ? 'primary fallback' : 'emergency backup'}.`
}

function AltCard({
  alt, primaryLead,
}: {
  alt: AlternateSupplierRecord
  primaryLead: number
}) {
  const isPreferred = alt.cost_premium_pct < 10 && (alt.reliability_score ?? alt.quality_score) >= 0.85

  return (
    <div style={{
      background: '#fff',
      border: `1px solid ${isPreferred ? '#000' : 'var(--border)'}`,
      borderRadius: '0.625rem',
      padding: '1.5rem',
      position: 'relative',
      boxShadow: 'var(--shadow-sm)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1.5rem',
    }}>
      {isPreferred && (
        <div style={{
          position: 'absolute', top: '1.5rem', right: '1.5rem',
          fontSize: '0.625rem', fontWeight: 700, color: '#000',
          background: 'var(--bg-hover)', border: '1px solid var(--border)',
          padding: '2px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.05em',
          zIndex: 1,
        }}>
          Preferred Alt
        </div>
      )}

      {/* Header */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', paddingRight: isPreferred ? '80px' : '0' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000', lineHeight: 1.2, letterSpacing: '-0.01em' }}>
          {alt.supplier_name}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <MapPin size={12} color="var(--ink-4)" />
          <span style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', fontWeight: 500 }}>{alt.city}, {alt.region}</span>
        </div>
      </div>

      {/* Stats row with floating dividers */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.375rem', letterSpacing: '0.05em' }}>Cost Prem.</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: alt.cost_premium_pct < 10 ? '#4A8B50' : '#D29729', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            +{alt.cost_premium_pct.toFixed(1)}%
          </div>
        </div>
        <div style={{ width: '1px', height: '28px', background: 'var(--border)', margin: '0 0.5rem' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.375rem', letterSpacing: '0.05em' }}>Lead Time</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {alt.lead_time_days}d
          </div>
        </div>
        <div style={{ width: '1px', height: '28px', background: 'var(--border)', margin: '0 0.5rem' }} />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '0.375rem', letterSpacing: '0.05em' }}>Quality</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>
            {((alt.quality_score) * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      {/* SKU covered */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8125rem', color: 'var(--ink-3)', fontWeight: 500, flex: 1, minWidth: 0 }}>
          <Package size={14} color="var(--ink-4)" />
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {alt.covers_sku ?? alt.sku_code ?? '—'}
          </span>
        </div>
        <div style={{ width: '1px', height: '14px', background: 'var(--border)' }} />
        <Badge level={reliabilityLevel(alt.reliability_score ?? alt.quality_score)} />
      </div>

      {/* AI Rationale */}
      <div style={{
        padding: '1rem', background: 'var(--bg-hover)', borderRadius: '0.5rem',
        border: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <ShieldCheck size={14} color="var(--ink-4)" />
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Benchmark Analysis
          </div>
        </div>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
          {buildRationale(alt, primaryLead)}
        </p>
      </div>
    </div>
  )
}

function VendorRow({ supplierId, supplierName, city, region, reliability, leadTime, tier }: {
  supplierId: string
  supplierName: string
  city: string
  region: string
  reliability: number
  leadTime: number
  tier: number
}) {
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 300_000,
  })

  const alts = data?.alternates ?? []
  const uniqueAlts = alts.reduce<AlternateSupplierRecord[]>((acc, a) => {
    if (!acc.find(x => x.supplier_id === a.supplier_id)) acc.push(a)
    return acc
  }, [])

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: '0.625rem',
      overflow: 'hidden',
      boxShadow: 'var(--shadow-sm)',
    }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'grid',
          gridTemplateColumns: '44px 1.5fr 1fr 100px 100px 100px 120px',
          alignItems: 'center',
          gap: '1.5rem',
          padding: '1rem 1.5rem',
          cursor: 'pointer',
          background: open ? 'var(--bg-hover)' : '#fff',
          borderBottom: open ? '1px solid var(--border)' : 'none',
          transition: 'background 200ms',
        }}
      >
        {/* Icon */}
        <div style={{
          width: 44, height: 44, borderRadius: '8px',
          background: '#fff', border: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#000', flexShrink: 0,
        }}>
          <Building2 size={22} strokeWidth={1.5} />
        </div>

        {/* Name & Tier */}
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#000', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {supplierName}
          </div>
          <div style={{ marginTop: '4px' }}>
            <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: '4px', background: '#000', color: '#fff', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Tier {tier}
            </span>
          </div>
        </div>

        {/* Location */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
          <MapPin size={14} color="var(--ink-4)" />
          <span style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {city}, {region}
          </span>
        </div>

        {/* Reliability */}
        <div>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px', letterSpacing: '0.05em' }}>Reliability</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono' }}>
            {(reliability * 100).toFixed(0)}%
          </div>
        </div>

        {/* Lead Time */}
        <div>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px', letterSpacing: '0.05em' }}>Lead Time</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono' }}>
            {leadTime}d
          </div>
        </div>

        {/* Alts Count */}
        <div>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px', letterSpacing: '0.05em' }}>Verified Alts</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono' }}>
            {isLoading ? '…' : uniqueAlts.length}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
          <button
            onClick={e => { e.stopPropagation(); navigate(`/companies/${supplierId}`) }}
            style={{ 
              fontSize: '0.75rem', fontWeight: 700, color: '#000', background: '#fff', border: '1px solid var(--border)', 
              padding: '0.5rem 1rem', borderRadius: '6px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.375rem',
              transition: 'all 200ms ease'
            }}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#000'; e.currentTarget.style.background = 'var(--bg-hover)' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = '#fff' }}
          >
            Profile <ChevronRight size={14} />
          </button>
        </div>
      </div>

      {open && (
        <div style={{ padding: '1.25rem' }}>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              <Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} />
            </div>
          ) : uniqueAlts.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem', fontWeight: 500 }}>
              No alternate suppliers configured for this vendor.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1rem' }}>
              {uniqueAlts.map(alt => (
                <AltCard key={alt.supplier_id} alt={alt} primaryLead={leadTime} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AlternateSuppliersPage() {
  const { data: supplierData, isLoading } = useSuppliers()
  const navigate = useNavigate()
  const tier1 = (supplierData?.suppliers ?? []).filter(s => s.tier === 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1rem' }}>
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
            Alternate Sourcing
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Primary Nodes</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 600, color: '#000000', lineHeight: 1 }}>{tier1.length}</div>
          </div>
          <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Vetted Backups</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 600, color: '#000000', lineHeight: 1 }}>{tier1.length * 2}+</div>
          </div>
        </div>
      </div>

      {/* Legend / Info Strip */}
      <div style={{
        padding: '0.875rem 1.5rem',
        background: '#fff',
        border: '1px solid var(--border)',
        borderRadius: '0.625rem',
        display: 'flex',
        alignItems: 'center',
        gap: '2rem',
        flexWrap: 'wrap',
        boxShadow: 'var(--shadow-sm)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.75rem', color: '#000', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
          <Info size={14} color="#000" />
          Sourcing Legend
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#000', opacity: 0.4 }} />
          <span style={{ fontWeight: 700, color: '#1e293b' }}>Cost Prem.</span> vs Primary
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>
          <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#000', opacity: 0.4 }} />
          <span style={{ fontWeight: 700, color: '#1e293b' }}>Quality</span> Delivery + Audit
        </div>
        <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 800, color: '#065f46', background: '#ecfdf5', border: '1px solid #a7f3d0', padding: '3px 10px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            Preferred Alt
          </div>
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontWeight: 500 }}>= &lt;10% Prem &amp; ≥85% Qual</span>
        </div>
      </div>

      {/* Vendor rows */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {[1,2,3].map(i => <Skeleton key={i} h={80} />)}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          {tier1.map(s => (
            <VendorRow
              key={s.id}
              supplierId={s.id}
              supplierName={s.name}
              city={s.city}
              region={s.region}
              reliability={s.reliability_score}
              leadTime={s.lead_time_days}
              tier={s.tier}
            />
          ))}
        </div>
      )}
    </div>
  )
}
