import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDisruptions } from '../hooks/useQueries'
import {
  Wind, Package, Truck, Activity, ClipboardList, Search,
  ChevronDown, ChevronUp, BellOff, CheckCircle2,
} from 'lucide-react'
import type { Disruption } from '../types'

/* ── read state ──────────────────────────────────────────────────────────── */
export const DISRUPTIONS_STORAGE_KEY = 'ss_read_disruptions'

export function getReadIds(): Set<string> {
  try {
    const s = localStorage.getItem(DISRUPTIONS_STORAGE_KEY)
    return s ? new Set(JSON.parse(s)) : new Set()
  } catch { return new Set() }
}

export function persistReadIds(ids: Set<string>) {
  localStorage.setItem(DISRUPTIONS_STORAGE_KEY, JSON.stringify([...ids]))
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export const SEVERITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
}

export const TYPE_ICON: Record<string, React.ReactNode> = {
  cyclone:    <Wind size={15} />,
  strike:     <Truck size={15} />,
  logistics:  <Package size={15} />,
  inventory:  <Activity size={15} />,
  quality:    <Search size={15} />,
  regulatory: <ClipboardList size={15} />,
}

export function formatDisruptionDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Inbox row ────────────────────────────────────────────────────────────── */
function InboxRow({ d, isRead, onClick }: { d: Disruption; isRead: boolean; onClick: () => void }) {
  const color = SEVERITY_COLOR[d.severity] ?? '#2563EB'
  const icon = TYPE_ICON[d.disruption_type] ?? <Wind size={15} />

  return (
    <div
      onClick={onClick}
      style={{
        display: 'grid',
        gridTemplateColumns: '4px 36px 1fr auto',
        alignItems: 'center',
        gap: '0.75rem',
        padding: '0.75rem 1rem 0.75rem 0',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        background: isRead ? '#fff' : '#FAFAFA',
        transition: 'background 100ms ease',
      }}
      onMouseEnter={e => { e.currentTarget.style.background = '#F5F5F5' }}
      onMouseLeave={e => { e.currentTarget.style.background = isRead ? '#fff' : '#FAFAFA' }}
    >
      {/* Severity strip */}
      <div style={{ width: 4, height: 40, borderRadius: 2, background: isRead ? 'var(--border)' : color }} />

      {/* Icon */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: isRead ? 'var(--bg-hover)' : `${color}15`,
        border: `1px solid ${isRead ? 'var(--border)' : `${color}40`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isRead ? 'var(--ink-4)' : color,
        flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Content */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.2rem' }}>
          {!isRead && d.is_active && (
            <div style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: '0.875rem',
            fontWeight: isRead ? 400 : 700,
            color: isRead ? 'var(--ink-2)' : '#000',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.title}
          </span>
          {!d.is_active && (
            <span style={{
              fontSize: '0.45rem', fontWeight: 700, padding: '1px 5px', borderRadius: 3,
              background: '#F0FDF4', color: '#16a34a', border: '1px solid #BBF7D0',
              letterSpacing: '0.05em', flexShrink: 0,
            }}>RESOLVED</span>
          )}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.6875rem', color: 'var(--ink-4)' }}>
          <span style={{ textTransform: 'capitalize' }}>{d.disruption_type}</span>
          {d.region && <><span>·</span><span>{d.region}</span></>}
          {d.description && (
            <><span>·</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '400px' }}>
              {d.description}
            </span></>
          )}
        </div>
      </div>

      {/* Right: impact + date */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: isRead ? 400 : 700, color: isRead ? 'var(--ink-3)' : color, fontFamily: 'monospace' }}>
          {(d.impact_score * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '1px' }}>
          {formatDisruptionDate(d.created_at)}
        </div>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function DisruptionsPage() {
  const navigate = useNavigate()
  const { data, isLoading } = useDisruptions()
  const [readIds, setReadIds] = useState<Set<string>>(getReadIds)
  const [showResolved, setShowResolved] = useState(false)

  useEffect(() => { persistReadIds(readIds) }, [readIds])

  const markRead = useCallback((id: string) => {
    setReadIds(prev => { const next = new Set(prev); next.add(id); return next })
  }, [])

  const allDisruptions = data?.disruptions ?? []
  const significant = allDisruptions.filter(d => d.severity !== 'low')

  const active = useMemo(() => [...significant.filter(d => d.is_active)].sort((a, b) => {
    const aUnread = readIds.has(a.id) ? 1 : 0
    const bUnread = readIds.has(b.id) ? 1 : 0
    if (aUnread !== bUnread) return aUnread - bUnread
    return (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9)
  }), [significant, readIds])

  const resolved = useMemo(() => [...significant.filter(d => !d.is_active)].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  ), [significant])

  const unreadCount = active.filter(d => !readIds.has(d.id)).length

  function markAllRead() {
    const next = new Set(readIds)
    active.forEach(d => next.add(d.id))
    setReadIds(next)
    persistReadIds(next)
  }

  function openDisruption(d: Disruption) {
    markRead(d.id)
    navigate(`/disruptions/${d.id}`)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1 }}>
            Disruption Alerts
          </h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>
            {unreadCount > 0 ? `${unreadCount} unread · click to read` : 'All caught up'}
          </p>
        </div>
        {unreadCount > 0 && (
          <button
            onClick={markAllRead}
            style={{
              display: 'flex', alignItems: 'center', gap: '0.375rem',
              padding: '0.4rem 0.875rem', background: '#fff',
              border: '1px solid var(--border)', borderRadius: 6,
              fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-3)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <BellOff size={13} /> Mark all read
          </button>
        )}
      </div>

      {/* Active disruptions */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', overflow: 'hidden' }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '0.625rem 1rem',
          borderBottom: '2px solid #000',
        }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Active
          </span>
          {unreadCount > 0 && (
            <span style={{ fontSize: '0.625rem', fontWeight: 700, background: '#DC2626', color: '#fff', padding: '1px 7px', borderRadius: 99 }}>
              {unreadCount} new
            </span>
          )}
        </div>

        {isLoading ? (
          <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 6 }} />)}
          </div>
        ) : active.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center' }}>
            <CheckCircle2 size={24} color="#16a34a" style={{ margin: '0 auto 0.5rem' }} />
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#166534' }}>No active disruptions</div>
          </div>
        ) : (
          <div>
            {active.map(d => (
              <InboxRow key={d.id} d={d} isRead={readIds.has(d.id)} onClick={() => openDisruption(d)} />
            ))}
          </div>
        )}
      </div>

      {/* Resolved section */}
      {resolved.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', overflow: 'hidden' }}>
          <button
            onClick={() => setShowResolved(o => !o)}
            style={{
              width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '0.625rem 1rem', background: 'none', border: 'none',
              borderBottom: showResolved ? '1px solid var(--border)' : 'none',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Resolved
              </span>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, background: 'var(--bg-hover)', color: 'var(--ink-4)', padding: '1px 6px', borderRadius: 99, border: '1px solid var(--border)' }}>
                {resolved.length}
              </span>
            </div>
            {showResolved ? <ChevronUp size={14} color="var(--ink-4)" /> : <ChevronDown size={14} color="var(--ink-4)" />}
          </button>
          {showResolved && (
            <div>
              {resolved.map(d => (
                <InboxRow key={d.id} d={d} isRead={readIds.has(d.id)} onClick={() => openDisruption(d)} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
