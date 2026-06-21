import { useState, useCallback, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useDisruptions } from '../hooks/useQueries'
import {
  Wind, Truck,
  ChevronDown, ChevronUp, BellOff, CheckCircle2,
  CloudLightning, Construction, Boxes, ShieldAlert, Scale,
  TrendingUp,
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
  window.dispatchEvent(new Event('ss_read_disruptions_changed'))
}

/* ── helpers ─────────────────────────────────────────────────────────────── */
const SEVERITY_ORDER: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }

export const SEVERITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
}

export const TYPE_ICON: Record<string, React.ReactNode> = {
  cyclone:       <CloudLightning size={16} strokeWidth={1.5} />,
  strike:        <Construction size={16} strokeWidth={1.5} />,
  logistics:     <Truck size={16} strokeWidth={1.5} />,
  inventory:     <Boxes size={16} strokeWidth={1.5} />,
  quality:       <ShieldAlert size={16} strokeWidth={1.5} />,
  regulatory:    <Scale size={16} strokeWidth={1.5} />,
  raw_material:  <Boxes size={16} strokeWidth={1.5} />,
  demand_spike:  <TrendingUp size={16} strokeWidth={1.5} />,
}

export function formatDisruptionDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
}

/* ── Inbox Row ────────────────────────────────────────────────────────────── */
function InboxRow({ d, isRead, onClick }: { d: Disruption; isRead: boolean; onClick: () => void }) {
  const color = SEVERITY_COLOR[d.severity] ?? '#2563EB'
  const typeKey = (d.disruption_type || '').toLowerCase().replace(/_/g, '_')
  const icon = TYPE_ICON[typeKey] ?? <Wind size={16} strokeWidth={1.5} />

  return (
    <div
      onClick={onClick}
      className="inbox-row"
      style={{
        display: 'grid',
        gridTemplateColumns: '48px 1fr 140px 80px 100px',
        alignItems: 'center',
        gap: '16px',
        padding: '16px 20px',
        borderBottom: '1px solid #F1F5F9',
        cursor: 'pointer',
        background: isRead ? '#FFFFFF' : '#FAFAFA',
      }}
    >
      {/* Icon block */}
      <div style={{
        width: 36, height: 36, borderRadius: 8,
        background: isRead ? '#F8FAFC' : `${color}0A`,
        border: `1px solid ${isRead ? '#E2E8F0' : `${color}20`}`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: isRead ? '#64748B' : color,
        flexShrink: 0,
      }}>
        {icon}
      </div>

      {/* Title & Info */}
      <div style={{ minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          {!isRead && d.is_active && (
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, flexShrink: 0 }} />
          )}
          <span style={{
            fontSize: '0.875rem',
            fontWeight: isRead ? 600 : 700,
            color: isRead ? '#475569' : '#0F172A',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {d.title}
          </span>
          <span style={{
            fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em',
            background: `${color}10`, color: color, padding: '2px 6px', borderRadius: '4px', border: `1px solid ${color}20`
          }}>
            {d.severity}
          </span>
        </div>
        <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {d.description || 'No additional details provided for this disruption event.'}
        </div>
      </div>

      {/* Region & Type details */}
      <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
        <div style={{ color: '#475569', fontWeight: 600, textTransform: 'capitalize' }}>{d.disruption_type}</div>
        <div style={{ fontSize: '0.6875rem', color: '#94A3B8', marginTop: '2px' }}>{d.region || 'All Regions'}</div>
      </div>

      {/* Impact Score */}
      <div style={{ textAlign: 'right' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: color, fontFamily: 'monospace' }}>
          {(d.impact_score * 100).toFixed(0)}%
        </div>
        <div style={{ fontSize: '0.625rem', color: '#94A3B8', marginTop: '2px', fontWeight: 600 }}>
          Impact
        </div>
      </div>

      {/* Date / Resolved Badge */}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', justifyContent: 'center' }}>
        {d.is_active ? (
          <span style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 500 }}>
            {formatDisruptionDate(d.created_at)}
          </span>
        ) : (
          <span style={{
            fontSize: '0.5625rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
            background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0',
            letterSpacing: '0.05em',
          }}>RESOLVED</span>
        )}
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
    <div style={{ 
      display: 'flex', flexDirection: 'column', gap: '24px', 
      maxWidth: '1400px', margin: '0 auto', width: '100%',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    }}>
      <style>{`
        .inbox-row {
          transition: all 150ms ease;
        }
        .inbox-row:hover {
          background: #F8FAFC !important;
          transform: translateX(4px);
        }
        .action-btn {
          transition: all 150ms ease;
        }
        .action-btn:hover {
          border-color: #CBD5E1 !important;
          color: #0F172A !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
        <div style={{ 
          fontSize: '0.75rem', 
          color: '#64748B', 
          fontWeight: 500, 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span 
            onClick={() => navigate('/')} 
            style={{ cursor: 'pointer', transition: 'color 150ms ease' }}
            onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
          >
            Dashboard
          </span>
          <span>/</span>
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Disruptions</span>
        </div>
        
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span style={{ 
                fontSize: '0.625rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '2px 8px', borderRadius: '4px', background: '#FEE2E2', color: '#EF4444', border: '1px solid #FCA5A5'
              }}>
                System Alerts
              </span>
            </div>
            <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
              Disruption Alerts
            </h1>
            <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px', marginBottom: 0 }}>
              {unreadCount > 0 ? `${unreadCount} unread alerts requiring attention` : 'All alerts read'}
            </p>
          </div>
          {unreadCount > 0 && (
            <button
              onClick={markAllRead}
              className="action-btn"
              style={{
                display: 'flex', alignItems: 'center', gap: '6px',
                padding: '6px 12px', background: '#FFFFFF',
                border: '1px solid #E2E8F0', borderRadius: 8,
                fontSize: '0.75rem', fontWeight: 700, color: '#64748B',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <BellOff size={13} /> Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Main Page Layout Wrapper */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
        {/* Active disruptions */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px rgba(15,23,42,0.01)' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 20px',
            background: '#F8FAFC',
            borderBottom: '1px solid #E2E8F0',
          }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Events
            </span>
            {unreadCount > 0 && (
              <span style={{ fontSize: '0.625rem', fontWeight: 800, background: '#DC2626', color: '#FFFFFF', padding: '2px 8px', borderRadius: 20 }}>
                {unreadCount} new
              </span>
            )}
          </div>

          {isLoading ? (
            <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 56, borderRadius: 8 }} />)}
            </div>
          ) : active.length === 0 ? (
            <div style={{ padding: '40px 16px', textAlign: 'center' }}>
              <CheckCircle2 size={24} color="#059669" style={{ margin: '0 auto 8px' }} />
              <div style={{ fontSize: '0.875rem', fontWeight: 750, color: '#15803D' }}>No active disruptions</div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              {active.map(d => (
                <InboxRow key={d.id} d={d} isRead={readIds.has(d.id)} onClick={() => openDisruption(d)} />
              ))}
            </div>
          )}
        </div>

        {/* Resolved section */}
        {resolved.length > 0 && (
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <button
              onClick={() => setShowResolved(o => !o)}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                padding: '12px 20px', background: '#F8FAFC', border: 'none',
                borderBottom: showResolved ? '1px solid #E2E8F0' : 'none',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Resolved Events
                </span>
                <span style={{ fontSize: '0.625rem', fontWeight: 800, background: '#E2E8F0', color: '#475569', padding: '2px 8px', borderRadius: 20 }}>
                  {resolved.length}
                </span>
              </div>
              {showResolved ? <ChevronUp size={14} color="#64748B" /> : <ChevronDown size={14} color="#64748B" />}
            </button>
            {showResolved && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {resolved.map(d => (
                  <InboxRow key={d.id} d={d} isRead={readIds.has(d.id)} onClick={() => openDisruption(d)} />
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
