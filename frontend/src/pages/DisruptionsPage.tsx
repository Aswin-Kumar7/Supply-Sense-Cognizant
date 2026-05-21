/**
 * DisruptionsPage
 * Shows all supply-chain disruptions sorted by active-first, then severity.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDisruptions } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { Wind, Package, Truck, Activity, ClipboardList, Search, ChevronRight } from 'lucide-react'
import type { Disruption } from '../types'

/* ── helpers ──────────────────────────────────────────────────────────── */
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

const TYPE_ICON: Record<string, React.ReactNode> = {
  cyclone:    <Wind size={16} />,
  strike:     <Truck size={16} />,
  logistics:  <Package size={16} />,
  inventory:  <Activity size={16} />,
  quality:    <Search size={16} />,
  regulatory: <ClipboardList size={16} />,
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Skeleton({ h = 80 }: { h?: number }) {
  return <div className="skeleton" style={{ height: h, borderRadius: 8, width: '100%' }} />
}

/* ── Disruption card ──────────────────────────────────────────────────── */
function DisruptionCard({ d, onClick }: { d: Disruption; onClick: () => void }) {
  const icon = TYPE_ICON[d.disruption_type] ?? <Wind size={16} />

  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff',
        border: `1px solid ${d.is_active ? '#000' : 'var(--border)'}`,
        borderLeft: `3px solid ${d.is_active
          ? (d.severity === 'critical' ? '#DC2626' : d.severity === 'high' ? '#D29729' : '#2563EB')
          : 'var(--border)'}`,
        borderRadius: '0.625rem',
        padding: '1rem 1.25rem',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'flex-start',
        gap: '1rem',
        boxShadow: d.is_active ? 'var(--shadow-sm)' : 'none',
        opacity: d.is_active ? 1 : 0.65,
        transition: 'opacity 150ms',
      }}
    >
      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: '8px',
        background: 'var(--bg-hover)', border: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        flexShrink: 0, color: 'var(--ink-3)',
      }}>
        {icon}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>{d.title}</span>
          {d.is_active && (
            <span style={{
              fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
              background: '#DC2626', color: '#fff', letterSpacing: '0.05em',
            }}>ACTIVE</span>
          )}
          <Badge level={d.severity} />
        </div>
        {d.description && (
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', margin: 0, lineHeight: 1.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '600px' }}>
            {d.description}
          </p>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '0.5rem', fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 500 }}>
          <span style={{ textTransform: 'uppercase', letterSpacing: '0.05em' }}>{d.disruption_type}</span>
          {d.region && <><span>·</span><span>{d.region}</span></>}
          {d.affected_skus_count > 0 && <><span>·</span><span>{d.affected_skus_count} SKU{d.affected_skus_count !== 1 ? 's' : ''} affected</span></>}
          <span>·</span>
          <span>{formatDate(d.created_at)}</span>
        </div>
      </div>

      {/* Impact + nav */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexShrink: 0 }}>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Impact</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000', fontFamily: 'monospace' }}>
            {(d.impact_score * 100).toFixed(0)}%
          </div>
        </div>
        {d.supplier_id && <ChevronRight size={16} color="var(--ink-4)" />}
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function DisruptionsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useDisruptions()
  const [filter, setFilter] = useState<'all' | 'active' | 'resolved'>('all')

  const allDisruptions = data?.disruptions ?? []

  // Sort: active first, then by severity, then by created_at desc
  const sorted = [...allDisruptions].sort((a, b) => {
    if (a.is_active !== b.is_active) return a.is_active ? -1 : 1
    const sevDiff = (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
    if (sevDiff !== 0) return sevDiff
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  })

  const filtered = sorted.filter(d => {
    if (filter === 'active') return d.is_active
    if (filter === 'resolved') return !d.is_active
    return true
  })

  const activeCount = allDisruptions.filter(d => d.is_active).length

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Active Disruptions
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>
            Live supply-chain events across all suppliers
          </p>
        </div>
        <div style={{ display: 'flex', gap: '1.5rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Active</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#DC2626', lineHeight: 1 }}>{activeCount}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>Total</div>
            <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', lineHeight: 1 }}>{allDisruptions.length}</div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.375rem' }}>
        {(['all', 'active', 'resolved'] as const).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.375rem 0.875rem',
              background: filter === f ? '#000' : '#fff',
              color: filter === f ? '#fff' : '#000',
              border: `1px solid ${filter === f ? '#000' : 'var(--border)'}`,
              borderRadius: '999px',
              fontSize: '0.75rem', fontWeight: 600,
              cursor: 'pointer', textTransform: 'capitalize',
              transition: 'all 150ms ease',
            }}
          >
            {f === 'all' ? `All (${allDisruptions.length})` : f === 'active' ? `Active (${activeCount})` : `Resolved (${allDisruptions.length - activeCount})`}
          </button>
        ))}
      </div>

      {/* List */}
      {isLoading ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {[1, 2, 3, 4].map(i => <Skeleton key={i} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem', background: '#fff', borderRadius: '0.75rem', border: '1px solid var(--border)' }}>
          No {filter !== 'all' ? filter : ''} disruptions recorded.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {filtered.map(d => (
            <DisruptionCard
              key={d.id}
              d={d}
              onClick={() => d.supplier_id ? navigate(`/risks/${d.supplier_id}`) : undefined}
            />
          ))}
        </div>
      )}
    </div>
  )
}
