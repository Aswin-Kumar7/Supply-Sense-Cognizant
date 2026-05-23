import { useState, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useActionCards } from '../hooks/useQueries'
import { queryKeys } from '../hooks/queryKeys'
import { api } from '../services/api'
import { ClipboardList, CheckCircle2, ArrowUpRight, Circle, TrendingDown, ShieldCheck } from 'lucide-react'
import type { ActionCard } from '../types'

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626',
  high: '#D97706',
  medium: '#2563EB',
  low: '#6B7280',
}

const PRIORITY_BG: Record<string, string> = {
  critical: '#FEF2F2',
  high: '#FFFBEB',
  medium: '#EFF6FF',
  low: '#F9FAFB',
}

function formatINR(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v}`
}

function ActionRow({ card, onToggle }: { card: ActionCard; onToggle: (id: string, resolved: boolean) => void }) {
  const navigate = useNavigate()
  const [busy, setBusy] = useState(false)

  const handleToggle = useCallback(async (e: React.MouseEvent) => {
    e.stopPropagation()
    setBusy(true)
    await onToggle(card.id, card.is_resolved)
    setBusy(false)
  }, [card.id, card.is_resolved, onToggle])

  const color = PRIORITY_COLOR[card.priority] ?? '#6B7280'
  const bg = PRIORITY_BG[card.priority] ?? '#F9FAFB'

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '40px 1fr auto auto',
        alignItems: 'center',
        gap: '1rem',
        padding: '1rem 1.25rem',
        cursor: card.supplier_id ? 'pointer' : 'default',
        transition: 'background 120ms ease',
        opacity: card.is_resolved ? 0.55 : 1,
      }}
      onClick={() => card.supplier_id && navigate(`/risks/${card.supplier_id}/mitigation`)}
      onMouseEnter={e => { e.currentTarget.style.background = '#F9F9F9' }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {/* Toggle button */}
      <button
        onClick={handleToggle}
        disabled={busy}
        title={card.is_resolved ? 'Mark as pending' : 'Mark as done'}
        style={{
          width: '36px', height: '36px', borderRadius: '50%',
          border: `2px solid ${card.is_resolved ? '#16a34a' : color}`,
          background: card.is_resolved ? '#dcfce7' : bg,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: busy ? 'wait' : 'pointer',
          flexShrink: 0, transition: 'all 150ms ease',
        }}
      >
        {card.is_resolved
          ? <CheckCircle2 size={16} color="#16a34a" />
          : <Circle size={16} color={color} style={{ opacity: busy ? 0.4 : 0.3 }} />
        }
      </button>

      {/* Title + meta */}
      <div style={{ minWidth: 0 }}>
        <div style={{
          fontSize: '0.875rem', fontWeight: 600,
          color: card.is_resolved ? '#6B7280' : '#000',
          textDecoration: card.is_resolved ? 'line-through' : 'none',
          marginBottom: '0.25rem', lineHeight: 1.4,
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>
          {card.title}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <span style={{
            fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase',
            letterSpacing: '0.05em', color, padding: '2px 7px',
            borderRadius: '99px', background: bg, border: `1px solid ${color}22`,
          }}>
            {card.priority}
          </span>
          <span style={{ fontSize: '0.75rem', color: '#6B7280' }}>{card.action_type}</span>
          {card.is_resolved && (
            <span style={{ fontSize: '0.6875rem', color: '#16a34a', fontWeight: 600 }}>✓ Resolved</span>
          )}
        </div>
      </div>

      {/* Impact */}
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: card.priority === 'critical' ? '#DC2626' : '#000', fontFamily: 'monospace' }}>
          {formatINR(card.estimated_impact_inr)}
        </div>
        <div style={{ fontSize: '0.5625rem', color: '#9CA3AF', textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.04em' }}>Impact</div>
      </div>

      {/* Arrow */}
      {!card.is_resolved && card.supplier_id
        ? <ArrowUpRight size={14} color="#9CA3AF" style={{ flexShrink: 0 }} />
        : <div style={{ width: 14 }} />
      }
    </div>
  )
}

type Filter = 'pending' | 'resolved' | 'all'

export default function PendingActionsPage() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const { data, isLoading } = useActionCards()
  const [filter, setFilter] = useState<Filter>('pending')

  const allCards = data?.action_cards ?? []
  const pendingCards = allCards.filter(c => !c.is_resolved)
  const resolvedCards = allCards.filter(c => c.is_resolved)

  const totalExposure = pendingCards.reduce((sum, c) => sum + c.estimated_impact_inr, 0)
  const totalSaved = resolvedCards.reduce((sum, c) => sum + c.estimated_impact_inr, 0)

  const filtered = allCards
    .filter(c => {
      if (filter === 'pending') return !c.is_resolved
      if (filter === 'resolved') return c.is_resolved
      return true
    })
    .sort((a, b) => {
      if (a.is_resolved !== b.is_resolved) return a.is_resolved ? 1 : -1
      const order = { critical: 0, high: 1, medium: 2, low: 3 }
      return (order[a.priority as keyof typeof order] ?? 4) - (order[b.priority as keyof typeof order] ?? 4)
    })

  const handleToggle = useCallback(async (actionCardId: string, currentlyResolved: boolean) => {
    if (currentlyResolved) {
      await api.unresolveActionCard(actionCardId)
    } else {
      await api.resolveActionCard(actionCardId)
    }
    // Fix 2: also invalidate risk('all') so RisksPage and Dashboard resolved filtering
    // updates immediately — not just on the next 30s poll cycle
    queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
    queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
  }, [queryClient])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* Header */}
      <div>
        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: '0.375rem', cursor: 'pointer' }} onClick={() => navigate('/')}>
          Dashboard / Pending Actions
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1, margin: 0 }}>
          Pending Actions
        </h1>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
          Track and resolve mitigation actions across all suppliers
        </p>
      </div>

      {/* Summary stats */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
        {/* Exposure at risk */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: '#FEF2F2',
          border: '1px solid #FECACA',
          borderRadius: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '10px',
            background: '#FEE2E2', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <TrendingDown size={22} color="#DC2626" />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#DC2626', marginBottom: '0.25rem' }}>
              Exposure at Risk
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#DC2626', lineHeight: 1, fontFamily: 'monospace' }}>
              {formatINR(totalExposure)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: '0.25rem' }}>
              across {pendingCards.length} unresolved action{pendingCards.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Amount saved */}
        <div style={{
          padding: '1.25rem 1.5rem',
          background: '#F0FDF4',
          border: '1px solid #BBF7D0',
          borderRadius: '0.75rem',
          display: 'flex', alignItems: 'center', gap: '1rem',
        }}>
          <div style={{
            width: '44px', height: '44px', borderRadius: '10px',
            background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
          }}>
            <ShieldCheck size={22} color="#16a34a" />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#16a34a', marginBottom: '0.25rem' }}>
              Risk Mitigated
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#16a34a', lineHeight: 1, fontFamily: 'monospace' }}>
              {formatINR(totalSaved)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#22c55e', marginTop: '0.25rem' }}>
              across {resolvedCards.length} resolved action{resolvedCards.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: '0.25rem' }}>
        {(['pending', 'resolved', 'all'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0.375rem 0.875rem', borderRadius: '99px',
              border: `1px solid ${filter === f ? '#000' : 'var(--border)'}`,
              background: filter === f ? '#000' : '#fff',
              color: filter === f ? '#fff' : 'var(--ink-3)',
              fontSize: '0.75rem', fontWeight: filter === f ? 700 : 500,
              cursor: 'pointer',
            }}
          >
            {f === 'pending' ? `Pending (${pendingCards.length})` : f === 'resolved' ? `Resolved (${resolvedCards.length})` : `All (${allCards.length})`}
          </button>
        ))}
      </div>

      {/* Table */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '40px 1fr auto auto',
          gap: '1rem',
          padding: '0.625rem 1.25rem',
          background: '#F9F9F9',
          borderBottom: '1px solid var(--border)',
        }}>
          {['', 'Action', 'Impact', ''].map((col, i) => (
            <div key={i} style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: i === 2 ? 'right' : 'left' }}>
              {col}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
            Loading actions…
          </div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: '3rem', textAlign: 'center' }}>
            <CheckCircle2 size={32} color="#16a34a" style={{ marginBottom: '0.75rem' }} />
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000' }}>All clear</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>No pending actions at this time</div>
          </div>
        ) : (
          <div>
            {filtered.map((card, i, arr) => (
              <div key={card.id}>
                <ActionRow card={card} onToggle={handleToggle} />
                {i < arr.length - 1 && <div style={{ height: '1px', background: 'var(--border)', margin: '0 1.25rem' }} />}
              </div>
            ))}
          </div>
        )}
      </div>

      <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
        <ClipboardList size={11} />
        Click the circle to toggle resolved · click any row to view the mitigation plan
      </div>

    </div>
  )
}
