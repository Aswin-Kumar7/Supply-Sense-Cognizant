import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Package,
  Calendar,
  Link as LinkIcon,
  Map,
  Zap,
  Printer,
  ChevronLeft,
  Activity,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
} from 'lucide-react'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useRiskAnalysis, useProcurementCards, useActionCards } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { ProvenanceTag } from '../components/ui/ProvenanceTag'
import type { SupplierRiskAnalysis, IntelligentActionCard, MitigationSimulation, AlternateSupplierRecord } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}


const SIGNAL_META: Record<string, { label: string; icon: any }> = {
  delivery_reliability:    { label: 'Reliability',  icon: Truck },
  disruption_severity:     { label: 'Disruption',   icon: Activity },
  inventory_pressure:      { label: 'Inventory',    icon: Package },
  festival_proximity:      { label: 'Seasonality',  icon: Calendar },
  dependency_exposure:     { label: 'Dependency',   icon: LinkIcon },
  logistics_vulnerability: { label: 'Logistics',    icon: Map },
}

/* ── Why This Score (collapsible) ───────────────────────────────────── */
function WhyThisScore({ risk }: { risk: SupplierRiskAnalysis }) {
  const [open, setOpen] = useState(false)
  const factors = risk.factors ?? {}
  const activeSignals = Object.entries(SIGNAL_META).filter(([key]) => (factors[key]?.value ?? 0) > 0)

  return (
    <div style={{ borderTop: '1px solid var(--border)', marginTop: '0.25rem' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '0.375rem',
          width: '100%', padding: '0.5rem 0', background: 'none', border: 'none',
          cursor: 'pointer', color: 'var(--ink-4)', fontSize: '0.5625rem',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em',
        }}
      >
        {open ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
        Why this score?
        <span style={{ marginLeft: 'auto', fontSize: '0.5rem', fontWeight: 500 }}>
          {activeSignals.length} active signal{activeSignals.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem', paddingBottom: '0.625rem' }}>
          {Object.entries(SIGNAL_META).map(([key, meta]) => {
            const val = factors[key]?.value ?? 0
            const explanation = factors[key]?.explanation ?? ''
            const fired = val > 0
            const Icon = meta.icon
            return (
              <div
                key={key}
                title={explanation}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.3rem',
                  padding: '0.3rem 0.5rem',
                  background: fired ? '#f0fdf4' : 'var(--bg-hover)',
                  border: `1px solid ${fired ? '#86efac' : 'var(--border)'}`,
                  borderRadius: '999px',
                  opacity: fired ? 1 : 0.45,
                }}
              >
                <Icon size={10} style={{ color: fired ? '#15803d' : 'var(--ink-4)' }} />
                <span style={{ fontSize: '0.5625rem', fontWeight: 600, color: fired ? '#15803d' : 'var(--ink-4)' }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: fired ? '#15803d' : 'var(--ink-4)' }}>
                  {(val * 100).toFixed(0)}%
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

/* ── Precise KPI Tile ───────────────────────────────────────────────── */
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem',
      padding: '0.75rem 1rem', boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontSize: '0.5625rem', color: '#71717A', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.375rem', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: color ?? '#000', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.625rem', color: '#71717A', marginTop: '0.375rem', fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

const ACTION_LABELS: Record<string, string> = {
  switch_supplier:  'Switch to an alternate supplier',
  increase_stock:   'Pre-order additional safety stock',
  expedite:         'Expedite current orders',
  substitute_sku:   'Activate substitute SKUs',
}

/* ── Mitigation Options ───────────────────────────────────────────────── */
function MitigationOptions({
  sim,
  alternates,
  supplierId,
  navigate,
  actionCard,
  onResolved,
  onOptionSelect,
}: {
  sim: MitigationSimulation
  alternates: AlternateSupplierRecord[]
  supplierId: string
  navigate: (path: string, opts?: any) => void
  actionCard: { id: string } | undefined
  onResolved: () => void
  onOptionSelect: (opt: MitigationSimulation['options'][number] | null) => void
}) {
  const queryClient = useQueryClient()
  const [selected, setSelected] = useState<number | null>(null)
  const [showExternal, setShowExternal] = useState(false)
  const [externalNote, setExternalNote] = useState('')
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState(false)
  // Fix 5/7: guard state updates after unmount
  const isMounted = useRef(true)
  useEffect(() => { return () => { isMounted.current = false } }, [])

  const bestIdx = sim.options.reduce(
    (best, opt, i) => opt.exposure_reduction_inr > sim.options[best].exposure_reduction_inr ? i : best, 0
  )

  // Fix 4 + supplier-wide resolution:
  // When the user marks a risk as done, resolve ALL unresolved action cards for that
  // supplier at once — not just the currently displayed card. This ensures the supplier
  // immediately disappears from the dashboard and risks page, because resolvedSupplierIds
  // requires zero unresolved cards per supplier.
  const handleMarkDone = useCallback(async () => {
    if (!actionCard) { setResolved(true); onResolved(); return }
    setResolving(true)
    try {
      // Use the explicitly clicked option, or fall back to the best option that was
      // visually shown as pre-selected (black background) when nothing was clicked.
      const effectiveIdx = selected !== null ? selected : bestIdx
      const selectedOpt = sim.options[effectiveIdx]
      const actionLabel = ACTION_LABELS[selectedOpt.action_type] ?? selectedOpt.action_type
      const noteParts = [
        `Action taken: ${actionLabel}`,
        showExternal ? 'Handled externally' : null,
        externalNote.trim() || null,
      ].filter(Boolean)
      const auditNote = noteParts.length > 0 ? noteParts.join(' — ') : undefined
      // Resolve ALL cards for this supplier so the supplier clears from the risk list
      await api.resolveAllSupplierCards(supplierId, auditNote)
      if (!isMounted.current) return
      setResolved(true)
      // Invalidate every shared query so ALL pages reflect the change immediately
      queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
      queryClient.invalidateQueries({ queryKey: queryKeys.financial })
      queryClient.invalidateQueries({ queryKey: queryKeys.disruptions })
      onResolved()
    } finally {
      if (isMounted.current) setResolving(false)
    }
  }, [actionCard, supplierId, selected, sim.options, showExternal, externalNote, queryClient, onResolved])

  if (resolved) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2.5rem 1rem', textAlign: 'center', gap: '0.75rem' }}>
        <div style={{ width: '52px', height: '52px', borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={26} color="#16a34a" />
        </div>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Action marked as done</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>This has been resolved and will no longer appear in pending actions.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Select one action to take</span>
        <ProvenanceTag type="rule" size="xs" />
      </div>

      {sim.options.map((opt, i) => {
        const isBest = i === bestIdx
        const isSelected = selected === i
        const isSwitch = opt.action_type === 'switch_supplier'
        const label = ACTION_LABELS[opt.action_type] ?? opt.description

        return (
          <div key={i} style={{
            background: isSelected ? '#000' : isBest && selected === null ? '#000' : '#fff',
            border: `1px solid ${isSelected ? '#000' : isBest && selected === null ? '#000' : 'var(--border)'}`,
            borderRadius: '0.5rem', overflow: 'hidden',
            boxShadow: isSelected || (isBest && selected === null) ? '0 4px 12px rgba(0,0,0,0.15)' : 'var(--shadow-sm)',
            position: 'relative', transition: 'all 150ms ease',
            opacity: selected !== null && !isSelected ? 0.45 : 1,
          }}>
            {/* Option header — clickable to select. Fires onOptionSelect so TFEComparison updates */}
            <div
              onClick={() => {
                setSelected(i)
                setShowExternal(false)
                onOptionSelect(sim.options[i])
              }}
              style={{ padding: '0.75rem 1rem', cursor: 'pointer', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}
            >
              {(isBest && selected === null) && (
                <span style={{
                  position: 'absolute', top: '0.625rem', right: '0.75rem',
                  fontSize: '0.45rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                  background: '#059669', color: '#fff', letterSpacing: '0.05em',
                }}>RECOMMENDED</span>
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.25rem' }}>
                  <div style={{
                    width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                    border: `2px solid ${isSelected ? '#fff' : 'var(--border)'}`,
                    background: isSelected ? '#fff' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    {isSelected && <div style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#000' }} />}
                  </div>
                  <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: isSelected || (isBest && selected === null) ? '#fff' : '#000', lineHeight: 1.4, paddingRight: isBest && selected === null ? '5rem' : 0 }}>
                    {label}
                  </h4>
                </div>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.5625rem', color: isSelected || (isBest && selected === null) ? 'rgba(255,255,255,0.5)' : 'var(--ink-4)', flexWrap: 'wrap', paddingLeft: '1.5rem' }}>
                  <span>Reduces exposure by <strong style={{ color: isSelected || (isBest && selected === null) ? '#86efac' : '#059669' }}>−{formatINR(opt.exposure_reduction_inr)}</strong></span>
                  <span>·</span>
                  <span>Cost: <strong style={{ color: isSelected || (isBest && selected === null) ? '#FCA5A5' : '#000' }}>{formatINR(opt.cost_inr)}</strong></span>
                  <span>·</span>
                  <span>{opt.time_to_effect_days}d · {(opt.confidence * 100).toFixed(0)}% conf</span>
                </div>
              </div>
            </div>

            {/* Expanded action area — only for selected option */}
            {isSelected && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)', padding: '0.75rem 1rem' }}>

                {/* Fix 3: no alternates fallback */}
                {isSwitch && alternates.length === 0 && !showExternal && (
                  <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.55)', padding: '0.25rem 0 0.625rem' }}>
                    No alternate suppliers on record for this category. Use "handled externally" below to log what you did.
                  </div>
                )}

                {/* switch_supplier: show alternates */}
                {isSwitch && alternates.length > 0 && !showExternal && (
                  <>
                    <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
                      Choose a supplier to switch to
                    </div>
                    {/* Fix 5: removed the "I've placed the order" shortcut — it bypassed the full
                        order pipeline (no PO, no PDF, no audit trail). Users must go through the
                        supplier detail page → order modal → order summary → return & mark as done.
                        The "handled externally" path below covers out-of-system orders. */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', marginBottom: '0.625rem' }}>
                      {alternates.map(alt => (
                        <button
                          key={alt.alternate_id}
                          onClick={() => navigate(`/alternate-suppliers/${alt.supplier_id}`, { state: { primarySupplierId: supplierId, actionCardId: actionCard?.id } })}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '0.5rem 0.625rem', background: 'rgba(255,255,255,0.08)',
                            border: '1px solid rgba(255,255,255,0.15)', borderRadius: '0.375rem',
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.15)' }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)' }}
                        >
                          <div>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#fff' }}>{alt.supplier_name}</span>
                            <span style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.45)', marginLeft: '0.375rem' }}>
                              {alt.city} · {(alt.quality_score * 100).toFixed(0)}% quality
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                            <span style={{ fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', background: 'rgba(255,255,255,0.15)', color: '#fff' }}>
                              +{alt.cost_premium_pct.toFixed(0)}% cost
                            </span>
                            <ExternalLink size={11} color="rgba(255,255,255,0.4)" />
                          </div>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.4)', fontStyle: 'italic' }}>
                      Select a supplier above to review details and place an order → you'll be able to mark as done after the order is confirmed.
                    </div>
                  </>
                )}

                {/* Non-switch options: single-step Mark as Done — no intermediate confirm */}
                {!isSwitch && !showExternal && (
                  <button
                    onClick={handleMarkDone}
                    disabled={resolving}
                    style={{
                      padding: '0.625rem 1.25rem', background: '#059669', color: '#fff', border: 'none',
                      borderRadius: '6px', fontWeight: 700, fontSize: '0.8125rem', cursor: resolving ? 'wait' : 'pointer',
                      fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem', width: 'fit-content',
                    }}
                  >
                    <CheckCircle2 size={14} />
                    {resolving ? 'Saving…' : 'Mark as Done'}
                  </button>
                )}

                {/* External handling */}
                {!showExternal && (
                  <button
                    onClick={() => setShowExternal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: isSwitch ? '0.375rem' : '0.75rem', fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', padding: 0 }}
                  >
                    <ExternalLink size={11} /> I handled this outside the system
                  </button>
                )}

                {showExternal  && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'rgba(255,255,255,0.7)', fontWeight: 600 }}>
                      <MessageSquare size={13} /> Add a note (optional)
                    </div>
                    <textarea
                      value={externalNote}
                      onChange={e => setExternalNote(e.target.value)}
                      placeholder="e.g. Called supplier directly, confirmed order #PO-2024-891…"
                      rows={2}
                      style={{
                        width: '100%', padding: '0.5rem 0.75rem', borderRadius: '6px',
                        border: '1px solid rgba(255,255,255,0.2)', background: 'rgba(255,255,255,0.08)',
                        color: '#fff', fontSize: '0.75rem', fontFamily: 'inherit', resize: 'none', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button
                        onClick={handleMarkDone}
                        disabled={resolving}
                        style={{
                          padding: '0.5rem 1rem', background: '#059669', color: '#fff', border: 'none',
                          borderRadius: '6px', fontWeight: 700, fontSize: '0.75rem', cursor: resolving ? 'wait' : 'pointer',
                          fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.375rem',
                        }}
                      >
                        <CheckCircle2 size={13} />
                        {resolving ? 'Saving…' : 'Mark as Done'}
                      </button>
                      <button
                        onClick={() => setShowExternal(false)}
                        style={{ padding: '0.5rem 0.75rem', background: 'none', border: '1px solid rgba(255,255,255,0.2)', color: 'rgba(255,255,255,0.6)', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer', fontFamily: 'inherit' }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── TFE Visual Comparison ──────────────────────────────────────────── */
// selectedOption: the option the user has clicked. null = show best-option baseline.
function TFEComparison({ sim, selectedOption }: {
  sim: MitigationSimulation
  selectedOption: MitigationSimulation['options'][number] | null
}) {
  const currentExposure = sim.current_exposure_inr

  // Values update in real time as user selects different options
  const exposureReduction = selectedOption ? selectedOption.exposure_reduction_inr : sim.savings_inr
  const actionCost        = selectedOption ? selectedOption.cost_inr              : sim.mitigation_cost_inr
  const residualExposure  = Math.max(0, currentExposure - exposureReduction)
  const netGain           = exposureReduction - actionCost
  const reductionPct      = currentExposure > 0 ? (exposureReduction / currentExposure) * 100 : 0
  const label             = selectedOption
    ? (ACTION_LABELS[selectedOption.action_type] ?? selectedOption.action_type)
    : 'Best option'

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact Simulation</h3>
        <span style={{ fontSize: '0.5rem', color: selectedOption ? '#059669' : 'var(--ink-4)', fontWeight: 700, maxWidth: '140px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>

      {/* Row 1: current → residual */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ padding: '0.625rem 0.75rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: '#991B1B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Current TFE</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#DC2626', fontFamily: 'monospace' }}>{formatINR(currentExposure)}</div>
        </div>
        <div style={{ padding: '0.625rem 0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Residual Exposure</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#059669', fontFamily: 'monospace', transition: 'all 300ms ease' }}>{formatINR(residualExposure)}</div>
          <div style={{ fontSize: '0.5rem', color: '#166534', marginTop: '1px' }}>after this action</div>
        </div>
      </div>

      {/* Row 2: breakdown — updates per selected option */}
      <div style={{ padding: '0.625rem 0.75rem', background: '#000', borderRadius: '0.375rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Exposure Reduced</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace', transition: 'all 300ms ease' }}>{formatINR(exposureReduction)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Action Cost</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#FCA5A5', fontFamily: 'monospace', transition: 'all 300ms ease' }}>−{formatINR(actionCost)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Net Gain</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: netGain >= 0 ? '#86EFAC' : '#FCA5A5', fontFamily: 'monospace', transition: 'all 300ms ease' }}>{formatINR(Math.abs(netGain))}</div>
          </div>
        </div>
      </div>

      {/* Progress bar — animates on option change */}
      <div style={{ height: '28px', background: 'var(--bg-hover)', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${Math.min(100, reductionPct)}%`,
          background: 'linear-gradient(90deg, #059669, #34D399)',
          transition: 'width 400ms ease',
        }} />
        <div style={{
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.5625rem', fontWeight: 700,
          color: reductionPct > 45 ? '#fff' : '#000',
        }}>
          {reductionPct.toFixed(0)}% EXPOSURE REDUCTION
        </div>
      </div>
    </div>
  )
}

export default function RiskMitigationPlan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const queryClient = useQueryClient()
  const returnState = (location.state as any) ?? {}
  const [sim, setSim] = useState<MitigationSimulation | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [resolved, setResolved] = useState(false)
  // Track which option the user has selected so TFEComparison can reflect it
  const [selectedOption, setSelectedOption] = useState<MitigationSimulation['options'][number] | null>(null)
  const autoResolved = useRef(false)
  // Fix 7: track nav timers so we can cancel them on unmount
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => { return () => { if (navTimer.current) clearTimeout(navTimer.current) } }, [])

  const { data: risks } = useRiskAnalysis()
  const { data: cards } = useProcurementCards()
  const { data: actionData } = useActionCards()
  const { data: cascade } = useQuery({
    queryKey: queryKeys.risk((id ?? '') + '-cascade'),
    queryFn: () => api.getCascadeAnalysis(id!),
    enabled: !!id,
  })
  const { data: altsData } = useQuery({
    queryKey: ['alternates', id],
    queryFn: () => api.getAlternateSuppliersDirect(id!),
    enabled: !!id,
  })

  const runSim = useCallback(async () => {
    if (!id) return
    setSimLoading(true)
    try {
      const result = await api.getMitigationSimulation(id)
      setSim(result)
    } finally {
      setSimLoading(false)
    }
  }, [id])

  if (!id) return null

  const risk = (risks as SupplierRiskAnalysis[] | undefined ?? []).find(r => r.supplier_id === id)
  const card = (cards as IntelligentActionCard[] | undefined ?? []).find(c => c.supplier_id === id)

  // If ALL action cards for this supplier are resolved, redirect to resolution summary
  const supplierActionCards = (actionData?.action_cards ?? []).filter((c: any) => c.supplier_id === id)
  const isSupplierResolved = !resolved
    && supplierActionCards.length > 0
    && supplierActionCards.every((c: any) => c.is_resolved)
  if (isSupplierResolved) {
    const resolvedCard = [...supplierActionCards]
      .filter((c: any) => c.is_resolved)
      .sort((a: any, b: any) => new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime())[0]
    if (resolvedCard) {
      navigate(`/activity/${resolvedCard.id}`, { replace: true })
      return null
    }
  }

  const alternates = (() => {
    const seen = new Set<string>()
    return (altsData?.alternates ?? []).filter(a => {
      if (seen.has(a.supplier_id)) return false
      seen.add(a.supplier_id)
      return true
    }).slice(0, 3)
  })()
  const actionCard = (actionData?.action_cards ?? []).find(a => a.supplier_id === id && !a.is_resolved)

  // Fix 2: auto-resolve when returning from order summary — resolve ALL supplier cards
  // so the supplier clears from dashboard/risks page immediately.
  useEffect(() => {
    if (!returnState.orderPlaced || autoResolved.current) return
    // id (from useParams) is the supplier ID — resolve every card for this supplier
    if (!id) return
    api.resolveAllSupplierCards(id)
      .then(() => {
        autoResolved.current = true   // mark only after success, not before
        setResolved(true)
        queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
        queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
        navTimer.current = setTimeout(() => navigate('/risks'), 2000)
      })
      .catch(() => {
        // leave autoResolved.current = false so it can retry once on remount
      })
  }, [returnState.orderPlaced, id, queryClient, navigate])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

      {/* Order placed banner */}
      {returnState.orderPlaced && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          padding: '0.75rem 1rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
            <CheckCircle2 size={16} color="#16a34a" />
            <div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#166534' }}>
                Order placed — {returnState.supplierName}
              </div>
              <div style={{ fontSize: '0.6875rem', color: '#16a34a', marginTop: '1px' }}>
                {returnState.poNumber} · Marking this risk as resolved…
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Precision Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button onClick={() => navigate(`/risks/${id}`)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px' }}>
            <ChevronLeft size={16} color="#000" />
          </button>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '2px' }}>
              <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Strategic Mitigation</span>
              <Badge level={risk?.risk_level ?? 'neutral'} />
            </div>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1 }}>
              {risk?.supplier_name ?? '…'}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.375rem' }}>
          {resolved && (
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#059669', display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <CheckCircle2 size={12} /> RESOLVED
            </span>
          )}
          <button style={{
            fontSize: '0.6875rem', fontWeight: 700, padding: '0.5rem 0.75rem',
            background: 'none', border: '1px solid var(--border)', borderRadius: '4px', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: '0.25rem'
          }} onClick={() => window.print()}>
            <Printer size={12} /> EXPORT
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
          <StatBox label="Total Exposure" value={card ? formatINR(card.financial_exposure_inr) : '—'} color="#DC2626" />
          <StatBox label="Cascade Depth" value={cascade ? `${cascade.max_depth} Nodes` : '—'} sub={`${cascade?.total_affected ?? 0} affected`} />
          <StatBox label="Revenue At Risk" value={card ? formatINR(card.financial_exposure_inr * 0.4) : '—'} />
          <StatBox label="Signal Confidence" value={risk ? `${(risk.confidence * 100).toFixed(0)}%` : '—'} color="#059669" />
        </div>
        {risk && <WhyThisScore risk={risk} />}
      </div>

      {/* Analysis Suite */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Mitigation Timeline */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)', flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Mitigation Sequence</h3>
              <span style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700 }}>LIVE SIMULATION</span>
            </div>
            
            {!sim ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '2rem 1rem', textAlign: 'center' }}>
                <Zap size={24} style={{ color: 'var(--ink-4)', marginBottom: '0.75rem' }} />
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', maxWidth: '280px', marginBottom: '1rem' }}>
                  Run the simulation to generate a step-by-step mitigation strategy for this supplier.
                </p>
                <button onClick={runSim} disabled={simLoading} style={{
                  background: '#000', color: '#fff', border: 'none', borderRadius: '4px', 
                  padding: '0.5rem 1rem', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}>
                  {simLoading ? 'CALCULATING...' : 'RUN SIMULATION'}
                </button>
              </div>
            ) : (
              <MitigationOptions
                sim={sim}
                alternates={alternates}
                supplierId={id!}
                navigate={navigate}
                actionCard={actionCard}
                onOptionSelect={setSelectedOption}
                onResolved={() => {
                  setResolved(true)
                  queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
                  navTimer.current = setTimeout(() => navigate('/risks'), 2000)
                }}
              />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Comparison — updates live as user selects different options */}
          {sim && <TFEComparison sim={sim} selectedOption={selectedOption} />}

          {/* Strategic Narrative */}
          <div style={{ background: '#fff', border: '1px solid #000', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={12} color="#000" />
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717A' }}>Agent Rationale</span>
              <ProvenanceTag type="ai" size="xs" />
            </div>
            <p style={{ fontSize: '0.6875rem', lineHeight: 1.5, color: '#000', fontWeight: 400 }}>
              {card?.executive_summary ?? 'Executing strategic alignment with secondary supply chain networks to neutralize upstream volatility.'}
            </p>
          </div>
        </div>
      </div>
    </div>
  )
}
