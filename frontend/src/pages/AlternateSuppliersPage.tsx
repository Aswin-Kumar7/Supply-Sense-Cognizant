import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { useSuppliers } from '../hooks/useQueries'
import {
  Building2, MapPin, Network, Box, ShieldCheck, X, Zap
} from 'lucide-react'
import type { AlternateSupplierRecord, Supplier } from '../types'

/* ── Helpers ──────────────────────────────────────────────────────────── */
function fmt(n: number, dp = 1) { return n.toFixed(dp) }

/* ── Tier 2 Detail Panel (Slide Over) ─────────────────────────────────── */
function Tier2DetailPanel({
  alt, onClose,
}: {
  alt: AlternateSupplierRecord
  onClose: () => void
}) {
  const relPct = alt.reliability_score * 100
  const qualPct = alt.quality_score * 100

  return (
    <div style={{
      position: 'absolute',
      right: 0,
      top: 0,
      bottom: 0,
      width: '380px',
      background: '#18181B',
      borderLeft: '1px solid #27272A',
      boxShadow: '-8px 0 32px rgba(0,0,0,0.5)',
      padding: '32px',
      display: 'flex',
      flexDirection: 'column',
      gap: '24px',
      zIndex: 50,
      overflowY: 'auto'
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FAFAFA', margin: 0 }}>
              {alt.supplier_name}
            </h2>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: '#A1A1AA' }}>
            <MapPin size={14} /> {alt.city}, {alt.region}
          </div>
        </div>
        <button onClick={onClose} style={{ background: '#27272A', border: 'none', borderRadius: '50%', padding: '6px', cursor: 'pointer', color: '#A1A1AA', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <X size={16} />
        </button>
      </div>

      <div style={{ padding: '16px', background: '#27272A', borderRadius: '12px', border: '1px solid #3F3F46' }}>
        <div style={{ fontSize: '0.6875rem', color: '#A1A1AA', textTransform: 'uppercase', fontWeight: 700, marginBottom: '4px' }}>Category</div>
        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#FAFAFA', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Box size={16} color="#A1A1AA" /> {alt.category}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#A1A1AA' }}>Fulfillment Reliability</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#FAFAFA' }}>{fmt(relPct, 0)}%</span>
          </div>
          <div style={{ height: '6px', background: '#3F3F46', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${relPct}%`, height: '100%', background: relPct >= 85 ? '#10B981' : '#F59E0B', borderRadius: '3px' }} />
          </div>
        </div>

        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#A1A1AA' }}>Quality Compliance Score</span>
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#FAFAFA' }}>{fmt(qualPct, 0)}%</span>
          </div>
          <div style={{ height: '6px', background: '#3F3F46', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{ width: `${qualPct}%`, height: '100%', background: '#3B82F6', borderRadius: '3px' }} />
          </div>
        </div>
      </div>

      {(alt.covers_sku || alt.sku_code) && (
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '12px', padding: '16px', background: '#064E3B', border: '1px solid #047857', borderRadius: '12px', marginTop: 'auto' }}>
          <Network size={20} color="#34D399" style={{ flexShrink: 0, marginTop: '2px' }} />
          <div>
            <div style={{ fontSize: '0.75rem', color: '#6EE7B7', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>Indirect Provisioning</div>
            <div style={{ fontSize: '0.875rem', color: '#FAFAFA', fontWeight: 600, lineHeight: 1.4 }}>
              Tier 1 relies on this vendor for components used in: <span style={{ color: '#34D399' }}>{alt.covers_sku ?? alt.sku_code}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Dependency Graph Visualization ───────────────────────────────────── */
function DependencyGraph({
  tier1,
  onSelectAlt,
  selectedAltId,
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

  const alts: AlternateSupplierRecord[] = []
  const seen = new Set<string>()
  for (const a of (data?.alternates ?? [])) {
    if (!seen.has(a.alternate_id)) { seen.add(a.alternate_id); alts.push(a) }
  }

  if (isLoading) {
    return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#A1A1AA' }}>Analyzing network graph...</div>
  }

  const nodeWidth = 280
  const nodeHeight = 90
  const verticalSpacing = 130
  const startX = 80
  const targetX = 500

  // Calculate canvas dimensions
  const nodesCount = Math.max(1, alts.length)
  const totalHeight = nodesCount * verticalSpacing
  const containerHeight = Math.max(600, totalHeight + 100)
  
  const rootY = containerHeight / 2 - nodeHeight / 2

  return (
    <div style={{ position: 'relative', width: '100%', height: `${containerHeight}px`, overflow: 'hidden' }}>
      
      {/* Background Grid Pattern */}
      <div style={{ 
        position: 'absolute', inset: 0, 
        backgroundImage: 'radial-gradient(#3F3F46 1px, transparent 0)', 
        backgroundSize: '24px 24px', 
        opacity: 0.3 
      }} />

      {/* SVG Connectors */}
      <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}>
        {alts.map((alt, i) => {
          const leafY = (i * verticalSpacing) + (containerHeight - totalHeight)/2
          const isSelected = selectedAltId === alt.alternate_id
          const isHealthy = alt.reliability_score >= 0.85
          
          const strokeColor = isSelected ? '#3B82F6' : isHealthy ? '#34D399' : '#F59E0B'
          
          // Bezier curve from right edge of Root to left edge of Leaf
          const startPt = `${startX + nodeWidth},${rootY + nodeHeight / 2}`
          const endPt = `${targetX},${leafY + nodeHeight / 2}`
          const ctrl1 = `${startX + nodeWidth + 100},${rootY + nodeHeight / 2}`
          const ctrl2 = `${targetX - 100},${leafY + nodeHeight / 2}`
          const pathD = `M ${startPt} C ${ctrl1} ${ctrl2} ${endPt}`

          return (
            <g key={`path-${alt.alternate_id}`}>
              <path
                d={pathD}
                fill="none"
                stroke={strokeColor}
                strokeWidth={isSelected ? 3 : 2}
                strokeDasharray={isSelected ? 'none' : '4 4'}
                opacity={isSelected ? 1 : 0.4}
                style={{ transition: 'all 0.3s ease' }}
              />
              <circle cx={targetX} cy={leafY + nodeHeight / 2} r="4" fill={strokeColor} />
            </g>
          )
        })}
        {/* Connection point on Root */}
        {alts.length > 0 && <circle cx={startX + nodeWidth} cy={rootY + nodeHeight / 2} r="5" fill="#3B82F6" />}
      </svg>

      {/* DOM Nodes */}
      
      {/* Tier 1 Root Node */}
      <div style={{
        position: 'absolute',
        left: startX,
        top: rootY,
        width: nodeWidth,
        height: nodeHeight,
        background: 'rgba(24, 24, 27, 0.8)',
        backdropFilter: 'blur(12px)',
        border: '1px solid #3F3F46',
        borderRadius: '12px',
        padding: '16px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <Building2 size={18} color="#FAFAFA" />
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#FAFAFA' }}>{tier1.name}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, background: '#3F3F46', color: '#FAFAFA', padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.05em' }}>TIER 1 PRIMARY</span>
          <span style={{ fontSize: '0.75rem', color: '#A1A1AA', display: 'flex', alignItems: 'center', gap: '4px' }}><MapPin size={12} /> {tier1.city}</span>
        </div>
      </div>

      {/* Tier 2 Leaf Nodes */}
      {alts.map((alt, i) => {
        const leafY = (i * verticalSpacing) + (containerHeight - totalHeight)/2
        const isSelected = selectedAltId === alt.alternate_id
        const isHealthy = alt.reliability_score >= 0.85

        return (
          <button
            key={alt.alternate_id}
            onClick={() => onSelectAlt(alt)}
            style={{
              position: 'absolute',
              left: targetX,
              top: leafY,
              width: nodeWidth,
              height: nodeHeight,
              background: isSelected ? '#1E3A8A' : 'rgba(24, 24, 27, 0.8)',
              backdropFilter: 'blur(12px)',
              border: `1px solid ${isSelected ? '#3B82F6' : isHealthy ? '#064E3B' : '#78350F'}`,
              borderRadius: '12px',
              padding: '16px',
              cursor: 'pointer',
              textAlign: 'left',
              transition: 'all 0.2s ease',
              zIndex: isSelected ? 20 : 10,
              boxShadow: isSelected ? '0 0 20px rgba(59,130,246,0.3)' : '0 4px 12px rgba(0,0,0,0.2)'
            }}
            onMouseEnter={e => { if(!isSelected) e.currentTarget.style.borderColor = '#3F3F46' }}
            onMouseLeave={e => { if(!isSelected) e.currentTarget.style.borderColor = isHealthy ? '#064E3B' : '#78350F' }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
              <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#FAFAFA' }}>{alt.supplier_name}</div>
              {/* Status Dot */}
              <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: isHealthy ? '#10B981' : '#F59E0B', boxShadow: `0 0 8px ${isHealthy ? '#10B981' : '#F59E0B'}` }} />
            </div>
            
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '12px' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#A1A1AA', textTransform: 'uppercase', letterSpacing: '0.05em' }}>TIER 2</span>
              <span style={{ fontSize: '0.75rem', color: '#D4D4D8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <ShieldCheck size={12} color={isHealthy ? '#10B981' : '#F59E0B'} />
                Rel: {(alt.reliability_score * 100).toFixed(0)}%
              </span>
            </div>
          </button>
        )
      })}
      
      {alts.length === 0 && (
        <div style={{ position: 'absolute', left: targetX, top: rootY, width: 300, color: '#A1A1AA', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Network size={16} /> No mapped Tier 2 dependencies found.
        </div>
      )}
    </div>
  )
}

/* ── Main Page Layout ─────────────────────────────────────────────────── */
export default function AlternateSuppliersPage() {
  const { data: supplierData } = useSuppliers()
  const tier1Suppliers = (supplierData?.suppliers ?? [])

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
      
      {/* Top Navigation Bar */}
      <div style={{ background: '#18181B', borderBottom: '1px solid #27272A', padding: '20px 24px', display: 'flex', alignItems: 'center', gap: '24px' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#FAFAFA', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Zap size={20} color="#3B82F6" /> Real-Time Dependency Map
          </h1>
          <p style={{ fontSize: '0.8125rem', color: '#A1A1AA', margin: 0 }}>Select a primary vendor to analyze its sub-tier network blast radius.</p>
        </div>

        <div style={{ width: '1px', height: '40px', background: '#27272A' }} />

        <div style={{ display: 'flex', gap: '8px', overflowX: 'auto', paddingBottom: '4px', flex: 1, scrollbarWidth: 'none' }}>
          {tier1Suppliers.map(s => {
            const isActive = s.id === activeTier1Id
            return (
              <button
                key={s.id}
                onClick={() => { setActiveTier1Id(s.id); setSelectedTier2(null) }}
                style={{
                  padding: '8px 16px',
                  background: isActive ? '#FAFAFA' : '#27272A',
                  color: isActive ? '#09090B' : '#FAFAFA',
                  border: 'none',
                  borderRadius: '20px',
                  fontSize: '0.8125rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.2s ease',
                  flexShrink: 0
                }}
              >
                {s.name}
              </button>
            )
          })}
        </div>
      </div>

      {/* Main Graph Canvas */}
      <div style={{ flex: 1, position: 'relative', overflowY: 'auto' }}>
        {activeTier1 ? (
          <DependencyGraph
            tier1={activeTier1}
            selectedAltId={selectedTier2?.alternate_id}
            onSelectAlt={setSelectedTier2}
          />
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: '#A1A1AA' }}>
            Loading primary vendors...
          </div>
        )}

        {selectedTier2 && (
          <Tier2DetailPanel
            alt={selectedTier2}
            onClose={() => setSelectedTier2(null)}
          />
        )}
      </div>
    </div>
  )
}
