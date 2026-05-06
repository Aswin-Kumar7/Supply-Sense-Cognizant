/**
 * Alternate Suppliers Page
 * Shows 2-3 vetted alternative vendors per Tier-1 FMCG supplier.
 * Surfaces cost premium, lead time delta, quality score, and SKU coverage.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import type { AlternateSupplierRecord } from '../types'

function formatReliability(score: number) {
  return `${(score * 100).toFixed(0)}%`
}

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

/* ── Derive a risk-like level from reliability score ─────────────────── */
function reliabilityLevel(score: number): 'low' | 'medium' | 'high' | 'critical' {
  if (score >= 0.88) return 'low'
  if (score >= 0.78) return 'medium'
  if (score >= 0.65) return 'high'
  return 'critical'
}

/* ── Generate rationale text from data (no hallucination) ────────────── */
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

  return `${alt.supplier_name} (${alt.city}) offers ${rel} reliability with ${leadStr} and ${qual}% quality score. ` +
    `Cost premium vs. primary: +${prem}%. Suitable as ${alt.cost_premium_pct < 10 ? 'primary fallback' : 'emergency backup'}.`
}

/* ── Alt supplier card ───────────────────────────────────────────────── */
function AltCard({
  alt, primaryLead,
}: {
  alt: AlternateSupplierRecord
  primaryLead: number
}) {
  const leadDelta = alt.lead_time_days - primaryLead
  const isPreferred = alt.cost_premium_pct < 10 && (alt.reliability_score ?? alt.quality_score) >= 0.85

  return (
    <div style={{
      background: isPreferred ? '#F0FDF4' : 'var(--bg-app)',
      border: `1px solid ${isPreferred ? '#BBF7D0' : 'var(--border)'}`,
      borderRadius: '0.75rem',
      padding: '1rem',
      position: 'relative',
      transition: 'box-shadow 150ms',
    }}
    onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.08)')}
    onMouseLeave={e => (e.currentTarget.style.boxShadow = 'none')}
    >
      {isPreferred && (
        <div style={{
          position: 'absolute', top: '0.625rem', right: '0.75rem',
          fontSize: '0.6rem', fontWeight: 700, color: '#059669',
          background: '#DCFCE7', border: '1px solid #BBF7D0',
          padding: '2px 6px', borderRadius: '999px', textTransform: 'uppercase', letterSpacing: '0.06em',
        }}>
          Preferred Alt
        </div>
      )}

      {/* Header */}
      <div style={{ marginBottom: '0.625rem' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{alt.supplier_name}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px' }}>
          {alt.city}, {alt.state} · {alt.region}
        </div>
      </div>

      {/* Stats row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '0.75rem' }}>
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-card)', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: alt.cost_premium_pct < 10 ? '#059669' : '#D97706' }}>
            +{alt.cost_premium_pct.toFixed(1)}%
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ink-4)', marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Cost Premium
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-card)', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-1)' }}>
            {alt.lead_time_days}d
            {leadDelta !== 0 && (
              <span style={{ fontSize: '0.6875rem', fontWeight: 400, color: leadDelta > 0 ? '#D97706' : '#059669', marginLeft: '3px' }}>
                ({leadDelta > 0 ? '+' : ''}{leadDelta})
              </span>
            )}
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ink-4)', marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Lead Time
          </div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.5rem', background: 'var(--bg-card)', borderRadius: '0.5rem', border: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-1)' }}>
            {((alt.quality_score) * 100).toFixed(0)}%
          </div>
          <div style={{ fontSize: '0.6rem', color: 'var(--ink-4)', marginTop: '1px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Quality Score
          </div>
        </div>
      </div>

      {/* SKU covered */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <span style={{ fontSize: '0.6875rem', color: 'var(--ink-3)' }}>Covers:</span>
        <span style={{
          fontSize: '0.6rem', padding: '2px 8px', borderRadius: '999px',
          background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', fontWeight: 600,
        }}>
          {alt.covers_sku ?? alt.sku_code ?? '—'}
        </span>
        <Badge level={reliabilityLevel(alt.reliability_score ?? alt.quality_score)} />
      </div>

      {/* AI Rationale */}
      <div style={{
        padding: '0.625rem', background: 'var(--bg-hover)', borderRadius: '0.5rem',
        border: '1px solid #E2E8F0',
      }}>
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
          Procurement Rationale
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-2)', lineHeight: 1.6, margin: 0 }}>
          {buildRationale(alt, primaryLead)}
        </p>
      </div>
    </div>
  )
}

/* ── Vendor row ──────────────────────────────────────────────────────── */
function VendorRow({ supplierId, supplierName, city, region, reliability, leadTime, tier }: {
  supplierId: string
  supplierName: string
  city: string
  region: string
  reliability: number
  leadTime: number
  tier: number
}) {
  const [open, setOpen] = useState(true)
  const navigate = useNavigate()

  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 300_000,
  })

  const alts = data?.alternates ?? []

  // Deduplicate by supplier_id (multiple SKUs can share same alternate)
  const uniqueAlts = alts.reduce<AlternateSupplierRecord[]>((acc, a) => {
    if (!acc.find(x => x.supplier_id === a.supplier_id)) acc.push(a)
    return acc
  }, [])

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: '1px solid #E2E8F0',
      borderRadius: '0.875rem',
      overflow: 'hidden',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      {/* Header */}
      <div
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.875rem',
          padding: '1rem 1.25rem',
          cursor: 'pointer',
          background: open ? '#FAFBFF' : 'var(--bg-card)',
          borderBottom: open ? '1px solid #E2E8F0' : 'none',
          transition: 'background 150ms',
        }}
        onMouseEnter={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)' }}
        onMouseLeave={e => { if (!open) (e.currentTarget as HTMLElement).style.background = 'var(--bg-card)' }}
      >
        {/* Avatar */}
        <div style={{
          width: 40, height: 40, borderRadius: '0.625rem',
          background: 'linear-gradient(135deg,#003087,#0052CC)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0,
        }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: '0.8125rem' }}>
            {supplierName.split(' ').slice(0,2).map(w => w[0]).join('')}
          </span>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)' }}>{supplierName}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px' }}>
            {city} · {region} · Tier {tier} · {(reliability * 100).toFixed(0)}% reliability · {leadTime}d lead time
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
          <span style={{
            fontSize: '0.6875rem', padding: '3px 10px', borderRadius: '999px',
            background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', fontWeight: 600,
          }}>
            {isLoading ? '…' : `${uniqueAlts.length} alt${uniqueAlts.length !== 1 ? 's' : ''}`}
          </span>
          <button
            onClick={e => { e.stopPropagation(); navigate(`/companies/${supplierId}`) }}
            style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            View →
          </button>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0)', transition: 'transform 200ms', color: 'var(--ink-4)', flexShrink: 0 }}>
            <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
        </div>
      </div>

      {/* Alternates grid */}
      {open && (
        <div style={{ padding: '1.25rem' }}>
          {isLoading ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
              <Skeleton h={180} /><Skeleton h={180} /><Skeleton h={180} />
            </div>
          ) : uniqueAlts.length === 0 ? (
            <div style={{ padding: '1.5rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
              No alternate suppliers configured for this vendor.
            </div>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '0.875rem' }}>
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

/* ── Page ────────────────────────────────────────────────────────────── */
export default function AlternateSuppliersPage() {
  const { data: supplierData, isLoading } = useSuppliers()

  // Only show Tier-1 FMCG suppliers
  const tier1 = (supplierData?.suppliers ?? []).filter(s => s.tier === 1)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
            Alternate Suppliers
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
            Vetted backup vendors per Tier-1 FMCG supplier — cost premium, lead time, and quality benchmarked
          </p>
        </div>
        <div style={{
          padding: '0.5rem 0.875rem',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '0.625rem',
          fontSize: '0.75rem',
          color: '#2563EB',
          fontWeight: 600,
        }}>
          {tier1.length} vendors · {tier1.length * 2}–{tier1.length * 3} alternates
        </div>
      </div>

      {/* Legend */}
      <div style={{
        padding: '0.75rem 1rem',
        background: '#FFFBEB',
        border: '1px solid #FDE68A',
        borderRadius: '0.625rem',
        display: 'flex',
        alignItems: 'center',
        gap: '1.5rem',
        flexWrap: 'wrap',
      }}>
        <span style={{ fontSize: '0.75rem', color: '#92400E', fontWeight: 600 }}>How to read:</span>
        <span style={{ fontSize: '0.75rem', color: '#78350F' }}>
          <span style={{ fontWeight: 700 }}>Cost Premium</span> — % markup vs. current primary supplier
        </span>
        <span style={{ fontSize: '0.75rem', color: '#78350F' }}>
          <span style={{ fontWeight: 700 }}>Lead Time (±)</span> — days relative to primary
        </span>
        <span style={{ fontSize: '0.75rem', color: '#78350F' }}>
          <span style={{ fontWeight: 700 }}>Quality Score</span> — combined delivery + audit rating
        </span>
        <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px', background: '#DCFCE7', border: '1px solid #BBF7D0', color: '#059669', fontWeight: 700 }}>
          Preferred Alt
        </span>
        <span style={{ fontSize: '0.75rem', color: '#78350F' }}>= cost &lt;10% premium &amp; quality ≥85%</span>
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
