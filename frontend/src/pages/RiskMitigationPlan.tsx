import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { 
  Truck, 
  AlertCircle, 
  Package, 
  Calendar, 
  Link as LinkIcon, 
  Map, 
  User, 
  Clock, 
  Zap, 
  Printer, 
  ChevronLeft,
  Activity,
  ShieldCheck,
  TrendingDown,
  ChevronRight,
  Info
} from 'lucide-react'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useRiskAnalysis, useProcurementCards } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import type { SupplierRiskAnalysis, IntelligentActionCard, MitigationSimulation, AlternateSupplierRecord } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Skeleton({ h = 20, w = '100%' }: { h?: number; w?: string }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 4 }} />
}

const SIGNAL_META: Record<string, { label: string; icon: any; description: string }> = {
  delivery_reliability:    { label: 'Reliability', icon: Truck, description: '30-day performance' },
  disruption_severity:     { label: 'Disruption',   icon: Activity, description: 'Active events' },
  inventory_pressure:      { label: 'Inventory',   icon: Package, description: 'Safety stock levels' },
  festival_proximity:      { label: 'Seasonality',   icon: Calendar, description: 'Upcoming surge' },
  dependency_exposure:     { label: 'Dependency',  icon: LinkIcon, description: 'Tier-2 concentration' },
  logistics_vulnerability: { label: 'Logistics',       icon: Map, description: 'Route exposure' },
}

const STEP_OWNERS: string[] = ['Procurement', 'Logistics', 'Finance', 'Procurement', 'Operations']
const STEP_TIMELINES: string[] = ['24h', '3d', '7d', '14d', '30d']

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

/* ── Signal Analysis Grid ───────────────────────────────────────────── */
function SignalGrid({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = risk.factors ?? {}
  
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '0.5rem' }}>
      {Object.entries(SIGNAL_META).map(([key, meta]) => {
        const factor = factors[key]
        const fired = factor ? factor.value > 0.3 : false
        const val = factor?.value ?? 0
        const Icon = meta.icon

        return (
          <div key={key} style={{
            padding: '0.75rem',
            background: fired ? '#fff' : 'var(--bg-hover)',
            border: `1px solid ${fired ? '#000' : 'var(--border)'}`,
            borderRadius: '0.5rem',
            display: 'flex', flexDirection: 'column', gap: '0.5rem',
            opacity: fired ? 1 : 0.6
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <Icon size={14} style={{ color: fired ? '#000' : 'var(--ink-4)' }} />
              <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: fired ? '#000' : 'var(--ink-4)' }}>
                {fired ? `${(val * 100).toFixed(0)}%` : '0%'}
              </span>
            </div>
            <div>
              <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{meta.label}</div>
              <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', marginTop: '2px' }}>{meta.description}</div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

/* ── Mitigation Steps (Blueprint Style) ──────────────────────────────── */
function MitigationSteps({ sim }: { sim: MitigationSimulation }) {
  return (
    <div style={{ position: 'relative', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Precision vertical guideline */}
      <div style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '1px', background: '#E2E8F0' }} />

      {sim.options.map((opt, i) => (
        <div key={i} style={{ 
          background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', 
          padding: '0.75rem 1rem', boxShadow: 'var(--shadow-sm)',
          position: 'relative'
        }}>
          {/* Connector Dot */}
          <div style={{ 
            position: 'absolute', left: '-1.45rem', top: '1.125rem', 
            width: '7px', height: '7px', borderRadius: '50%', background: '#000', border: '2px solid #fff' 
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  STEP 0{i + 1}
                </span>
                <span style={{ fontSize: '0.5625rem', padding: '1px 5px', borderRadius: '3px', background: 'var(--bg-hover)', color: 'var(--ink-3)', fontWeight: 600 }}>
                  {STEP_OWNERS[i % STEP_OWNERS.length]}
                </span>
                <span style={{ fontSize: '0.5625rem', padding: '1px 5px', borderRadius: '3px', border: '1px solid var(--border)', color: 'var(--ink-2)', fontWeight: 600 }}>
                  <Clock size={8} style={{ marginRight: '3px', display: 'inline' }} /> {STEP_TIMELINES[i % STEP_TIMELINES.length]}
                </span>
              </div>
              <h4 style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000', marginBottom: '0.5rem' }}>
                {opt.description}
              </h4>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '4px', background: 'var(--bg-hover)', borderRadius: '2px', overflow: 'hidden' }}>
                  <div style={{ width: `${(opt.risk_reduction * 100).toFixed(0)}%`, height: '100%', background: '#000' }} />
                </div>
                <span style={{ fontSize: '0.625rem', fontWeight: 700, color: '#059669', fontFamily: 'monospace' }}>
                  −{formatINR(opt.exposure_reduction_inr)}
                </span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '2px' }}>Confidence</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#000' }}>{(opt.confidence * 100).toFixed(0)}%</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

/* ── TFE Visual Comparison ──────────────────────────────────────────── */
function TFEComparison({ sim }: { sim: MitigationSimulation }) {
  const pct = (sim.mitigated_exposure_inr / sim.current_exposure_inr) * 100

  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Impact Simulation</h3>
        <TrendingDown size={14} style={{ color: '#059669' }} />
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', marginBottom: '1rem' }}>
        <div style={{ padding: '0.75rem', background: 'var(--bg-hover)', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Current TFE</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#DC2626' }}>{formatINR(sim.current_exposure_inr)}</div>
        </div>
        <div style={{ padding: '0.75rem', background: 'var(--bg-hover)', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>After Mitigation</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#059669' }}>{formatINR(sim.mitigated_exposure_inr)}</div>
        </div>
        <div style={{ padding: '0.75rem', background: '#000', borderRadius: '0.375rem' }}>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.6)', textTransform: 'uppercase', fontWeight: 700, marginBottom: '2px' }}>Total Saving</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#fff' }}>{formatINR(sim.savings_inr)}</div>
        </div>
      </div>
      <div style={{ height: '32px', background: 'var(--bg-hover)', borderRadius: '16px', overflow: 'hidden', position: 'relative' }}>
        <div style={{ 
          position: 'absolute', left: 0, top: 0, bottom: 0, width: `${pct}%`, 
          background: '#059669', transition: 'width 1s ease' 
        }} />
        <div style={{ 
          position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: '0.625rem', fontWeight: 700, color: pct > 50 ? '#fff' : '#000'
        }}>
          PROJECTED EXPOSURE REDUCTION: {(100 - pct).toFixed(0)}%
        </div>
      </div>
    </div>
  )
}

export default function RiskMitigationPlan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sim, setSim] = useState<MitigationSimulation | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  
  const { data: risks } = useRiskAnalysis()
  const { data: cards } = useProcurementCards()
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
  const alternates = (altsData?.alternates ?? []).slice(0, 3)

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
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.5rem' }}>
        <StatBox label="Total Exposure" value={card ? formatINR(card.financial_exposure_inr) : '—'} color="#DC2626" />
        <StatBox label="Cascade Depth" value={cascade ? `${cascade.max_depth} Nodes` : '—'} sub={`${cascade?.total_affected ?? 0} affected`} />
        <StatBox label="Revenue At Risk" value={card ? formatINR(card.financial_exposure_inr * 0.4) : '—'} />
        <StatBox label="Signal Confidence" value={risk ? `${(risk.confidence * 100).toFixed(0)}%` : '—'} color="#059669" />
      </div>

      {/* Analysis Suite */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '0.5rem' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Signal Matrix */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Detection Matrix</h3>
            {risk ? <SignalGrid risk={risk} /> : <Skeleton h={80} />}
          </div>

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
              <MitigationSteps sim={sim} />
            )}
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {/* Comparison */}
          {sim && <TFEComparison sim={sim} />}

          {/* Alternate Suppliers */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
            <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Recommended Alternates</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {alternates.map(alt => (
                <div key={alt.supplier_id} style={{ padding: '0.75rem', border: '1px solid var(--border)', borderRadius: '0.375rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                    <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#000' }}>{alt.supplier_name}</span>
                    <Badge level={alt.cost_premium_pct < 5 ? 'low' : alt.cost_premium_pct < 15 ? 'medium' : 'high'} label={`+${alt.cost_premium_pct.toFixed(0)}% COST`} />
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.625rem', color: 'var(--ink-4)' }}>
                    <span>{alt.city}, {alt.region}</span>
                    <span>•</span>
                    <span style={{ color: '#059669', fontWeight: 700 }}>{(alt.quality_score * 100).toFixed(0)}% QUALITY</span>
                  </div>
                </div>
              ))}
              <button style={{ 
                width: '100%', padding: '0.625rem', background: '#000', color: '#fff',
                border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', marginTop: '0.25rem',
                transition: 'opacity 150ms ease'
              }}
              onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
              onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
              >
                INITIATE ONBOARDING
              </button>
            </div>
          </div>
          
          {/* Strategic Narrative */}
          <div style={{ background: '#fff', border: '1px solid #000', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.5rem' }}>
              <ShieldCheck size={12} color="#000" />
              <span style={{ fontSize: '0.5625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#71717A' }}>Agent Rationale</span>
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
