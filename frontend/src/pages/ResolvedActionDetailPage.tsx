import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import {
  ChevronLeft, CheckCircle2, AlertTriangle, TrendingDown,
  ShieldCheck, Clock, FileText,
  Lightbulb, Target, BarChart3, MessageSquare, Zap,
} from 'lucide-react'
import { api } from '../services/api'
import { useActionCards, useProcurementCards, useWeightedRiskAnalysis } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import type { ActionCard, MitigationSimulation } from '../types'

/* ── Helpers ──────────────────────────────────────────────────────────── */
function formatINR(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000)    return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000)       return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v.toFixed(0)}`
}
function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })
}
function fmtDateTime(iso: string) {
  const d = new Date(iso)
  return `${d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} at ${d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true })}`
}

const ACTION_LABELS: Record<string, string> = {
  switch_supplier: 'Switched to alternate supplier',
  increase_stock:  'Pre-ordered safety stock',
  expedite:        'Expedited current orders',
  substitute_sku:  'Activated substitute SKUs',
  reorder:         'Issued reorder',
}
const ACTION_ICONS: Record<string, any> = {
  switch_supplier: ShieldCheck,
  increase_stock:  BarChart3,
  expedite:        Zap,
  substitute_sku:  Target,
  reorder:         FileText,
}

const PRIORITY_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
}
const PRIORITY_BG: Record<string, string> = {
  critical: '#FEF2F2', high: '#FFFBEB', medium: '#EFF6FF', low: '#F0FDF4',
}

/* ── Prevention recommendations per action type ──────────────────────── */
const PREVENTION: Record<string, { title: string; points: string[] }> = {
  switch_supplier: {
    title: 'Supplier Diversification',
    points: [
      'Pre-qualify 2–3 backup suppliers per category before issues arise — never rely on a single source for critical SKUs.',
      'Maintain an approved vendor list with quarterly performance reviews so alternates are always order-ready.',
      'Diversify geographically: avoid putting primary and backup suppliers in the same region or logistics zone.',
      'Run small trial orders with alternates regularly (even outside disruptions) to keep the relationship warm.',
    ],
  },
  increase_stock: {
    title: 'Safety Stock & Inventory Buffers',
    points: [
      'Recalibrate safety stock levels against 90-day demand volatility — review quarterly, not annually.',
      'Set automated low-stock alerts at 21-day and 10-day thresholds for critical SKUs.',
      'Build a "disruption buffer" of +15–20% stock when upstream signals (weather, geopolitics) start firing.',
      'Negotiate consignment or VMI (vendor-managed inventory) arrangements with top suppliers.',
    ],
  },
  expedite: {
    title: 'Lead Time Management',
    points: [
      'Track supplier lead time compliance weekly — a 2-day slip is a signal, not just a delay.',
      'Add 10–15% buffer to quoted lead times in your planning system for high-risk suppliers.',
      'Establish a named escalation contact at critical suppliers for priority shipments.',
      'Include expedite clauses in supplier contracts with pre-agreed rates to avoid last-minute negotiation.',
    ],
  },
  substitute_sku: {
    title: 'SKU Substitution Readiness',
    points: [
      'Build and maintain a pre-approved substitute SKU catalogue per product family — document customer acceptance.',
      'Run bi-annual substitution drills: confirm availability, quality, and regulatory compliance of all substitutes.',
      'Keep at least 7 days of substitute stock on hand for your top 20 critical SKUs.',
      'Pre-approve substitutions with key accounts in advance so authorization doesn\'t add days to your response time.',
    ],
  },
  reorder: {
    title: 'Reorder Process Improvement',
    points: [
      'Automate reorder triggers based on real-time inventory data, not periodic manual checks.',
      'Review reorder points against demand forecasts every quarter — static par levels go stale.',
      'Build a dual-approval fast-track for urgent reorders to bypass normal PO approval delays.',
      'Monitor days-of-stock in real time for all critical SKUs on a live dashboard.',
    ],
  },
}

/* ── Parse resolution note into structured components ─────────────────── */
function parseNote(note: string | null) {
  if (!note) return { chosenActionLabel: null, handledExternally: false, userNote: null }
  const parts = note.split(' — ')
  const chosenActionLabel = parts.find(p => p.startsWith('Action taken:'))?.replace('Action taken: ', '').trim() ?? null
  const handledExternally = parts.includes('Handled externally')
  const userNote = parts.find(p => !p.startsWith('Action taken:') && p !== 'Handled externally')?.trim() ?? null
  return { chosenActionLabel, handledExternally, userNote }
}

/* ── Section wrapper ──────────────────────────────────────────────────── */
function Section({ title, icon: Icon, children, accent = '#000' }: {
  title: string; icon: any; children: React.ReactNode; accent?: string
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', background: '#FAFAFA' }}>
        <div style={{ width: '28px', height: '28px', borderRadius: '6px', background: accent === '#000' ? '#000' : `${accent}15`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Icon size={14} color={accent === '#000' ? '#fff' : accent} />
        </div>
        <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{title}</span>
      </div>
      <div style={{ padding: '1.25rem' }}>
        {children}
      </div>
    </div>
  )
}

/* ── Mitigation options display ───────────────────────────────────────── */
function OptionsList({ sim, chosenActionType }: { sim: MitigationSimulation; chosenActionType: string }) {
  const bestIdx = sim.options.reduce((b, o, i) => o.exposure_reduction_inr > sim.options[b].exposure_reduction_inr ? i : b, 0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '0.75rem', lineHeight: 1.5 }}>
        These were the available mitigation options at the time of the incident. The one that was taken is highlighted.
      </p>
      {sim.options.map((opt, i) => {
        const isChosen = opt.action_type === chosenActionType
        const isBest = i === bestIdx
        const label = ACTION_LABELS[opt.action_type] ?? opt.description

        return (
          <div
            key={i}
            style={{
              padding: '0.875rem 1rem',
              background: isChosen ? '#000' : '#F9FAFB',
              border: `1px solid ${isChosen ? '#000' : 'var(--border)'}`,
              borderRadius: '0.5rem',
              position: 'relative',
            }}
          >
            {isChosen && (
              <span style={{
                position: 'absolute', top: '0.625rem', right: '0.75rem',
                fontSize: '0.45rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                background: '#059669', color: '#fff', letterSpacing: '0.05em',
              }}>ACTION TAKEN</span>
            )}
            {!isChosen && isBest && (
              <span style={{
                position: 'absolute', top: '0.625rem', right: '0.75rem',
                fontSize: '0.45rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                background: '#EFF6FF', color: '#2563EB', letterSpacing: '0.05em',
              }}>HIGHEST IMPACT</span>
            )}
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: isChosen ? '#fff' : '#000', marginBottom: '0.375rem', paddingRight: '6rem' }}>
              {label}
            </div>
            <div style={{ display: 'flex', gap: '1.25rem', fontSize: '0.6875rem', color: isChosen ? 'rgba(255,255,255,0.6)' : 'var(--ink-4)', flexWrap: 'wrap' }}>
              <span>Exposure reduced by <strong style={{ color: isChosen ? '#86efac' : '#059669' }}>−{formatINR(opt.exposure_reduction_inr)}</strong></span>
              <span>·</span>
              <span>Cost: <strong style={{ color: isChosen ? '#FCA5A5' : '#000' }}>{formatINR(opt.cost_inr)}</strong></span>
              <span>·</span>
              <span>{opt.time_to_effect_days}d to take effect</span>
              <span>·</span>
              <span>{(opt.confidence * 100).toFixed(0)}% confidence</span>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Impact bar ─────────────────────────────────────────────────────────── */
function ImpactBar({ before, after, label }: { before: number; after: number; label: string }) {
  const pct = before > 0 ? Math.min(100, ((before - after) / before) * 100) : 0
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
        <span style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', fontWeight: 500 }}>{label}</span>
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#059669' }}>{pct.toFixed(0)}% reduced</span>
      </div>
      <div style={{ height: '8px', background: '#F4F4F5', borderRadius: '99px', overflow: 'hidden', position: 'relative' }}>
        <div style={{ position: 'absolute', inset: 0, width: '100%', background: '#FEE2E2', borderRadius: '99px' }} />
        <div style={{ position: 'absolute', inset: 0, width: `${pct}%`, background: 'linear-gradient(90deg, #059669, #34D399)', borderRadius: '99px', transition: 'width 1s ease' }} />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.375rem', fontSize: '0.5625rem', color: 'var(--ink-4)' }}>
        <span style={{ color: '#DC2626', fontFamily: 'monospace', fontWeight: 700 }}>{formatINR(before)}</span>
        <span>→ residual: <span style={{ color: '#059669', fontFamily: 'monospace', fontWeight: 700 }}>{formatINR(after)}</span></span>
      </div>
    </div>
  )
}

/* ── Timeline ───────────────────────────────────────────────────────────── */
function Timeline({ card }: { card: ActionCard }) {
  const daysToResolve = card.resolved_at
    ? Math.max(0, Math.round((new Date(card.resolved_at).getTime() - new Date(card.created_at).getTime()) / (1000 * 60 * 60 * 24)))
    : null

  const events = [
    { label: 'Risk Detected', time: fmtDateTime(card.created_at), color: '#DC2626', done: true },
    { label: 'Escalated to Action', time: `Priority: ${card.priority.toUpperCase()} — ${formatINR(card.estimated_impact_inr)} at stake`, color: PRIORITY_COLOR[card.priority] ?? '#D97706', done: true },
    { label: 'Action Taken', time: ACTION_LABELS[card.action_type] ?? card.action_type, color: '#2563EB', done: true },
    { label: 'Marked Resolved', time: card.resolved_at ? fmtDateTime(card.resolved_at) : '—', color: '#059669', done: true },
  ]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
      {events.map((ev, i) => (
        <div key={ev.label} style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
          {/* Spine */}
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', width: '20px', flexShrink: 0 }}>
            <div style={{ width: '12px', height: '12px', borderRadius: '50%', background: ev.color, border: '2px solid #fff', boxShadow: `0 0 0 2px ${ev.color}`, marginTop: '2px', flexShrink: 0 }} />
            {i < events.length - 1 && <div style={{ width: '2px', flex: 1, minHeight: '28px', background: 'var(--border)', marginTop: '4px' }} />}
          </div>
          {/* Content */}
          <div style={{ paddingBottom: i < events.length - 1 ? '1.25rem' : 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000', lineHeight: 1.3 }}>{ev.label}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '2px', lineHeight: 1.4 }}>{ev.time}</div>
          </div>
        </div>
      ))}
      {daysToResolve !== null && (
        <div style={{ marginTop: '0.75rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
          Total resolution time: <strong style={{ color: '#000' }}>{daysToResolve === 0 ? 'Same day' : `${daysToResolve} day${daysToResolve !== 1 ? 's' : ''}`}</strong>
        </div>
      )}
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────────── */
export default function ResolvedActionDetailPage() {
  const { cardId } = useParams<{ cardId: string }>()
  const navigate = useNavigate()

  const { data: actionData, isLoading: cardsLoading } = useActionCards()
  const { data: risks } = useWeightedRiskAnalysis()
  const { data: procCards } = useProcurementCards()

  const card: ActionCard | undefined = useMemo(
    () => (actionData?.action_cards ?? []).find(c => c.id === cardId),
    [actionData, cardId]
  )

  const { data: sim, isLoading: simLoading } = useQuery({
    queryKey: ['mitigation-sim', card?.supplier_id],
    queryFn: () => api.getMitigationSimulation(card!.supplier_id!),
    enabled: !!card?.supplier_id,
    staleTime: 300_000,
  })

  const supplierRisk = useMemo(
    () => (risks as any[] | undefined)?.find((r: any) => r.supplier_id === card?.supplier_id),
    [risks, card]
  )
  const procCard = useMemo(
    () => (procCards as any[] | undefined)?.find((c: any) => c.supplier_id === card?.supplier_id),
    [procCards, card]
  )

  const { chosenActionLabel, handledExternally, userNote } = parseNote(card?.resolution_note ?? null)
  const prevention = PREVENTION[card?.action_type ?? ''] ?? PREVENTION.reorder
  const ActionIcon = ACTION_ICONS[card?.action_type ?? ''] ?? CheckCircle2

  /* ── Loading / not found ─────────────────────────────────────────────── */
  if (cardsLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {[80, 200, 160, 200, 200].map(h => (
          <div key={h} className="skeleton" style={{ height: h, borderRadius: '0.625rem' }} />
        ))}
      </div>
    )
  }

  if (!card) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
        Action not found. It may have been removed or the link is invalid.
      </div>
    )
  }

  if (!card.is_resolved) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <AlertTriangle size={28} color="#D97706" style={{ marginBottom: '0.75rem' }} />
        <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#000', marginBottom: '0.375rem' }}>This action is still pending</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--ink-4)' }}>Resolved action details are only available after an action is marked as done.</div>
        <button
          onClick={() => navigate(`/risks/${card.supplier_id}/mitigation`)}
          style={{ marginTop: '1rem', padding: '0.5rem 1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Go to Mitigation Plan
        </button>
      </div>
    )
  }

  /* ── Main render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '900px' }}>

      {/* Back nav */}
      <button
        onClick={() => navigate('/activity')}
        style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.8125rem', fontFamily: 'inherit', padding: '4px 0', width: 'fit-content' }}
      >
        <ChevronLeft size={14} /> Back to Activity Log
      </button>

      {/* Hero — resolved banner */}
      <div style={{
        background: '#000', borderRadius: '0.75rem', padding: '1.5rem',
        display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem',
      }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.75rem' }}>
            <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={18} color="#16a34a" />
            </div>
            <div>
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Issue Resolved
              </span>
              <div style={{ fontSize: '0.6875rem', color: '#86efac', fontWeight: 600 }}>
                {card.resolved_at ? fmtDateTime(card.resolved_at) : ''}
              </div>
            </div>
          </div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.3, margin: '0 0 0.5rem' }}>
            {card.title}
          </h1>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap' }}>
            <span style={{
              fontSize: '0.5rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px', letterSpacing: '0.06em',
              background: PRIORITY_BG[card.priority] ?? '#F9FAFB',
              color: PRIORITY_COLOR[card.priority] ?? '#6B7280',
            }}>{card.priority.toUpperCase()}</span>
            <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.5)' }}>
              {ACTION_LABELS[card.action_type] ?? card.action_type}
            </span>
            {supplierRisk && (
              <>
                <span style={{ color: 'rgba(255,255,255,0.3)' }}>·</span>
                <Badge level={supplierRisk.risk_level} />
              </>
            )}
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Exposure Mitigated</div>
          <div style={{ fontSize: '2rem', fontWeight: 800, color: '#86efac', fontFamily: 'monospace', lineHeight: 1 }}>{formatINR(card.estimated_impact_inr)}</div>
          {procCard && (
            <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.35)', marginTop: '4px' }}>
              of {formatINR(procCard.financial_exposure_inr)} total exposure
            </div>
          )}
        </div>
      </div>

      {/* Two-column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: '1rem', alignItems: 'start' }}>

        {/* LEFT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Problem Summary */}
          <Section title="Problem Summary" icon={AlertTriangle} accent="#DC2626">
            {card.description ? (
              <p style={{ fontSize: '0.8125rem', color: '#000', lineHeight: 1.7, margin: '0 0 1rem' }}>
                {card.description}
              </p>
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', fontStyle: 'italic', margin: '0 0 1rem' }}>
                No detailed description recorded for this issue.
              </p>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
              {[
                { label: 'Risk detected', value: fmtDate(card.created_at) },
                { label: 'Priority', value: card.priority.charAt(0).toUpperCase() + card.priority.slice(1) },
                { label: 'Action type', value: ACTION_LABELS[card.action_type] ?? card.action_type },
                { label: 'Exposure at risk', value: formatINR(card.estimated_impact_inr) },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{value}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* What Was Done */}
          <Section title="What Was Done" icon={ActionIcon} accent="#059669">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>

              {/* Chosen action */}
              <div style={{ padding: '0.875rem 1rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                  <CheckCircle2 size={14} color="#16a34a" />
                  <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Action Taken</span>
                </div>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#14532D' }}>
                  {chosenActionLabel ?? ACTION_LABELS[card.action_type] ?? card.action_type}
                </div>
                {handledExternally && (
                  <div style={{ fontSize: '0.6875rem', color: '#16a34a', marginTop: '4px', fontStyle: 'italic' }}>
                    Handled outside the system (external action)
                  </div>
                )}
              </div>

              {/* Resolution note / user's own words */}
              {userNote ? (
                <div style={{ padding: '0.875rem 1rem', background: '#FAFAFA', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    <MessageSquare size={13} color="var(--ink-4)" />
                    <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Resolution Notes</span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#000', lineHeight: 1.6, margin: 0, fontStyle: 'italic' }}>
                    "{userNote}"
                  </p>
                </div>
              ) : (
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontStyle: 'italic' }}>
                  No additional notes were recorded at the time of resolution.
                </div>
              )}
            </div>
          </Section>

          {/* Available Options (mitigation simulation) */}
          <Section title="Options That Were Available" icon={Target}>
            {simLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[60, 60, 60].map(h => <div key={h} className="skeleton" style={{ height: h, borderRadius: '0.5rem' }} />)}
              </div>
            ) : sim ? (
              <OptionsList sim={sim} chosenActionType={card.action_type} />
            ) : (
              <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>
                Simulation data not available for this supplier.
              </p>
            )}
          </Section>

          {/* Prevention */}
          <Section title={`How to Prevent This Next Time — ${prevention.title}`} icon={Lightbulb} accent="#D97706">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {prevention.points.map((point, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{
                    width: '22px', height: '22px', borderRadius: '50%', flexShrink: 0,
                    background: '#000', color: '#fff',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.5625rem', fontWeight: 700, marginTop: '1px',
                  }}>{i + 1}</div>
                  <p style={{ fontSize: '0.8125rem', color: '#000', lineHeight: 1.65, margin: 0 }}>{point}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* RIGHT COLUMN */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Financial impact */}
          <Section title="Financial Impact" icon={TrendingDown} accent="#059669">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

              {sim ? (
                <>
                  {/* Big numbers */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
                    <div style={{ padding: '0.75rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Before</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#DC2626', fontFamily: 'monospace' }}>{formatINR(sim.current_exposure_inr)}</div>
                    </div>
                    <div style={{ padding: '0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem' }}>
                      <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>After</div>
                      <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{formatINR(sim.mitigated_exposure_inr)}</div>
                    </div>
                  </div>

                  <ImpactBar before={sim.current_exposure_inr} after={sim.mitigated_exposure_inr} label="Exposure reduction" />

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', paddingTop: '0.75rem', borderTop: '1px solid var(--border)' }}>
                    {[
                      { label: 'Gross savings', value: formatINR(sim.savings_inr), color: '#059669' },
                      { label: 'Net gain', value: formatINR(sim.net_saving_inr), color: '#2563EB' },
                      { label: 'Action cost', value: formatINR(sim.mitigation_cost_inr), color: '#DC2626' },
                      { label: 'Risk before', value: `${(sim.risk_before * 100).toFixed(0)}%`, color: '#DC2626' },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div style={{ fontSize: '0.45rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '2px' }}>{label}</div>
                        <div style={{ fontSize: '0.9375rem', fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <div>
                  <div style={{ padding: '0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem', marginBottom: '0.75rem' }}>
                    <div style={{ fontSize: '0.45rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '4px' }}>Estimated Exposure Mitigated</div>
                    <div style={{ fontSize: '1.375rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{formatINR(card.estimated_impact_inr)}</div>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontStyle: 'italic' }}>
                    Detailed simulation data unavailable.
                  </p>
                </div>
              )}
            </div>
          </Section>

          {/* Timeline */}
          <Section title="Resolution Timeline" icon={Clock}>
            <Timeline card={card} />
          </Section>

          {/* Supplier context */}
          {supplierRisk && (
            <Section title="Supplier Context" icon={BarChart3}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#000' }}>{supplierRisk.supplier_name}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Badge level={supplierRisk.risk_level} />
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{(supplierRisk.overall_score * 100).toFixed(0)}% risk score</span>
                </div>
                <p style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', lineHeight: 1.5, margin: '0.25rem 0 0', padding: '0.625rem', background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: '0.375rem' }}>
                  Note: The supplier's underlying risk score reflects real-world conditions (disruptions, inventory, delivery data) and is independent of this action's resolution status. Resolving an action card records that you've taken action — it doesn't remove the root cause.
                </p>
              </div>
            </Section>
          )}

        </div>
      </div>
    </div>
  )
}
