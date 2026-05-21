/**
 * Alternate Suppliers Page
 * Chip-selector layout: pick a primary supplier, browse its backup options,
 * click a backup to open the detail panel.
 * Accepts navigation state { primarySupplierId, altSupplierId } from CompanyDetailPage.
 */

import { useState, useEffect, useRef } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import {
  Building2, MapPin, ChevronLeft, Package,
  ShieldCheck, X,
} from 'lucide-react'
import type { AlternateSupplierRecord } from '../types'

/* ── helpers ──────────────────────────────────────────────────────────── */
function fmt(n: number, dp = 1) { return n.toFixed(dp) }
function reliabilityLevel(s: number): 'low' | 'medium' | 'high' | 'critical' {
  if (s >= 0.88) return 'low'
  if (s >= 0.78) return 'medium'
  if (s >= 0.65) return 'high'
  return 'critical'
}
function buildRationale(alt: AlternateSupplierRecord, primaryLead: number): string {
  const delta = alt.lead_time_days - primaryLead
  const leadStr = delta === 0 ? 'same delivery time as primary'
    : delta > 0 ? `${delta}-day longer delivery`
    : `${Math.abs(delta)}-day faster delivery`
  return `${alt.supplier_name} offers ${fmt(alt.reliability_score * 100, 0)}% reliability with ${leadStr} ` +
    `and ${fmt(alt.quality_score * 100, 0)}% quality score. Extra cost vs. primary: +${fmt(alt.cost_premium_pct)}%. ` +
    `Suitable as ${alt.cost_premium_pct < 10 ? 'primary fallback' : 'emergency backup'}.`
}

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

/* ── AltMiniCard — clickable card in the grid ─────────────────────────── */
function AltMiniCard({
  alt, primaryLead, selected, onClick,
}: {
  alt: AlternateSupplierRecord
  primaryLead: number
  selected: boolean
  onClick: () => void
}) {
  const isBest = alt.cost_premium_pct < 10 && alt.reliability_score >= 0.85
  const delta = alt.lead_time_days - primaryLead

  return (
    <button
      onClick={onClick}
      style={{
        background: selected ? '#000' : '#fff',
        border: `1px solid ${selected ? '#000' : isBest ? '#000' : 'var(--border)'}`,
        borderRadius: '0.625rem',
        padding: '1rem',
        cursor: 'pointer',
        textAlign: 'left',
        boxShadow: selected ? '0 4px 16px rgba(0,0,0,0.18)' : 'var(--shadow-sm)',
        position: 'relative',
        transition: 'all 160ms ease',
      }}
    >
      {isBest && !selected && (
        <span style={{
          position: 'absolute', top: '-8px', left: '0.75rem',
          fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
          background: '#059669', color: '#fff', letterSpacing: '0.05em',
        }}>BEST PICK</span>
      )}

      <div style={{ marginBottom: '0.625rem' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: selected ? '#fff' : '#000', lineHeight: 1.2 }}>
          {alt.supplier_name}
        </div>
        <div style={{ fontSize: '0.625rem', color: selected ? 'rgba(255,255,255,0.6)' : 'var(--ink-4)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
          <MapPin size={10} /> {alt.city}, {alt.region}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
        <div>
          <div style={{ fontSize: '0.5rem', color: selected ? 'rgba(255,255,255,0.5)' : 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1px' }}>Extra Cost</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: selected ? '#fff' : (alt.cost_premium_pct < 10 ? '#059669' : '#D29729'), fontFamily: 'monospace' }}>
            +{fmt(alt.cost_premium_pct)}%
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.5rem', color: selected ? 'rgba(255,255,255,0.5)' : 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1px' }}>Deliver</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: selected ? '#fff' : '#000', fontFamily: 'monospace' }}>
            {alt.lead_time_days}d
            {delta !== 0 && (
              <span style={{ fontSize: '0.5rem', color: selected ? 'rgba(255,255,255,0.5)' : (delta > 0 ? '#D29729' : '#059669'), marginLeft: '2px' }}>
                {delta > 0 ? `+${delta}` : delta}
              </span>
            )}
          </div>
        </div>
        <div>
          <div style={{ fontSize: '0.5rem', color: selected ? 'rgba(255,255,255,0.5)' : 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '1px' }}>Reliability</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: selected ? '#fff' : '#000', fontFamily: 'monospace' }}>
            {fmt(alt.reliability_score * 100, 0)}%
          </div>
        </div>
      </div>
    </button>
  )
}

/* ── AltDetailPanel — right-side panel ──────────────────────────────── */
function AltDetailPanel({
  alt, primaryLead, onClose,
}: {
  alt: AlternateSupplierRecord
  primaryLead: number
  onClose: () => void
}) {
  const isBest = alt.cost_premium_pct < 10 && alt.reliability_score >= 0.85
  const relPct = alt.reliability_score * 100
  const qualPct = alt.quality_score * 100

  return (
    <div style={{
      background: '#fff',
      border: '1px solid var(--border)',
      borderRadius: '0.75rem',
      padding: '1.25rem',
      boxShadow: 'var(--shadow-md)',
      display: 'flex',
      flexDirection: 'column',
      gap: '1rem',
      position: 'sticky',
      top: '1rem',
    }}>
      {/* Panel header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          {isBest && (
            <span style={{
              display: 'inline-block', marginBottom: '0.375rem',
              fontSize: '0.5rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
              background: '#059669', color: '#fff', letterSpacing: '0.05em',
            }}>BEST PICK</span>
          )}
          <h2 style={{ fontSize: '1rem', fontWeight: 700, color: '#000', lineHeight: 1.2, marginBottom: '0.25rem' }}>
            {alt.supplier_name}
          </h2>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
            <MapPin size={12} /> {alt.city}, {alt.region}
          </div>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px', color: 'var(--ink-4)' }}>
          <X size={16} />
        </button>
      </div>

      {/* Stats grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <div style={{ padding: '0.75rem', background: 'var(--bg-hover)', borderRadius: '0.5rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Extra Cost</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: alt.cost_premium_pct < 10 ? '#059669' : '#D29729', fontFamily: 'monospace', lineHeight: 1 }}>
            +{fmt(alt.cost_premium_pct)}%
          </div>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', marginTop: '2px' }}>vs. primary supplier</div>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--bg-hover)', borderRadius: '0.5rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Days to Deliver</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#000', fontFamily: 'monospace', lineHeight: 1 }}>
            {alt.lead_time_days}d
          </div>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', marginTop: '2px' }}>
            {alt.lead_time_days === primaryLead ? 'same as primary' : alt.lead_time_days > primaryLead ? `+${alt.lead_time_days - primaryLead}d slower` : `${primaryLead - alt.lead_time_days}d faster`}
          </div>
        </div>
      </div>

      {/* Reliability bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Reliability</span>
          <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', fontFamily: 'monospace' }}>{fmt(relPct, 0)}%</span>
        </div>
        <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${relPct}%`, height: '100%', background: relPct >= 88 ? '#059669' : relPct >= 78 ? '#2563EB' : '#D29729', transition: 'width 0.6s ease', borderRadius: '3px' }} />
        </div>
      </div>

      {/* Quality bar */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Quality Score</span>
          <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', fontFamily: 'monospace' }}>{fmt(qualPct, 0)}%</span>
        </div>
        <div style={{ height: '6px', background: 'var(--bg-hover)', borderRadius: '3px', overflow: 'hidden' }}>
          <div style={{ width: `${qualPct}%`, height: '100%', background: '#000', transition: 'width 0.6s ease', borderRadius: '3px' }} />
        </div>
      </div>

      {/* SKU */}
      {(alt.covers_sku || alt.sku_code) && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', padding: '0.625rem', background: 'var(--bg-hover)', borderRadius: '0.375rem' }}>
          <Package size={14} color="var(--ink-4)" />
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>{alt.covers_sku ?? alt.sku_code}</span>
        </div>
      )}

      {/* Rationale */}
      <div style={{ padding: '0.875rem', background: 'var(--bg-hover)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
          <ShieldCheck size={13} color="var(--ink-4)" />
          <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Sourcing Analysis</span>
        </div>
        <p style={{ fontSize: '0.75rem', color: '#000', lineHeight: 1.6, margin: 0 }}>
          {buildRationale(alt, primaryLead)}
        </p>
      </div>

      <Badge level={reliabilityLevel(alt.reliability_score)} />
    </div>
  )
}

/* ── AlternatesGrid — for a single primary supplier ──────────────────── */
function AlternatesGrid({
  supplierId, leadTime, highlightAltId, onSelectAlt, selectedAltId,
}: {
  supplierId: string
  leadTime: number
  highlightAltId?: string
  onSelectAlt: (alt: AlternateSupplierRecord) => void
  selectedAltId?: string
}) {
  const cardRef = useRef<HTMLDivElement | null>(null)

  const { data, isLoading } = useQuery({
    queryKey: ['alternates', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId),
    staleTime: 300_000,
  })

  // Deduplicate
  const alts: AlternateSupplierRecord[] = []
  const seen = new Set<string>()
  for (const a of (data?.alternates ?? [])) {
    if (!seen.has(a.alternate_id)) { seen.add(a.alternate_id); alts.push(a) }
  }

  // Auto-scroll to highlighted alt
  useEffect(() => {
    if (highlightAltId && cardRef.current) {
      cardRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [highlightAltId, alts.length])

  if (isLoading) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
        {[1, 2, 3].map(i => <Skeleton key={i} h={140} />)}
      </div>
    )
  }
  if (alts.length === 0) {
    return <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', padding: '1rem 0' }}>No backup suppliers configured for this vendor.</p>
  }

  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '0.75rem' }}>
      {alts.map(alt => (
        <div key={alt.alternate_id} ref={alt.alternate_id === highlightAltId ? cardRef : undefined}>
          <AltMiniCard
            alt={alt}
            primaryLead={leadTime}
            selected={selectedAltId === alt.alternate_id}
            onClick={() => onSelectAlt(alt)}
          />
        </div>
      ))}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function AlternateSuppliersPage() {
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = (location.state ?? {}) as { primarySupplierId?: string; altSupplierId?: string }

  const { data: supplierData, isLoading } = useSuppliers()
  const suppliers = supplierData?.suppliers ?? []

  // Active primary supplier chip
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(
    locationState.primarySupplierId ?? null
  )
  // Selected alt for detail panel
  const [selectedAlt, setSelectedAlt] = useState<AlternateSupplierRecord | null>(null)

  // Auto-set the first supplier when data loads (if none active)
  useEffect(() => {
    if (!activeSupplierId && suppliers.length > 0) {
      setActiveSupplierId(suppliers[0].id)
    }
  }, [suppliers.length])

  const activeSupplier = suppliers.find(s => s.id === activeSupplierId)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          {locationState.primarySupplierId && (
            <button
              onClick={() => navigate(`/companies/${locationState.primarySupplierId}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.375rem',
                fontSize: '0.75rem', color: 'var(--ink-3)', background: 'none', border: 'none',
                cursor: 'pointer', fontWeight: 500, padding: 0, marginBottom: '0.5rem',
              }}
            >
              <ChevronLeft size={14} /> Back to supplier
            </button>
          )}
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Backup Suppliers
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem', fontWeight: 400 }}>
            Vetted alternates per primary vendor — cost, delivery, reliability
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Primary Vendors</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', lineHeight: 1 }}>{suppliers.length}</div>
          </div>
        </div>
      </div>

      {/* Chip selector */}
      {isLoading ? (
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} h={34} w="120px" />)}
        </div>
      ) : (
        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          {suppliers.map(s => {
            const active = s.id === activeSupplierId
            return (
              <button
                key={s.id}
                onClick={() => { setActiveSupplierId(s.id); setSelectedAlt(null) }}
                style={{
                  padding: '0.375rem 0.875rem',
                  background: active ? '#000' : '#fff',
                  color: active ? '#fff' : '#000',
                  border: `1px solid ${active ? '#000' : 'var(--border)'}`,
                  borderRadius: '999px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  transition: 'all 150ms ease',
                  whiteSpace: 'nowrap',
                }}
              >
                {s.name}
              </button>
            )
          })}
        </div>
      )}

      {/* Main content: grid + detail panel */}
      {activeSupplierId && activeSupplier && (
        <div style={{ display: 'grid', gridTemplateColumns: selectedAlt ? '1fr 320px' : '1fr', gap: '1rem', alignItems: 'start' }}>
          {/* Left: alt cards */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.75rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
              <Building2 size={15} color="#000" />
              <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>{activeSupplier.name}</h2>
              <span style={{ fontSize: '0.625rem', padding: '2px 6px', borderRadius: '4px', background: '#000', color: '#fff', fontWeight: 700 }}>TIER {activeSupplier.tier}</span>
              <span style={{ marginLeft: 'auto', fontSize: '0.625rem', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                <MapPin size={11} /> {activeSupplier.city}, {activeSupplier.region}
              </span>
            </div>

            <AlternatesGrid
              supplierId={activeSupplierId}
              leadTime={activeSupplier.lead_time_days}
              highlightAltId={locationState.primarySupplierId === activeSupplierId ? locationState.altSupplierId : undefined}
              selectedAltId={selectedAlt?.alternate_id}
              onSelectAlt={(alt) => setSelectedAlt(prev => prev?.alternate_id === alt.alternate_id ? null : alt)}
            />
          </div>

          {/* Right: detail panel */}
          {selectedAlt && (
            <AltDetailPanel
              alt={selectedAlt}
              primaryLead={activeSupplier.lead_time_days}
              onClose={() => setSelectedAlt(null)}
            />
          )}
        </div>
      )}
    </div>
  )
}
