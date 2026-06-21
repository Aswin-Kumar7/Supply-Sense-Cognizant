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

// How much each action type reduces financial exposure (matches financial_engine.py)
const RISK_REDUCTION_MAP: Record<string, number> = {
  switch_supplier: 0.60,
  increase_stock:  0.40,
  expedite:        0.30,
  substitute_sku:  0.25,
  reorder:         0.40,
}
// Cost of executing each action as a fraction of exposure (matches financial_engine.py)
const COST_FRACTION_MAP: Record<string, number> = {
  switch_supplier: 0.15,
  increase_stock:  0.25,
  expedite:        0.10,
  substitute_sku:  0.08,
  reorder:         0.15,
}

// Reverse map: label text → action_type key
// Covers both the labels stored in resolution_note (from RiskMitigationPlan) and the
// canonical labels above, so we can identify which option was actually chosen.
const LABEL_TO_ACTION_TYPE: Record<string, string> = {
  // Labels from RiskMitigationPlan ACTION_LABELS (what gets written into resolution_note)
  'switch to an alternate supplier': 'switch_supplier',
  'pre-order additional safety stock': 'increase_stock',
  'expedite current orders': 'expedite',
  'activate substitute skus': 'substitute_sku',
  // Labels from this page's ACTION_LABELS (canonical past-tense)
  'switched to alternate supplier': 'switch_supplier',
  'pre-ordered safety stock': 'increase_stock',
  'expedited current orders': 'expedite',
  'activated substitute skus': 'substitute_sku',
  'issued reorder': 'reorder',
}

/** Given a resolution_note string, extract the action_type that was actually chosen. */
function resolvedActionType(note: string | null, fallback: string): string {
  if (!note) return fallback
  const parts = note.split(' — ')
  const actionPart = parts.find(p => p.startsWith('Action taken:'))
  if (!actionPart) return fallback
  const label = actionPart.replace('Action taken:', '').trim().toLowerCase()
  return LABEL_TO_ACTION_TYPE[label] ?? fallback
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

/* ── Parse resolution note into all structured fields ─────────────────── */
function parseNote(note: string | null) {
  if (!note) return { chosenActionLabel: null, handledExternally: false, userNote: null, fields: {} as Record<string, string> }
  const parts = note.split(' — ')
  const chosenActionLabel = parts.find(p => p.startsWith('Action taken:'))?.replace('Action taken: ', '').trim() ?? null
  const handledExternally = parts.includes('Handled externally')

  // All structured keys emitted by the three action pages + legacy keys
  const KNOWN_KEYS = [
    // Legacy keys (older logs)
    'PO Number', 'Expected delivery', 'Ordered from', 'Contacted via', 'New delivery ETA',
    'Extra cost paid', 'Substitutions',
    // Expedite Orders page
    'Contact', 'Contact phone', 'Via', 'Original ETA', 'New ETA', 'Days gained',
    'Freight method', 'Rush cost (₹)', 'PO references', 'Supplier ref',
    'Confirmed on', 'Follow-up by',
    // Increase Stock page
    'Buffer target', 'SKUs ordered', 'Order source', 'Contact method',
    'Vendor', 'PO number', 'Order date', 'Lead time confirmed',
    'Finance approval', 'Freight mode', 'Payment terms', 'Receiving warehouse',
    // Substitute SKUs page
    'Quantities', 'Quality tier', 'Duration', 'Revert date',
    'Customer notified on', 'Substitute supplier contact', 'Stakeholders notified',
    // Shared
    'Authorized by',
  ]

  const fields: Record<string, string> = {}
  parts.forEach(p => {
    for (const key of KNOWN_KEYS) {
      if (p.startsWith(`${key}:`)) { fields[key] = p.replace(`${key}:`, '').trim(); return }
    }
  })

  // Anything left that isn't a known key, action taken, or "Handled externally" is a free-text note
  const userNote = parts.find(p =>
    !p.startsWith('Action taken:') &&
    p !== 'Handled externally' &&
    !KNOWN_KEYS.some(k => p.startsWith(`${k}:`))
  )?.trim() ?? null
  return { chosenActionLabel, handledExternally, userNote, fields }
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

  // IntelligentActionCard carries extra fields (affected_skus, days_to_stockout) not on ActionCard
  const procCard = useMemo(
    () => (procCards as any[] | undefined)?.find((c: any) => c.supplier_id === card?.supplier_id),
    [procCards, card]
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
  const { chosenActionLabel, handledExternally, userNote, fields } = parseNote(card?.resolution_note ?? null)
  // Use the action that was actually chosen (from resolution_note) for icon / prevention tips.
  // Fall back to card.action_type (original recommendation) when no note was recorded.
  const actualActionType = resolvedActionType(card?.resolution_note ?? null, card?.action_type ?? '')
  const prevention = PREVENTION[actualActionType] ?? PREVENTION.reorder
  const ActionIcon = ACTION_ICONS[actualActionType] ?? CheckCircle2

  // Financial Impact — derived from the actual recorded exposure at the time the card was raised.
  // We do NOT use sim.current_exposure_inr because that's a fresh live calculation and won't match
  // the historical exposure at resolution time. card.estimated_impact_inr is the source of truth.
  const impactBefore   = card?.estimated_impact_inr ?? 0
  const reductionPct   = RISK_REDUCTION_MAP[actualActionType] ?? 0.60
  const costFraction   = COST_FRACTION_MAP[actualActionType] ?? 0.15
  const impactAfter    = Math.round(impactBefore * (1 - reductionPct))
  const grossSaved     = impactBefore - impactAfter
  const actionCost     = Math.round(impactBefore * costFraction)
  const netGain        = grossSaved - actionCost
  const currentRiskPct = supplierRisk ? Math.round(supplierRisk.overall_score * 100) : null

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
      <div style={{ padding: '3rem', textAlign: 'center' }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--ink-4)', marginBottom: '1rem' }}>
          Action not found. It may have been removed or the link is invalid.
        </div>
        <button
          onClick={() => navigate('/activity')}
          style={{ padding: '0.5rem 1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit' }}
        >
          Back to Activity Log
        </button>
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

  /* ── Derived display values ──────────────────────────────────────────── */
  const daysToResolve = card.resolved_at
    ? Math.max(0, Math.round((new Date(card.resolved_at).getTime() - new Date(card.created_at).getTime()) / 86_400_000))
    : null

  /* ── Main render ─────────────────────────────────────────────────────── */
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', maxWidth: '960px' }}>

      {/* Back */}
      <button onClick={() => navigate('/activity')} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', fontSize: '0.8125rem', fontFamily: 'inherit', padding: '4px 0', width: 'fit-content' }}>
        <ChevronLeft size={14} /> Back to Activity Log
      </button>

      {/* ── HERO BANNER ──────────────────────────────────────────────────── */}
      <div style={{ background: '#000', borderRadius: '0.75rem', padding: '1.5rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Resolved stamp */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <CheckCircle2 size={15} color="#16a34a" />
            </div>
            <div>
              <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Incident Closed</div>
              <div style={{ fontSize: '0.6875rem', color: '#86efac', fontWeight: 600 }}>
                {card.resolved_at ? fmtDateTime(card.resolved_at) : '—'}
                {daysToResolve !== null && (
                  <span style={{ marginLeft: 8, padding: '1px 6px', background: 'rgba(134,239,172,0.15)', borderRadius: 4, fontSize: '0.5rem', fontWeight: 700, letterSpacing: '0.04em' }}>
                    {daysToResolve === 0 ? 'SAME DAY' : `${daysToResolve}d RESPONSE`}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* Supplier name + title */}
          <div style={{ fontSize: '0.6875rem', fontWeight: 600, color: 'rgba(255,255,255,0.45)', marginBottom: '0.25rem' }}>
            {supplierRisk?.supplier_name ?? ''}
          </div>
          <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.3, margin: '0 0 0.625rem' }}>
            {card.title}
          </h1>

          {/* Badges */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.5rem', fontWeight: 800, padding: '2px 8px', borderRadius: 4, letterSpacing: '0.06em', background: PRIORITY_BG[card.priority] ?? '#F9FAFB', color: PRIORITY_COLOR[card.priority] ?? '#6B7280' }}>
              {card.priority.toUpperCase()} PRIORITY
            </span>
            <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>·</span>
            <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>{(procCard as any)?.affected_skus ?? '—'} products affected</span>
            {supplierRisk && (
              <>
                <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.3)' }}>·</span>
                <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>Current supplier risk: <strong style={{ color: currentRiskPct !== null && currentRiskPct >= 50 ? '#FCA5A5' : '#86efac' }}>{currentRiskPct ?? '—'}%</strong></span>
              </>
            )}
          </div>
        </div>

        {/* Financial outcome */}
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.45rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Net Saved</div>
          <div style={{ fontSize: '2.25rem', fontWeight: 800, color: netGain >= 0 ? '#86efac' : '#fca5a5', fontFamily: 'monospace', lineHeight: 1 }}>{netGain >= 0 ? '+' : ''}{formatINR(netGain)}</div>
          <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.3)', marginTop: 4 }}>{formatINR(grossSaved)} saved · {formatINR(actionCost)} cost</div>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.2)', marginTop: 2 }}>~estimates based on action type</div>
        </div>
      </div>

      {/* ── TWO COLUMN LAYOUT ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '1rem', alignItems: 'start' }}>

        {/* ── LEFT: main content ─────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* 1. INCIDENT DETAILS */}
          <Section title="Incident Details" icon={AlertTriangle} accent="#DC2626">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              {/* Description */}
              <p style={{ fontSize: '0.8125rem', color: '#111827', lineHeight: 1.7, margin: 0 }}>
                {card.description ?? 'No description recorded for this incident.'}
              </p>
              {/* Key facts grid */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                {([
                  { label: 'Flagged on',        value: fmtDate(card.created_at) },
                  { label: 'Priority',           value: card.priority.charAt(0).toUpperCase() + card.priority.slice(1) },
                  { label: 'Products at risk',   value: `${(procCard as any)?.affected_skus ?? '—'} SKUs` },
                  { label: 'Exposure at risk',   value: formatINR(card.estimated_impact_inr) },
                  { label: 'Stock left (then)',  value: (procCard as any)?.days_to_stockout != null ? `${(procCard as any).days_to_stockout} days` : '—' },
                  { label: 'Resolved on',        value: card.resolved_at ? fmtDate(card.resolved_at) : '—' },
                ] as {label:string;value:string}[]).map(({ label, value }) => (
                  <div key={label}>
                    <div style={{ fontSize: '0.45rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
          </Section>

          {/* 2. ACTION TAKEN */}
          <Section title="Action Taken" icon={ActionIcon} accent="#059669">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

              {/* Action badge */}
              <div style={{ padding: '0.875rem 1rem', background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ width: 36, height: 36, borderRadius: 8, background: '#059669', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <ActionIcon size={18} color="#fff" />
                </div>
                <div>
                  <div style={{ fontSize: '0.5rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Action Taken</div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#14532D' }}>
                    {chosenActionLabel ?? ACTION_LABELS[card.action_type] ?? card.action_type}
                  </div>
                  {handledExternally && (
                    <div style={{ fontSize: '0.625rem', color: '#16a34a', marginTop: 2 }}>Handled outside this system</div>
                  )}
                </div>
              </div>

              {/* Logged operational details */}
              {Object.keys(fields).length > 0 && (
                <div style={{ background: '#FAFAFA', border: '1px solid var(--border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
                  <div style={{ padding: '0.625rem 1rem', borderBottom: '1px solid var(--border)', background: '#F3F4F6' }}>
                    <span style={{ fontSize: '0.5rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Logged Details</span>
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 0 }}>
                    {Object.entries(fields).map(([key, value], i) => (
                      <div key={key} style={{ padding: '0.625rem 1rem', borderBottom: i < Object.keys(fields).length - 2 ? '1px solid var(--border)' : undefined, borderRight: i % 2 === 0 ? '1px solid var(--border)' : undefined }}>
                        <div style={{ fontSize: '0.45rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{key}</div>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{value}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Free text notes */}
              {userNote && (
                <div style={{ padding: '0.875rem 1rem', background: '#FAFAFA', border: '1px solid var(--border)', borderRadius: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
                    <MessageSquare size={13} color="var(--ink-4)" />
                    <span style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Additional Notes</span>
                  </div>
                  <p style={{ fontSize: '0.8125rem', color: '#111827', lineHeight: 1.6, margin: 0 }}>"{userNote}"</p>
                </div>
              )}

              {!chosenActionLabel && !userNote && Object.keys(fields).length === 0 && (
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontStyle: 'italic', margin: 0 }}>
                  No details were logged at resolution time.
                </p>
              )}
            </div>
          </Section>

          {/* 3. FINANCIAL OUTCOME */}
          <Section title="Financial Outcome" icon={TrendingDown} accent="#059669">
            <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
              {([
                { label: 'Money that was at risk',   sub: 'total exposure when issue was flagged',                    value: formatINR(impactBefore),  color: '#DC2626' },
                { label: 'Loss avoided',             sub: `${Math.round(reductionPct*100)}% cut — ${ACTION_LABELS[actualActionType] ?? 'action taken'}`, value: `−${formatINR(grossSaved)}`, color: '#059669' },
                { label: 'Cost to execute action',   sub: 'what was spent to carry out the fix',                     value: `+${formatINR(actionCost)}`, color: '#D97706' },
                { label: 'Residual exposure',        sub: 'portion the action could not eliminate',                  value: formatINR(impactAfter),   color: '#6B7280' },
                { label: 'Net benefit',              sub: 'loss avoided minus cost of action',                       value: `${netGain >= 0 ? '+' : ''}${formatINR(netGain)}`, color: netGain >= 0 ? '#059669' : '#DC2626', bold: true },
              ] as {label:string;sub:string;value:string;color:string;bold?:boolean}[]).map(({ label, sub, value, color, bold }, i, arr) => (
                <div key={label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : undefined, borderTop: bold ? '2px solid var(--border)' : undefined, marginTop: bold ? '0.25rem' : undefined }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: bold ? 700 : 500, color: '#000' }}>{label}</div>
                    <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: 1 }}>{sub}</div>
                  </div>
                  <div style={{ fontSize: bold ? '1.125rem' : '0.9375rem', fontWeight: 800, color, fontFamily: 'monospace' }}>{value}</div>
                </div>
              ))}
            </div>
          </Section>

          {/* 4. HOW TO PREVENT NEXT TIME */}
          <Section title={`Prevent Recurrence — ${prevention.title}`} icon={Lightbulb} accent="#D97706">
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {prevention.points.map((point, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <div style={{ width: 22, height: 22, borderRadius: '50%', flexShrink: 0, background: '#000', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.5625rem', fontWeight: 700, marginTop: 1 }}>{i + 1}</div>
                  <p style={{ fontSize: '0.8125rem', color: '#000', lineHeight: 1.65, margin: 0 }}>{point}</p>
                </div>
              ))}
            </div>
          </Section>
        </div>

        {/* ── RIGHT: sidebar ─────────────────────────────────────────────── */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Supplier current status */}
          {supplierRisk && (
            <Section title="Supplier Today" icon={BarChart3} accent={currentRiskPct !== null && currentRiskPct >= 50 ? '#DC2626' : '#059669'}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                <div>
                  <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000', marginBottom: 4 }}>{supplierRisk.supplier_name}</div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Badge level={supplierRisk.risk_level} />
                    <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 600 }}>{currentRiskPct}% risk score</span>
                  </div>
                </div>

                {/* Risk bar */}
                <div>
                  <div style={{ height: 8, background: '#F4F4F5', borderRadius: 99, overflow: 'hidden' }}>
                    <div style={{ width: `${currentRiskPct ?? 0}%`, height: '100%', background: currentRiskPct !== null && currentRiskPct >= 60 ? '#DC2626' : currentRiskPct !== null && currentRiskPct >= 40 ? '#D97706' : '#059669', borderRadius: 99, transition: 'width 0.6s ease' }} />
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4, fontSize: '0.45rem', color: 'var(--ink-4)' }}>
                    <span>0% (no risk)</span><span>100% (critical)</span>
                  </div>
                </div>

                {currentRiskPct !== null && currentRiskPct >= 50 ? (
                  <div style={{ padding: '0.625rem 0.75rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#991B1B', marginBottom: 3 }}>⚠ Still at elevated risk</div>
                    <div style={{ fontSize: '0.5625rem', color: '#991B1B', lineHeight: 1.4 }}>The card is closed but the root cause may still be active. Continue monitoring this supplier closely.</div>
                  </div>
                ) : (
                  <div style={{ padding: '0.625rem 0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                    <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#166534', marginBottom: 3 }}>✓ Supplier looks stable</div>
                    <div style={{ fontSize: '0.5625rem', color: '#166534', lineHeight: 1.4 }}>Risk score has reduced. Continue standard monitoring.</div>
                  </div>
                )}

                <button onClick={() => navigate(`/risks/${card.supplier_id}`)} style={{ padding: '0.5rem 0.875rem', background: '#000', color: '#fff', border: 'none', borderRadius: 6, fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit', width: '100%' }}>
                  View Supplier Risk Profile →
                </button>
              </div>
            </Section>
          )}

          {/* Resolution Timeline */}
          <Section title="Resolution Timeline" icon={Clock}>
            <Timeline card={card} />
          </Section>

          {/* Options that existed */}
          <Section title="Options That Were Available" icon={Target}>
            {simLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                {[50, 50, 50, 50].map((h, i) => <div key={i} className="skeleton" style={{ height: h, borderRadius: '0.375rem' }} />)}
              </div>
            ) : sim ? (
              <OptionsList sim={sim} chosenActionType={actualActionType} />
            ) : (
              <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontStyle: 'italic' }}>Simulation data unavailable.</p>
            )}
          </Section>
        </div>
      </div>
    </div>
  )
}
