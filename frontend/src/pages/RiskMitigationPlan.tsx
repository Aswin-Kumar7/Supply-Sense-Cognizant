import { useState, useCallback, useEffect, useRef } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Truck,
  Package,
  Calendar,
  Link as LinkIcon,
  Map,
  Printer,
  Activity,
  ShieldCheck,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  MessageSquare,
  RefreshCw,
  Zap,
  Shuffle,
  Scale,
  FileText,
} from 'lucide-react'
import { AiBadge } from '../components/ui/AiBadge'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useProcurementCards, useActionCards } from '../hooks/useQueries'
import { useWeightedRiskAnalysis } from '../hooks/useRiskWeights'

function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 8, background: '#E5E7EB', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
}

import type { SupplierRiskAnalysis, IntelligentActionCard, MitigationSimulation, AlternateSupplierRecord } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`
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

const RISK_COLORS: Record<string, { bg: string, border: string, text: string }> = {
  critical: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626' },
  high:     { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  medium:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' },
  low:      { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' },
}

/* ── Why This Score (collapsible) ───────────────────────────────────── */
function WhyThisScore({ risk }: { risk: SupplierRiskAnalysis }) {
  const [open, setOpen] = useState(false)
  const factors = risk.factors ?? {}
  const activeSignals = Object.entries(SIGNAL_META).filter(([key]) => (factors[key]?.value ?? 0) > 0)

  return (
    <div style={{ borderTop: '1px solid #E2E8F0', marginTop: '12px', paddingTop: '8px' }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          display: 'flex', alignItems: 'center', gap: '6px',
          width: '100%', padding: '8px 0', background: 'none', border: 'none',
          cursor: 'pointer', color: '#64748B', fontSize: '0.6875rem',
          fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
        }}
      >
        {open ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        Why this score?
        <span style={{ marginLeft: 'auto', fontSize: '0.6875rem', fontWeight: 500, color: '#94A3B8' }}>
          {activeSignals.length} active signal{activeSignals.length !== 1 ? 's' : ''}
        </span>
      </button>

      {open && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px', paddingBottom: '12px', paddingTop: '4px', animation: 'fadeIn 0.2s ease-out' }}>
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
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '6px 12px',
                  background: fired ? '#F0FDF4' : '#F8FAFC',
                  border: `1px solid ${fired ? '#86EFAC' : '#E2E8F0'}`,
                  borderRadius: '20px',
                  opacity: fired ? 1 : 0.6,
                  transition: 'all 150ms ease',
                }}
              >
                <Icon size={12} style={{ color: fired ? '#16A34A' : '#64748B' }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: fired ? '#15803D' : '#64748B' }}>
                  {meta.label}
                </span>
                <span style={{ fontSize: '0.75rem', fontWeight: 700, color: fired ? '#16A34A' : '#64748B' }}>
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
    <div className="stat-card" style={{
      background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
      padding: '16px', boxShadow: '0 1px 2px rgba(0, 0, 0, 0.02)',
      display: 'flex', flexDirection: 'column', gap: '4px'
    }}>
      <div style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{label}</div>
      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: color ?? '#0F172A', lineHeight: 1.2, letterSpacing: '-0.02em' }}>{value}</div>
      {sub && <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px', fontWeight: 500 }}>{sub}</div>}
    </div>
  )
}

const ACTION_LABELS: Record<string, string> = {
  switch_supplier:  'Switch to alternate supplier',
  increase_stock:   'Pre-order safety stock buffer',
  expedite:         'Expedite pending purchase orders',
  substitute_sku:   'Activate substitute SKU inventory',
  reorder:          'Place immediate replenishment order',
}

const ACTION_ICONS: Record<string, React.ReactNode> = {
  switch_supplier:  <RefreshCw size={14} style={{ color: '#4F46E5' }} />,
  increase_stock:   <Package size={14} style={{ color: '#10B981' }} />,
  expedite:         <Zap size={14} style={{ color: '#F59E0B' }} />,
  substitute_sku:   <Shuffle size={14} style={{ color: '#EC4899' }} />,
  reorder:          <Package size={14} style={{ color: '#0EA5E9' }} />,
}

const ACTION_DETAILS: Record<string, {
  what: string
  effect: string
  tradeoff: string
}> = {
  switch_supplier: {
    what: 'Stop buying from the current high-risk supplier and shift orders to backup suppliers.',
    effect: 'Cuts maximum risk because the problem supplier is bypassed. Your supply chain no longer depends on them.',
    tradeoff: 'Longer setup time — alternate supplier needs time to accept PO and ship.',
  },
  increase_stock: {
    what: 'Pre-order extra quantities right now to build a physical safety buffer in local warehousing.',
    effect: 'Reduces risk by 40% by buying you more time. Best for short-term disruption.',
    tradeoff: 'Ties up working capital and warehouse space. Doesn\'t fix supplier reliability.',
  },
  expedite: {
    what: 'Rush transit times or expedite processing on orders in progress.',
    effect: 'Quickest execution path (2 days). Reduces risk by 30% immediately.',
    tradeoff: 'Extra logistics premiums and rush fees apply. Core issue remains.',
  },
  substitute_sku: {
    what: 'Switch to a compatible alternate part code or product code currently in stock.',
    effect: 'Zero lead time alternative. Reduces risk by 25% instantly.',
    tradeoff: 'Requires technical check and possible pricing adjustment.',
  },
  reorder: {
    what: 'Place an immediate replenishment purchase order with the current supplier.',
    effect: 'Rebuilds cover quickly when the supplier itself is healthy — the issue is low stock, not the vendor.',
    tradeoff: 'Does nothing if the supplier is the disruption; ties up working capital.',
  },
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
  const isMounted = useRef(true)

  useEffect(() => { return () => { isMounted.current = false } }, [])

  const bestIdx = sim.options.reduce(
    (best, opt, i) => opt.exposure_reduction_inr > sim.options[best].exposure_reduction_inr ? i : best, 0
  )
  // When the AI named a recommended action, highlight that; else fall back to the
  // highest net-saving option computed by the engine.
  const recommendedIdx = sim.recommended_action_type
    ? sim.options.findIndex(o => o.action_type === sim.recommended_action_type)
    : -1
  const highlightIdx = recommendedIdx >= 0 ? recommendedIdx : bestIdx

  const handleMarkDone = useCallback(async () => {
    if (!actionCard) { setResolved(true); onResolved(); return }
    setResolving(true)
    try {
      const effectiveIdx = selected !== null ? selected : highlightIdx
      const selectedOpt = sim.options[effectiveIdx]
      const actionLabel = selectedOpt.title || ACTION_LABELS[selectedOpt.action_type] || selectedOpt.action_type
      const noteParts = [
        `Action taken: ${actionLabel}`,
        showExternal ? 'Handled externally' : null,
        externalNote.trim() || null,
      ].filter(Boolean)
      const auditNote = noteParts.length > 0 ? noteParts.join(' — ') : undefined
      await api.resolveAllSupplierCards(supplierId, auditNote)
      if (!isMounted.current) return
      setResolved(true)
      queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
      queryClient.invalidateQueries({ queryKey: queryKeys.financial })
      queryClient.invalidateQueries({ queryKey: queryKeys.disruptions })
      queryClient.invalidateQueries({ queryKey: queryKeys.stockout })
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement })
      queryClient.invalidateQueries({ queryKey: queryKeys.executiveBrief })
      onResolved()
    } finally {
      if (isMounted.current) setResolving(false)
    }
  }, [actionCard, supplierId, selected, sim.options, showExternal, externalNote, queryClient, onResolved, highlightIdx])

  if (resolved) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 16px', textAlign: 'center', gap: '12px' }}>
        <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid #A7F3D0' }}>
          <CheckCircle2 size={24} color="#059669" />
        </div>
        <div style={{ fontSize: '1rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em' }}>Action Logged</div>
        <div style={{ fontSize: '0.8125rem', color: '#64748B', maxWidth: '300px', lineHeight: 1.5 }}>Mitigation plan has been locked and the supplier profile will clear.</div>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Choose Mitigation Strategy</span>
        {sim.generation_mode && <AiBadge mode={sim.generation_mode} />}
      </div>

      {/* AI plan summary — scenario-specific overview */}
      {sim.plan_summary && (
        <div style={{
          background: 'linear-gradient(135deg, #EEF2FF 0%, #F5F3FF 100%)',
          border: '1px solid #C7D2FE', borderRadius: '10px', padding: '12px 14px',
          fontSize: '0.8125rem', color: '#3730A3', lineHeight: 1.55, fontWeight: 500,
        }}>
          {sim.plan_summary}
        </div>
      )}

      {sim.options.map((opt, i) => {
        const isBest = i === highlightIdx
        const isSelected = selected === i
        const isSwitch = opt.action_type === 'switch_supplier'
        // Prefer the AI's scenario-specific copy; fall back to static labels/details.
        const label = opt.title || ACTION_LABELS[opt.action_type] || opt.description
        const whatText = opt.description || ACTION_DETAILS[opt.action_type]?.what
        const tradeoffText = opt.tradeoff || ACTION_DETAILS[opt.action_type]?.tradeoff

        return (
          <div key={i} style={{
            background: isSelected ? '#F8F9FF' : '#FFFFFF',
            border: `1px solid ${isSelected ? '#4F46E5' : '#E2E8F0'}`,
            borderRadius: '12px', overflow: 'hidden',
            boxShadow: isSelected ? '0 4px 20px rgba(79, 70, 229, 0.08)' : '0 2px 8px rgba(0, 0, 0, 0.02)',
            position: 'relative', transition: 'all 250ms cubic-bezier(0.16, 1, 0.3, 1)',
            opacity: selected !== null && !isSelected ? 0.6 : 1,
          }}>
            {/* Click target wrapper */}
            <div
              onClick={() => {
                setSelected(i)
                setShowExternal(false)
                onOptionSelect(sim.options[i])
              }}
              style={{ padding: '16px', cursor: 'pointer' }}
            >
              {/* Recommended badge */}
              {(isBest && selected === null) && (
                <span style={{
                  position: 'absolute', top: '16px', right: '16px',
                  fontSize: '0.625rem', fontWeight: 800, padding: '2px 8px', borderRadius: '4px',
                  background: '#10B981', color: '#FFFFFF', letterSpacing: '0.04em',
                }}>RECOMMENDED</span>
              )}

              {/* Title row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
                <div style={{
                  width: '16px', height: '16px', borderRadius: '50%', flexShrink: 0,
                  border: `2px solid ${isSelected ? '#4F46E5' : '#CBD5E1'}`,
                  background: 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isSelected && <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4F46E5' }} />}
                </div>
                <span style={{ display: 'flex', alignItems: 'center' }}>
                  {ACTION_ICONS[opt.action_type] ?? <FileText size={14} style={{ color: '#64748B' }} />}
                </span>
                <h4 style={{ 
                  fontSize: '0.875rem', fontWeight: 800, 
                  color: '#0F172A', 
                  lineHeight: 1.3, 
                  margin: 0,
                  paddingRight: isBest && selected === null ? '80px' : '0px' 
                }}>
                  {label}
                </h4>
              </div>

              {/* Description (AI scenario-specific copy, or static fallback) */}
              {whatText && (
                <div style={{ paddingLeft: '24px', marginBottom: '10px' }}>
                  <p style={{ fontSize: '0.8125rem', color: '#475569', lineHeight: 1.5, margin: 0 }}>
                    {whatText}
                  </p>
                  {opt.rationale && (
                    <p style={{ fontSize: '0.75rem', color: '#4F46E5', lineHeight: 1.5, margin: '6px 0 0', fontWeight: 500 }}>
                      Why: {opt.rationale}
                    </p>
                  )}
                </div>
              )}

              {/* 3 key metrics */}
              <div style={{ paddingLeft: '24px', display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '8px' }}>
                <div style={{ 
                  padding: '8px', 
                  background: '#F0FDF4', 
                  borderRadius: '8px', 
                  border: '1px solid #BBF7D0'
                }}>
                  <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#15803D', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Risk Neutralized</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#16A34A', fontFamily: 'monospace' }}>−{formatINR(opt.exposure_reduction_inr)}</div>
                </div>
                <div style={{ 
                  padding: '8px', 
                  background: '#FEF2F2', 
                  borderRadius: '8px', 
                  border: '1px solid #FECACA'
                }}>
                  <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Cost</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#DC2626', fontFamily: 'monospace' }}>{formatINR(opt.cost_inr)}</div>
                </div>
                <div style={{ 
                  padding: '8px', 
                  background: '#F8FAFC', 
                  borderRadius: '8px', 
                  border: '1px solid #E2E8F0'
                }}>
                  <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Lead Time</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>{opt.time_to_effect_days}d</div>
                </div>
              </div>

              {/* Tradeoff */}
              {tradeoffText && (
                <div style={{ paddingLeft: '24px', marginTop: '10px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Scale size={12} style={{ color: '#64748B' }} />
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                    {tradeoffText}
                  </span>
                </div>
              )}
            </div>

            {/* Action flow for selected card */}
            {isSelected && (
              <div style={{ borderTop: '1px solid #E2E8F0', background: '#FFFFFF', padding: '16px' }}>
                {isSwitch && alternates.length === 0 && !showExternal && (
                  <div style={{ fontSize: '0.8125rem', color: '#64748B', paddingBottom: '10px' }}>
                    No backup alternates on file. Use external tracking option below.
                  </div>
                )}

                {isSwitch && alternates.length > 0 && !showExternal && (
                  <>
                    <div style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>
                      Alternate Supplier Options
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '10px' }}>
                      {alternates.map(alt => (
                        <button
                          key={alt.alternate_id}
                          onClick={() => navigate(`/alternate-suppliers/${alt.supplier_id}`, { state: { primarySupplierId: supplierId, actionCardId: actionCard?.id } })}
                          style={{
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: '10px 14px', background: '#FFFFFF',
                            border: '1px solid #E2E8F0', borderRadius: '8px',
                            cursor: 'pointer', textAlign: 'left', width: '100%',
                            transition: 'all 150ms ease'
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; e.currentTarget.style.borderColor = '#CBD5E1' }}
                          onMouseLeave={e => { e.currentTarget.style.background = '#FFFFFF'; e.currentTarget.style.borderColor = '#E2E8F0' }}
                        >
                          <div>
                            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A' }}>{alt.supplier_name}</span>
                            <span style={{ fontSize: '0.75rem', color: '#64748B', marginLeft: '6px' }}>
                              {alt.city} · {(alt.quality_score * 100).toFixed(0)}% quality
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            <span style={{ fontSize: '0.6875rem', fontWeight: 750, padding: '2px 6px', borderRadius: '4px', background: '#FEF2F2', border: '1px solid #FECACA', color: '#DC2626' }}>
                              +{alt.cost_premium_pct.toFixed(0)}% cost
                            </span>
                            <ExternalLink size={12} color="#64748B" />
                          </div>
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', fontStyle: 'italic' }}>
                      Selecting an alternate will redirect to their profile to complete the supply redirection modal.
                    </div>
                  </>
                )}

                {!isSwitch && !showExternal && (() => {
                  const actionRoutes: Record<string, string> = {
                    expedite:       `/risks/${supplierId}/expedite`,
                    increase_stock: `/risks/${supplierId}/increase-stock`,
                    substitute_sku: `/risks/${supplierId}/substitute-skus`,
                  }
                  const route = actionRoutes[opt.action_type]
                  return route ? (
                    <button
                      onClick={() => navigate(route)}
                      style={{
                        padding: '10px 18px', background: '#10B981', color: '#FFFFFF', border: 'none',
                        borderRadius: '6px', fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', gap: '6px', width: 'fit-content',
                        transition: 'all 150ms ease'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#059669'}
                      onMouseLeave={e => e.currentTarget.style.background = '#10B981'}
                    >
                      Go to Order Execution Page →
                    </button>
                  ) : null
                })()}

                {!showExternal && (
                  <button
                    onClick={() => setShowExternal(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: '4px', marginTop: '12px', fontSize: '0.75rem', color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}
                  >
                    <ExternalLink size={12} /> Log manual outside-system resolution
                  </button>
                )}

                {showExternal  && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8125rem', color: '#475569', fontWeight: 600 }}>
                      <MessageSquare size={14} /> Resolution log note
                    </div>
                    <textarea
                      value={externalNote}
                      onChange={e => setExternalNote(e.target.value)}
                      placeholder="Enter PO reference or offline deal details here..."
                      rows={2}
                      style={{
                        width: '100%', padding: '8px 12px', borderRadius: '8px',
                        border: '1px solid #E2E8F0', background: '#FFFFFF',
                        color: '#0F172A', fontSize: '0.8125rem', fontFamily: 'inherit', resize: 'none', outline: 'none',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        onClick={handleMarkDone}
                        disabled={resolving}
                        style={{
                          padding: '8px 16px', background: '#10B981', color: '#FFFFFF', border: 'none',
                          borderRadius: '6px', fontWeight: 700, fontSize: '0.75rem', cursor: resolving ? 'wait' : 'pointer',
                          display: 'flex', alignItems: 'center', gap: '6px',
                        }}
                      >
                        <CheckCircle2 size={14} />
                        {resolving ? 'Logging…' : 'Mark as Done'}
                      </button>
                      <button
                        onClick={() => setShowExternal(false)}
                        style={{ padding: '8px 12px', background: 'none', border: '1px solid #E2E8F0', color: '#64748B', borderRadius: '6px', fontSize: '0.75rem', cursor: 'pointer' }}
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
function TFEComparison({ sim, selectedOption }: {
  sim: MitigationSimulation
  selectedOption: MitigationSimulation['options'][number] | null
}) {
  const currentExposure = sim.current_exposure_inr
  const exposureReduction = selectedOption ? selectedOption.exposure_reduction_inr : sim.savings_inr
  const actionCost        = selectedOption ? selectedOption.cost_inr              : sim.mitigation_cost_inr
  const residualExposure  = Math.max(0, currentExposure - exposureReduction)
  const netGain           = exposureReduction - actionCost
  const reductionPct      = currentExposure > 0 ? (exposureReduction / currentExposure) * 100 : 0
  const label             = selectedOption
    ? (ACTION_LABELS[selectedOption.action_type] ?? selectedOption.action_type)
    : 'Primary recommendation'

  return (
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <h3 style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Impact Projection</h3>
        <span style={{ fontSize: '0.6875rem', color: selectedOption ? '#10B981' : '#64748B', fontWeight: 700, maxWidth: '160px', textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {label}
        </span>
      </div>

      {/* Row 1: current → residual */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '10px' }}>
        <div style={{ padding: '10px 12px', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.625rem', color: '#991B1B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Current Exposure</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#DC2626', fontFamily: 'monospace' }}>{formatINR(currentExposure)}</div>
        </div>
        <div style={{ padding: '10px 12px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '8px' }}>
          <div style={{ fontSize: '0.625rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Residual Exposure</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>{formatINR(residualExposure)}</div>
        </div>
      </div>

      {/* Row 2: breakdown */}
      <div style={{ padding: '12px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Eliminated</div>
            <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace' }}>{formatINR(exposureReduction)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Cost</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#DC2626', fontFamily: 'monospace' }}>−{formatINR(actionCost)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.625rem', color: '#64748B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Net Yield</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: netGain >= 0 ? '#16A34A' : '#DC2626', fontFamily: 'monospace' }}>{netGain >= 0 ? '+' : '−'}{formatINR(Math.abs(netGain))}</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '6px', fontSize: '0.725rem', fontWeight: 700, color: '#475569' }}>
        <span>Mitigation Neutralization</span>
        <span style={{ color: '#16A34A' }}>{reductionPct.toFixed(0)}% exposure neutralized</span>
      </div>
      <div style={{ height: '8px', background: '#F1F5F9', borderRadius: '4px', overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${Math.min(100, reductionPct)}%`,
          background: 'linear-gradient(90deg, #10B981, #34D399)',
          transition: 'width 400ms ease',
        }} />
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
  const [resolved, setResolved] = useState(false)
  const [selectedOption, setSelectedOption] = useState<MitigationSimulation['options'][number] | null>(null)
  const autoResolved = useRef(false)
  const isMounted = useRef(true)
  const navTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    isMounted.current = true
    return () => {
      isMounted.current = false
      if (navTimer.current) clearTimeout(navTimer.current)
    }
  }, [])

  const { data: risks } = useWeightedRiskAnalysis()
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
  const { data: sim, isLoading: simLoading } = useQuery({
    queryKey: queryKeys.risk((id ?? '') + '-mitigation'),
    queryFn: () => api.getMitigationSimulation(id!),
    enabled: !!id,
    staleTime: 300_000,
  })

  if (!id) return null

  const risk = ((risks as SupplierRiskAnalysis[] | undefined) ?? []).find(r => r.supplier_id === id)
  const card = ((cards as IntelligentActionCard[] | undefined) ?? []).find(c => c.supplier_id === id)

  const rColor = risk ? RISK_COLORS[risk.risk_level] || RISK_COLORS.medium : RISK_COLORS.medium

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

  useEffect(() => {
    if (!returnState.orderPlaced || autoResolved.current) return
    if (!id) return
    api.resolveAllSupplierCards(id)
      .then(() => {
        autoResolved.current = true
        queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
        queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
        queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
        queryClient.invalidateQueries({ queryKey: queryKeys.financial })
        queryClient.invalidateQueries({ queryKey: queryKeys.stockout })
        queryClient.invalidateQueries({ queryKey: queryKeys.procurement })
        queryClient.invalidateQueries({ queryKey: queryKeys.executiveBrief })
        if (!isMounted.current) return
        setResolved(true)
        navTimer.current = setTimeout(() => {
          if (isMounted.current) navigate('/risks')
        }, 2000)
      })
  }, [returnState.orderPlaced, id, queryClient, navigate])

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', gap: '16px', 
      maxWidth: '1400px', margin: '0 auto', width: '100%',
      fontFamily: "'Inter', system-ui, sans-serif"
    }}>
      <style>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .stat-card {
          transition: transform 150ms ease, box-shadow 150ms ease;
        }
        .stat-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.04) !important;
        }
        .nav-link {
          color: #64748B;
          transition: color 150ms ease;
          text-decoration: none;
          font-weight: 500;
        }
        .nav-link:hover {
          color: #0F172A;
        }
      `}</style>

      {/* Order placed banner */}
      {returnState.orderPlaced && (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '16px',
          padding: '12px 16px', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '12px',
          animation: 'fadeIn 0.25s ease-out'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <CheckCircle2 size={18} color="#16A34A" />
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#166534' }}>
                Order placed — {returnState.supplierName}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#16A34A', marginTop: '1px' }}>
                {returnState.poNumber} · Clearing risk profile…
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Precision Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
        <div>
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
              className="nav-link"
              style={{ cursor: 'pointer' }}
            >
              Dashboard
            </span>
            <span>/</span>
            <span 
              onClick={() => navigate('/risks')} 
              className="nav-link"
              style={{ cursor: 'pointer' }}
            >
              Risk Analysis
            </span>
            <span>/</span>
            <span 
              onClick={() => navigate(`/risks/${id}`)}
              className="nav-link"
              style={{ cursor: 'pointer' }}
            >
              {risk?.supplier_name ?? <Skeleton w={120} h={16} />}
            </span>
            <span>/</span>
            <span style={{ color: '#0F172A', fontWeight: 700 }}>Mitigation Plan</span>
            {risk && (
              <span style={{ 
                fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
                padding: '2px 8px', borderRadius: '20px', background: rColor.bg, color: rColor.text, border: `1px solid ${rColor.border}`,
                marginLeft: '8px'
              }}>
                {risk.risk_level} Risk
              </span>
            )}
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
              {risk?.supplier_name ?? '…'}
            </h1>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {resolved && (
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#10B981', display: 'flex', alignItems: 'center', gap: '4px', background: '#ECFDF5', padding: '4px 10px', borderRadius: '20px', border: '1px solid #A7F3D0' }}>
              <CheckCircle2 size={12} /> RESOLVED
            </span>
          )}
          <button 
            style={{
              fontSize: '0.75rem', fontWeight: 600, padding: '6px 12px',
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '6px', cursor: 'pointer',
              display: 'flex', alignItems: 'center', gap: '6px', color: '#64748B',
              transition: 'all 150ms ease'
            }} 
            onClick={() => window.print()}
            onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#0F172A' }}
            onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B' }}
          >
            <Printer size={12} /> export
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px' }}>
          <StatBox label="Total Exposure" value={card ? formatINR(card.financial_exposure_inr) : '—'} color="#DC2626" />
          <StatBox label="Cascade Spread" value={cascade ? `${cascade.max_depth} Tiers` : '—'} sub={`${cascade?.total_affected ?? 0} suppliers impacted`} />
          <StatBox label="Revenue At Risk" value={card ? formatINR(card.financial_exposure_inr * 0.4) : '—'} />
          <StatBox label="Alert Reliability" value={risk ? `${(risk.confidence * 100).toFixed(0)}%` : '—'} color="#059669" sub="agreement score" />
        </div>
        {risk && <WhyThisScore risk={risk} />}
      </div>

      {/* Analysis Suite */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: '20px', alignItems: 'start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Recovery Options */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.06em', margin: 0 }}>Recovery Options</h3>
              <span style={{ fontSize: '0.625rem', color: '#10B981', background: '#ECFDF5', padding: '2px 8px', borderRadius: '20px', fontWeight: 700 }}>LIVE SIMULATION</span>
            </div>
            
            {simLoading ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '8px 0' }}>
                {[1,2,3,4].map(i => <div key={i} className="skeleton" style={{ height: 80, borderRadius: '12px' }} />)}
              </div>
            ) : !sim ? (
              <div style={{ padding: '32px 16px', textAlign: 'center', color: '#64748B', fontSize: '0.875rem' }}>
                Could not load recovery options.
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

        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {/* Comparison */}
          {sim && <TFEComparison sim={sim} selectedOption={selectedOption} />}

          {/* Strategic Narrative */}
          <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
              <ShieldCheck size={14} color="#4F46E5" />
              <span style={{ fontSize: '0.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B' }}>Why This Matters</span>
              {card && <AiBadge mode={card.generation_mode} showLabel />}
            </div>
            {card?.executive_summary ? (
              <p style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: '#334155', fontWeight: 500, margin: 0 }}>
                {card.executive_summary}
              </p>
            ) : (
              <p style={{ fontSize: '0.8125rem', lineHeight: 1.6, color: '#94A3B8', fontStyle: 'italic', margin: 0 }}>
                {card?.ai_error
                  ? 'AI analysis unavailable — AWS Bedrock could not be reached. All financial figures above are computed from live DB data.'
                  : card ? 'Awaiting AI analysis…' : 'Loading…'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
