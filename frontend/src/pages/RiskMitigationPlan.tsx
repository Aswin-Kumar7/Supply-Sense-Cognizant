import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
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
  ChevronRight,
  Activity,
  ShieldCheck,
  TrendingDown,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
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
}: {
  sim: MitigationSimulation
  alternates: AlternateSupplierRecord[]
  supplierId: string
  navigate: (path: string, opts?: any) => void
}) {
  const bestIdx = sim.options.reduce(
    (best, opt, i) => opt.exposure_reduction_inr > sim.options[best].exposure_reduction_inr ? i : best,
    0
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
        <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Choose one action</span>
        <ProvenanceTag type="rule" size="xs" />
      </div>

      {sim.options.map((opt, i) => {
        const isBest = i === bestIdx
        const isSwitch = opt.action_type === 'switch_supplier'
        const label = ACTION_LABELS[opt.action_type] ?? opt.description

        return (
          <div key={i} style={{
            background: isBest ? '#000' : '#fff',
            border: `1px solid ${isBest ? '#000' : 'var(--border)'}`,
            borderRadius: '0.5rem',
            overflow: 'hidden',
            boxShadow: isBest ? '0 4px 12px rgba(0,0,0,0.15)' : 'var(--shadow-sm)',
            position: 'relative',
          }}>
            {isBest && (
              <span style={{
                position: 'absolute', top: '0.625rem', right: '0.75rem',
                fontSize: '0.45rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                background: '#059669', color: '#fff', letterSpacing: '0.05em',
              }}>RECOMMENDED</span>
            )}

            {/* Option header */}
            <div style={{ padding: '0.75rem 1rem', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: isBest ? '#fff' : '#000', marginBottom: '0.25rem', lineHeight: 1.4, paddingRight: isBest ? '5rem' : 0 }}>
                  {label}
                </h4>
                <div style={{ display: 'flex', gap: '0.75rem', fontSize: '0.5625rem', color: isBest ? 'rgba(255,255,255,0.5)' : 'var(--ink-4)', flexWrap: 'wrap' }}>
                  <span>Reduces exposure by <strong style={{ color: isBest ? '#86efac' : '#059669' }}>−{formatINR(opt.exposure_reduction_inr)}</strong></span>
                  <span>·</span>
                  <span>Cost: <strong style={{ color: isBest ? '#FCA5A5' : '#000' }}>{formatINR(opt.cost_inr)}</strong></span>
                  <span>·</span>
                  <span>{opt.time_to_effect_days}d · {(opt.confidence * 100).toFixed(0)}% conf</span>
                </div>
              </div>
            </div>

            {/* Inline alternate suppliers for switch_supplier */}
            {isSwitch && alternates.length > 0 && (
              <div style={{
                borderTop: isBest ? '1px solid rgba(255,255,255,0.12)' : '1px solid var(--border)',
                background: isBest ? 'rgba(255,255,255,0.05)' : '#FAFAFA',
                padding: '0.5rem 0.75rem',
              }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 700, color: isBest ? 'rgba(255,255,255,0.4)' : 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.375rem' }}>
                  Available suppliers to switch to
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                  {alternates.map(alt => (
                    <button
                      key={alt.alternate_id}
                      onClick={() => navigate(`/alternate-suppliers/${alt.supplier_id}`, { state: { primarySupplierId: supplierId } })}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                        padding: '0.5rem 0.625rem',
                        background: isBest ? 'rgba(255,255,255,0.08)' : '#fff',
                        border: `1px solid ${isBest ? 'rgba(255,255,255,0.15)' : 'var(--border)'}`,
                        borderRadius: '0.375rem',
                        cursor: 'pointer', textAlign: 'left', width: '100%',
                        transition: 'background 120ms ease',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.background = isBest ? 'rgba(255,255,255,0.15)' : '#F4F4F5' }}
                      onMouseLeave={e => { e.currentTarget.style.background = isBest ? 'rgba(255,255,255,0.08)' : '#fff' }}
                    >
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: isBest ? '#fff' : '#000' }}>{alt.supplier_name}</span>
                        <span style={{ fontSize: '0.5625rem', color: isBest ? 'rgba(255,255,255,0.45)' : 'var(--ink-4)', marginLeft: '0.375rem' }}>
                          {alt.city} · {(alt.quality_score * 100).toFixed(0)}% quality
                        </span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexShrink: 0 }}>
                        <span style={{
                          fontSize: '0.5rem', fontWeight: 700, padding: '2px 6px', borderRadius: '4px',
                          background: isBest ? 'rgba(255,255,255,0.15)' : '#F4F4F5',
                          color: isBest ? '#fff' : '#000',
                        }}>+{alt.cost_premium_pct.toFixed(0)}% cost</span>
                        <ChevronRight size={11} style={{ color: isBest ? 'rgba(255,255,255,0.4)' : 'var(--ink-4)' }} />
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

/* ── TFE Visual Comparison ──────────────────────────────────────────── */
function TFEComparison({ sim }: { sim: MitigationSimulation }) {
  // Identity: current = mitigated + savings (gross reduction)
  // savings = mitigated_cost + net_saving
  const residualPct  = (sim.mitigated_exposure_inr / sim.current_exposure_inr) * 100
  const reductionPct = 100 - residualPct

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact Simulation</h3>
        <TrendingDown size={14} style={{ color: '#059669' }} />
      </div>

      {/* Row 1: current → residual */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ padding: '0.625rem 0.75rem', background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: '#991B1B', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Current TFE</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#DC2626', fontFamily: 'monospace' }}>{formatINR(sim.current_exposure_inr)}</div>
        </div>
        <div style={{ padding: '0.625rem 0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: '#166534', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Residual Exposure</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>{formatINR(sim.mitigated_exposure_inr)}</div>
          <div style={{ fontSize: '0.5rem', color: '#166534', marginTop: '1px' }}>after best action</div>
        </div>
      </div>

      {/* Row 2: gross reduction breakdown */}
      <div style={{ padding: '0.625rem 0.75rem', background: '#000', borderRadius: '0.375rem', marginBottom: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Exposure Reduced</div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>{formatINR(sim.savings_inr)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Action Cost</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#FCA5A5', fontFamily: 'monospace' }}>−{formatINR(sim.mitigation_cost_inr)}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.5)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Net Gain</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#86EFAC', fontFamily: 'monospace' }}>{formatINR(sim.net_saving_inr)}</div>
          </div>
        </div>
      </div>

      {/* Progress bar */}
      <div style={{ height: '28px', background: 'var(--bg-hover)', borderRadius: '6px', overflow: 'hidden', position: 'relative' }}>
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${reductionPct}%`,
          background: 'linear-gradient(90deg, #059669, #34D399)',
          transition: 'width 1s ease',
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
  const queryClient = useQueryClient()
  const [sim, setSim] = useState<MitigationSimulation | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [resolving, setResolving] = useState(false)
  const [resolved, setResolved] = useState(false)

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

  const handleResolve = useCallback(async (actionCardId: string) => {
    setResolving(true)
    try {
      await api.resolveActionCard(actionCardId)
      setResolved(true)
      queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
    } finally {
      setResolving(false)
    }
  }, [queryClient])

  if (!id) return null

  const risk = (risks as SupplierRiskAnalysis[] | undefined ?? []).find(r => r.supplier_id === id)
  const card = (cards as IntelligentActionCard[] | undefined ?? []).find(c => c.supplier_id === id)
  const alternates = (() => {
    const seen = new Set<string>()
    return (altsData?.alternates ?? []).filter(a => {
      if (seen.has(a.supplier_id)) return false
      seen.add(a.supplier_id)
      return true
    }).slice(0, 3)
  })()
  const actionCard = (actionData?.action_cards ?? []).find(a => a.supplier_id === id && !a.is_resolved)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      
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
          {actionCard && !resolved && (
            <button
              onClick={() => handleResolve(actionCard.id)}
              disabled={resolving}
              style={{
                fontSize: '0.6875rem', fontWeight: 700, padding: '0.5rem 0.75rem',
                background: resolving ? 'var(--bg-hover)' : '#000', color: resolving ? 'var(--ink-3)' : '#fff',
                border: 'none', borderRadius: '4px', cursor: resolving ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: '0.25rem', transition: 'opacity 150ms',
              }}
            >
              <CheckCircle2 size={12} /> {resolving ? 'SAVING...' : 'MARK AS DONE'}
            </button>
          )}
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
              <span style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700 }}>STRANDS v2.4</span>
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
              <MitigationOptions sim={sim} alternates={alternates} supplierId={id!} navigate={navigate} />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Comparison */}
          {sim && <TFEComparison sim={sim} />}

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
