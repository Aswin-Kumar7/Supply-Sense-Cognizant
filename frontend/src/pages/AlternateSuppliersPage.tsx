import { useState, useEffect, useMemo } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers } from '../hooks/useQueries'
import {
  Building2, MapPin, Network, Box, ShieldCheck, X, Zap,
  Clock, TrendingUp, Search, ChevronRight, Package
} from 'lucide-react'
import type { AlternateSupplierRecord, Supplier } from '../types'

function fmt(n: number, dp = 1) { return n.toFixed(dp) }

function scoreColor(pct: number) {
  if (pct >= 85) return '#10B981'
  if (pct >= 70) return '#F59E0B'
  return '#EF4444'
}

/* ── Tier 2 Detail Panel ───────────────────────────────────────────────── */
function Tier2DetailPanel({
  alt, tier1, onClose,
}: {
  alt: AlternateSupplierRecord
  tier1: Supplier
  onClose: () => void
}) {
  const relPct = alt.reliability_score * 100
  const qualPct = alt.quality_score * 100
  const premium = alt.cost_premium_pct   // already stored as percentage (e.g. 8.0 = 8%)

  return (
    <div style={{
      position: 'absolute', right: 0, top: 0, bottom: 0, width: '360px',
      background: '#18181B', borderLeft: '1px solid #27272A',
      boxShadow: '-12px 0 40px rgba(0,0,0,0.6)',
      display: 'flex', flexDirection: 'column', zIndex: 50, overflowY: 'auto'
    }}>
      {/* Header */}
      <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid #27272A', background: '#1C1C1F' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '8px' }}>
          <div style={{ flex: 1, minWidth: 0, paddingRight: '12px' }}>
            <div style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#FAFAFA', lineHeight: 1.3, marginBottom: '4px' }}>
              {alt.supplier_name}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: '#71717A' }}>
              <MapPin size={12} /> {alt.city}, {alt.state}
            </div>
          </div>
          <button onClick={onClose} style={{ background: '#27272A', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#A1A1AA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <X size={15} />
          </button>
        </div>
        <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginTop: '10px' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, background: '#27272A', color: '#A1A1AA', padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            TIER 2
          </span>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '3px 8px', borderRadius: '4px', textTransform: 'uppercase', letterSpacing: '0.04em', background: relPct >= 85 ? '#064E3B' : '#451A03', color: relPct >= 85 ? '#34D399' : '#FCD34D' }}>
            {relPct >= 85 ? 'Healthy' : 'Watch'}
          </span>
          <span style={{ fontSize: '0.6875rem', fontWeight: 600, background: '#1E293B', color: '#93C5FD', padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <Box size={10} /> {alt.category}
          </span>
        </div>
      </div>

      {/* Scores */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272A', display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {[
          { label: 'Fulfillment Reliability', value: relPct, color: scoreColor(relPct) },
          { label: 'Quality Compliance', value: qualPct, color: '#3B82F6' },
        ].map(({ label, value, color }) => (
          <div key={label}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
              <span style={{ fontSize: '0.75rem', color: '#A1A1AA', fontWeight: 500 }}>{label}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#FAFAFA' }}>{fmt(value, 0)}%</span>
            </div>
            <div style={{ height: '5px', background: '#3F3F46', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ width: `${value}%`, height: '100%', background: color, borderRadius: '3px', transition: 'width 0.4s ease' }} />
            </div>
          </div>
        ))}
      </div>

      {/* Key Metrics Grid */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272A' }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
          Operational Metrics
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <MetricCell
            icon={<Clock size={14} color="#3B82F6" />}
            label="Lead Time"
            value={`${alt.lead_time_days} days`}
            sub={alt.lead_time_days <= 14 ? 'Fast' : alt.lead_time_days <= 30 ? 'Standard' : 'Slow'}
            subColor={alt.lead_time_days <= 14 ? '#10B981' : alt.lead_time_days <= 30 ? '#F59E0B' : '#EF4444'}
          />
          <MetricCell
            icon={<TrendingUp size={14} color={premium <= 10 ? '#10B981' : premium <= 20 ? '#F59E0B' : '#EF4444'} />}
            label="Cost Premium"
            value={`+${fmt(premium, 0)}%`}
            sub={premium <= 10 ? 'Low' : premium <= 20 ? 'Moderate' : 'High'}
            subColor={premium <= 10 ? '#10B981' : premium <= 20 ? '#F59E0B' : '#EF4444'}
          />
          <MetricCell
            icon={<MapPin size={14} color="#A1A1AA" />}
            label="Region"
            value={alt.region}
            sub={alt.region === tier1.region ? 'Same region' : 'Different region'}
            subColor={alt.region !== tier1.region ? '#10B981' : '#F59E0B'}
          />
          <MetricCell
            icon={<ShieldCheck size={14} color={scoreColor(relPct)} />}
            label="Reliability"
            value={`${fmt(relPct, 0)}%`}
            sub={relPct >= 85 ? 'Above threshold' : 'Below threshold'}
            subColor={scoreColor(relPct)}
          />
        </div>
      </div>

      {/* vs Primary comparison */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid #27272A' }}>
        <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '12px' }}>
          vs {tier1.name.length > 22 ? tier1.name.slice(0, 22) + '…' : tier1.name}
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <CompareRow
            label="Lead Time"
            primary={`${tier1.lead_time_days ?? '—'} d`}
            alternate={`${alt.lead_time_days} d`}
            better={alt.lead_time_days < (tier1.lead_time_days ?? 999)}
          />
          <CompareRow
            label="Reliability"
            primary={`${((tier1.reliability_score ?? 0) * 100).toFixed(0)}%`}
            alternate={`${fmt(relPct, 0)}%`}
            better={alt.reliability_score >= (tier1.reliability_score ?? 0)}
          />
        </div>
      </div>

      {/* SKU Coverage */}
      {(alt.covers_sku || alt.sku_code) && (
        <div style={{ margin: '16px 20px', padding: '14px', background: '#064E3B', border: '1px solid #047857', borderRadius: '10px' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '10px' }}>
            <Network size={18} color="#34D399" style={{ flexShrink: 0, marginTop: '1px' }} />
            <div>
              <div style={{ fontSize: '0.6875rem', color: '#6EE7B7', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
                Indirect Provisioning
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#ECFDF5', fontWeight: 500, lineHeight: 1.5 }}>
                Tier 1 relies on this vendor for components used in:{' '}
                <span style={{ color: '#34D399', fontWeight: 700 }}>{alt.covers_sku ?? alt.sku_code}</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SKU code pill if separate */}
      {alt.sku_code && alt.sku_code !== alt.covers_sku && (
        <div style={{ padding: '0 20px 16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '10px 12px', background: '#1E293B', borderRadius: '8px', border: '1px solid #1E3A5F' }}>
            <Package size={14} color="#93C5FD" />
            <div>
              <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>SKU Code</div>
              <div style={{ fontSize: '0.8125rem', color: '#93C5FD', fontWeight: 600 }}>{alt.sku_code}</div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function MetricCell({ icon, label, value, sub, subColor }: {
  icon: React.ReactNode; label: string; value: string; sub: string; subColor: string
}) {
  return (
    <div style={{ background: '#27272A', borderRadius: '8px', padding: '10px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '6px' }}>
        {icon}
        <span style={{ fontSize: '0.6875rem', color: '#71717A', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</span>
      </div>
      <div style={{ fontSize: '1rem', fontWeight: 700, color: '#FAFAFA', marginBottom: '2px' }}>{value}</div>
      <div style={{ fontSize: '0.6875rem', color: subColor, fontWeight: 600 }}>{sub}</div>
    </div>
  )
}

function CompareRow({ label, primary, alternate, better }: {
  label: string; primary: string; alternate: string; better: boolean
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem' }}>
      <span style={{ color: '#71717A', minWidth: '70px' }}>{label}</span>
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#27272A', borderRadius: '6px', padding: '5px 8px', gap: '8px' }}>
        <span style={{ color: '#A1A1AA' }}>{primary}</span>
        <span style={{ color: '#52525B', fontSize: '0.625rem' }}>→</span>
        <span style={{ color: better ? '#10B981' : '#F59E0B', fontWeight: 700 }}>{alternate}</span>
      </div>
    </div>
  )
}

/* ── Dependency Graph Visualization ───────────────────────────────────── */
function DependencyGraph({
  tier1, onSelectAlt, selectedAltId,
}: {
  tier1: Supplier
  onSelectAlt: (alt: AlternateSupplierRecord) => void
  selectedAltId?: string
}) {
  const { data, isLoading } = useQuery({
    queryKey: ['alternates', tier1.id],
    queryFn: () => api.getAlternateSuppliersDirect(tier1.id),
    staleTime: 300_000,
  })

  const alts: AlternateSupplierRecord[] = useMemo(() => {
    const seen = new Set<string>()
    const out: AlternateSupplierRecord[] = []
    for (const a of (data?.alternates ?? [])) {
      if (!seen.has(a.alternate_id)) { seen.add(a.alternate_id); out.push(a) }
    }
    return out
  }, [data])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#A1A1AA', gap: '10px' }}>
        <div style={{ width: '20px', height: '20px', border: '2px solid #3F3F46', borderTopColor: '#3B82F6', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
        Analyzing network graph...
      </div>
    )
  }

  const nodeWidth = 260
  const nodeHeight = 88
  const verticalSpacing = 124
  const startX = 60
  const targetX = 440

  const nodesCount = Math.max(1, alts.length)
  const totalHeight = nodesCount * verticalSpacing
  const containerHeight = Math.max(600, totalHeight + 100)
  const rootY = containerHeight / 2 - nodeHeight / 2

  return (
    <div style={{ position: 'relative', width: '100%', height: `${containerHeight}px`, overflow: 'hidden' }}>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>

      {/* Grid background */}
      <div style={{
        position: 'absolute', inset: 0,
        backgroundImage: 'radial-gradient(#3F3F46 1px, transparent 0)',
        backgroundSize: '24px 24px', opacity: 0.25
      }} />

      {/* SVG connectors */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {alts.map((alt, i) => {
          const leafY = (i * verticalSpacing) + (containerHeight - totalHeight) / 2
          const isSelected = selectedAltId === alt.alternate_id
          const isHealthy = alt.reliability_score >= 0.85
          const strokeColor = isSelected ? '#3B82F6' : isHealthy ? '#34D399' : '#F59E0B'

          const startPt = `${startX + nodeWidth},${rootY + nodeHeight / 2}`
          const endPt = `${targetX},${leafY + nodeHeight / 2}`
          const ctrl1 = `${startX + nodeWidth + 90},${rootY + nodeHeight / 2}`
          const ctrl2 = `${targetX - 90},${leafY + nodeHeight / 2}`

          return (
            <g key={`path-${alt.alternate_id}`}>
              <path
                d={`M ${startPt} C ${ctrl1} ${ctrl2} ${endPt}`}
                fill="none" stroke={strokeColor}
                strokeWidth={isSelected ? 2.5 : 1.5}
                strokeDasharray={isSelected ? 'none' : '5 4'}
                opacity={isSelected ? 1 : 0.45}
                style={{ transition: 'all 0.3s ease' }}
              />
              <circle cx={targetX} cy={leafY + nodeHeight / 2} r={isSelected ? 5 : 3.5} fill={strokeColor} opacity={isSelected ? 1 : 0.6} />
            </g>
          )
        })}
        {alts.length > 0 && <circle cx={startX + nodeWidth} cy={rootY + nodeHeight / 2} r="5" fill="#3B82F6" />}
      </svg>

      {/* Tier 1 Root Node */}
      <div style={{
        position: 'absolute', left: startX, top: rootY,
        width: nodeWidth, height: nodeHeight,
        background: 'rgba(30,58,138,0.3)', backdropFilter: 'blur(12px)',
        border: '1px solid #2563EB', borderRadius: '12px',
        padding: '14px 16px', boxShadow: '0 0 20px rgba(59,130,246,0.15)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center', zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Building2 size={16} color="#93C5FD" />
          <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#FAFAFA' }}>{tier1.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#1E3A8A', color: '#93C5FD', padding: '2px 7px', borderRadius: '4px', letterSpacing: '0.06em' }}>TIER 1 PRIMARY</span>
          <span style={{ fontSize: '0.6875rem', color: '#71717A', display: 'flex', alignItems: 'center', gap: '3px' }}>
            <MapPin size={11} /> {tier1.city}
          </span>
        </div>
      </div>

      {/* Tier 2 Leaf Nodes */}
      {alts.map((alt, i) => {
        const leafY = (i * verticalSpacing) + (containerHeight - totalHeight) / 2
        const isSelected = selectedAltId === alt.alternate_id
        const isHealthy = alt.reliability_score >= 0.85
        const premium = alt.cost_premium_pct  // already in percentage points

        return (
          <button
            key={alt.alternate_id}
            onClick={() => onSelectAlt(alt)}
            style={{
              position: 'absolute', left: targetX, top: leafY,
              width: nodeWidth, height: nodeHeight,
              background: isSelected ? 'rgba(30,58,138,0.5)' : 'rgba(24, 24, 27, 0.85)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${isSelected ? '#3B82F6' : isHealthy ? '#166534' : '#78350F'}`,
              borderRadius: '12px', padding: '12px 14px',
              cursor: 'pointer', textAlign: 'left',
              transition: 'all 0.2s ease',
              zIndex: isSelected ? 20 : 10,
              boxShadow: isSelected ? '0 0 20px rgba(59,130,246,0.25)' : '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = '#52525B' }}
            onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = isHealthy ? '#166534' : '#78350F' }}
          >
            {/* Row 1: name + health dot */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#FAFAFA', lineHeight: 1.3, paddingRight: '8px' }}>{alt.supplier_name}</div>
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isHealthy ? '#10B981' : '#F59E0B', boxShadow: `0 0 6px ${isHealthy ? '#10B981' : '#F59E0B'}`, flexShrink: 0, marginTop: '2px' }} />
            </div>
            {/* Row 2: location */}
            <div style={{ fontSize: '0.6875rem', color: '#71717A', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '3px' }}>
              <MapPin size={10} /> {alt.city}, {alt.region}
            </div>
            {/* Row 3: mini metrics */}
            <div style={{ display: 'flex', gap: '6px' }}>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: '#3F3F46', color: '#A1A1AA', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <Clock size={9} /> {alt.lead_time_days}d
              </span>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: premium <= 10 ? '#064E3B' : '#451A03', color: premium <= 10 ? '#34D399' : '#FCD34D' }}>
                +{fmt(premium, 0)}%
              </span>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: isHealthy ? '#064E3B' : '#451A03', color: isHealthy ? '#34D399' : '#FCD34D', display: 'flex', alignItems: 'center', gap: '3px' }}>
                <ShieldCheck size={9} /> {(alt.reliability_score * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        )
      })}

      {alts.length === 0 && (
        <div style={{ position: 'absolute', left: targetX, top: rootY, width: 280, color: '#52525B', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px', padding: '16px', background: '#18181B', border: '1px dashed #3F3F46', borderRadius: '12px' }}>
          <Network size={16} color="#3F3F46" /> No mapped Tier 2 dependencies found.
        </div>
      )}
    </div>
  )
}

/* ── Supplier Sidebar ─────────────────────────────────────────────────── */
function SupplierSidebar({
  suppliers, activeTier1Id, onSelect,
}: {
  suppliers: Supplier[]
  activeTier1Id: string | null
  onSelect: (id: string) => void
}) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return suppliers
    return suppliers.filter(s =>
      s.name.toLowerCase().includes(q) ||
      s.city?.toLowerCase().includes(q) ||
      s.category?.toLowerCase().includes(q)
    )
  }, [suppliers, query])

  return (
    <div style={{
      width: '240px', flexShrink: 0, background: '#111113',
      borderRight: '1px solid #27272A', display: 'flex', flexDirection: 'column', height: '100%'
    }}>
      {/* Search */}
      <div style={{ padding: '12px', borderBottom: '1px solid #1F1F22' }}>
        <div style={{ position: 'relative' }}>
          <Search size={13} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#52525B', pointerEvents: 'none' }} />
          <input
            type="text"
            placeholder="Search suppliers…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#1C1C1F', border: '1px solid #27272A', borderRadius: '8px',
              padding: '7px 10px 7px 30px', fontSize: '0.75rem', color: '#FAFAFA',
              outline: 'none', caretColor: '#3B82F6'
            }}
            onFocus={e => e.target.style.borderColor = '#3B82F6'}
            onBlur={e => e.target.style.borderColor = '#27272A'}
          />
        </div>
      </div>

      {/* Count label */}
      <div style={{ padding: '8px 12px 4px', fontSize: '0.625rem', color: '#52525B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {filtered.length} Supplier{filtered.length !== 1 ? 's' : ''}
      </div>

      {/* List */}
      <div style={{ flex: 1, overflowY: 'auto', scrollbarWidth: 'thin', scrollbarColor: '#27272A transparent' }}>
        {filtered.map(s => {
          const isActive = s.id === activeTier1Id
          return (
            <button
              key={s.id}
              onClick={() => onSelect(s.id)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '9px 12px', border: 'none', background: isActive ? '#1E3A8A' : 'transparent',
                cursor: 'pointer', textAlign: 'left', transition: 'background 0.15s ease',
                borderLeft: isActive ? '3px solid #3B82F6' : '3px solid transparent'
              }}
              onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = '#1C1C1F' }}
              onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: isActive ? 700 : 500, color: isActive ? '#FAFAFA' : '#D4D4D8', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {s.name}
                </div>
                <div style={{ fontSize: '0.6875rem', color: '#52525B', marginTop: '2px', display: 'flex', gap: '4px' }}>
                  <span>{s.city}</span>
                  {s.category && <><span>·</span><span>{s.category}</span></>}
                </div>
              </div>
              {isActive && <ChevronRight size={13} color="#3B82F6" style={{ flexShrink: 0, marginLeft: '4px' }} />}
            </button>
          )
        })}

        {filtered.length === 0 && (
          <div style={{ padding: '20px 12px', textAlign: 'center', color: '#52525B', fontSize: '0.75rem' }}>
            No suppliers match "{query}"
          </div>
        )}
      </div>
    </div>
  )
}

/* ── Main Page ─────────────────────────────────────────────────────────── */
export default function AlternateSuppliersPage() {
  const { data: supplierData } = useSuppliers()
  // Only Tier-1 primaries have a sub-tier alternate network to analyse; Tier-2
  // suppliers ARE the alternates, so they don't belong in the primary selector.
  const tier1Suppliers = (supplierData?.suppliers ?? []).filter(s => s.tier === 1)

  const [activeTier1Id, setActiveTier1Id] = useState<string | null>(null)
  const [selectedTier2, setSelectedTier2] = useState<AlternateSupplierRecord | null>(null)

  useEffect(() => {
    if (!activeTier1Id && tier1Suppliers.length > 0) {
      setActiveTier1Id(tier1Suppliers[0].id)
    }
  }, [tier1Suppliers.length, activeTier1Id])

  const activeTier1 = tier1Suppliers.find(s => s.id === activeTier1Id)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: '#09090B', borderRadius: '16px', overflow: 'hidden' }}>

      {/* Page Header */}
      <div style={{ background: '#18181B', borderBottom: '1px solid #27272A', padding: '16px 24px' }}>
        <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#FAFAFA', margin: '0 0 3px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Zap size={18} color="#3B82F6" /> Real-Time Dependency Map
        </h1>
        <p style={{ fontSize: '0.75rem', color: '#71717A', margin: 0 }}>
          Select a primary vendor to analyze its sub-tier network and blast radius.
        </p>
      </div>

      {/* Body: sidebar + graph canvas */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        <SupplierSidebar
          suppliers={tier1Suppliers}
          activeTier1Id={activeTier1Id}
          onSelect={id => { setActiveTier1Id(id); setSelectedTier2(null) }}
        />

        {/* Graph canvas */}
        <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
          {activeTier1 ? (
            <DependencyGraph
              tier1={activeTier1}
              selectedAltId={selectedTier2?.alternate_id}
              onSelectAlt={setSelectedTier2}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#71717A', fontSize: '0.875rem' }}>
              Loading primary vendors...
            </div>
          )}

          {selectedTier2 && activeTier1 && (
            <Tier2DetailPanel
              alt={selectedTier2}
              tier1={activeTier1}
              onClose={() => setSelectedTier2(null)}
            />
          )}
        </div>
      </div>
    </div>
  )
}
