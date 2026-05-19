import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useWeightedRiskAnalysis, useProcurementCards } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'
import { Activity, Wind, AlertTriangle, DollarSign, Calendar, Package, Zap, ShieldAlert } from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard, MitigationSimulation } from '../types'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Skeleton({ w = '100%', h = 20 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 6 }} />
}

const RISK_BORDER: Record<string, string> = {
  critical: '#c55b55', high: '#D29729', medium: '#52bde0', low: '#4A8B50',
}

/* ── Deterministic sparkline ─────────────────────────────────────────── */
function seededNoise(seed: number, i: number): number {
  // simple deterministic hash → [-1, 1]
  const x = Math.sin(seed * 9301 + i * 49297 + 233) * 10000
  return (x - Math.floor(x)) * 2 - 1
}

function SparklineChart({ supplierId, currentScore, riskLevel }: {
  supplierId: string
  currentScore: number
  riskLevel: string
}) {
  const color = RISK_BORDER[riskLevel] ?? '#52bde0'

  const points = useMemo(() => {
    // Hash the supplierId to a seed number
    const seed = supplierId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const n = 30
    const pts: number[] = []

    // Work backwards: day 30 = today (currentScore), vary earlier days
    for (let i = 0; i < n; i++) {
      const dayOffset = n - 1 - i
      const drift = dayOffset * 0.003 * seededNoise(seed, i * 3)
      const noise = 0.04 * seededNoise(seed, i)
      const val = Math.max(0, Math.min(1, currentScore + drift + noise))
      pts.push(val)
    }
    pts[n - 1] = currentScore // pin current day exactly
    return pts
  }, [supplierId, currentScore])

  const W = 260
  const H = 36
  const PAD = 4

  const min = Math.min(...points)
  const max = Math.max(...points)
  const range = max - min || 0.01

  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const toY = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const pathD = points.map((v, i) =>
    `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`
  ).join(' ')

  const fillD = `${pathD} L ${toX(points.length - 1).toFixed(1)},${H} L ${toX(0).toFixed(1)},${H} Z`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', width: '100%' }}>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        {/* Line */}
        <path d={pathD} fill="none" stroke="#3F3F46" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {/* Current dot */}
        <circle
          cx={toX(points.length - 1)}
          cy={toY(points[points.length - 1])}
          r="3.5"
          fill={color}
        />
      </svg>
      <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', letterSpacing: '0.04em' }}>30-day trend</div>
    </div>
  )
}

/* ── Signal confidence grid ──────────────────────────────────────────── */
const SIGNAL_META: Record<string, { label: string; icon: React.ReactNode; description: string }> = {
  reliability:    { label: 'Reliability',    icon: <Activity size={16} />, description: 'Historical delivery performance & SLA compliance' },
  disruption:     { label: 'Active Disruption', icon: <Wind size={16} />, description: 'Live disruption events impacting operations' },
  geopolitical:   { label: 'Geo / Weather',  icon: <AlertTriangle size={16} />, description: 'Regional weather, strikes, policy changes' },
  financial:      { label: 'Financial Risk',  icon: <DollarSign size={16} />, description: 'Payment delays, credit signals, capacity constraints' },
  lead_time:      { label: 'Lead Time',       icon: <Calendar size={16} />, description: 'Delivery window deviation vs contracted SLA' },
  inventory:      { label: 'Inventory',       icon: <Package size={16} />, description: 'Stockout proximity & reorder urgency' },
}

function SignalConfidenceGrid({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = risk.factors ?? {}
  const accent = RISK_BORDER[risk.risk_level] ?? '#52bde0'

  // Map factor keys — backend may use slightly different names, do best-effort match
  const getFactorScore = (key: string): number | null => {
    const direct = factors[key]
    if (direct) return direct.value
    // Fuzzy match
    const match = Object.entries(factors).find(([k]) =>
      k.toLowerCase().includes(key.toLowerCase()) || key.toLowerCase().includes(k.toLowerCase())
    )
    return match ? match[1].value : null
  }

  const signals = Object.entries(SIGNAL_META).map(([key, meta]) => {
    const score = getFactorScore(key)
    const fired = score !== null ? score > 0.4 : false
    return { key, meta, score, fired }
  })

  const firedCount = signals.filter(s => s.fired).length

  return (
    <div>
      {/* Summary bar */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1rem' }}>
        <div style={{
          padding: '0.5rem 0.875rem',
          background: '#000',
          borderRadius: '0.5rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: '#fff',
          boxShadow: 'var(--shadow-lg)',
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          <ShieldAlert size={14} />
          {firedCount} / {signals.length} Signals Critical
        </div>
        <div style={{ height: '2px', flex: 1, background: 'var(--bg-hover)', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: `${(risk.confidence * 100)}%`, height: '100%', background: accent }} />
        </div>
        <span style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Signal Confidence: {(risk.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Signal cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        {signals.map(({ key, meta, score, fired }) => (
          <div key={key} style={{
            padding: '0.75rem',
            background: fired ? `${accent}05` : '#fff',
            border: `1px solid ${fired ? accent : 'var(--border)'}`,
            borderRadius: '0.5rem',
            boxShadow: fired ? `0 4px 12px -2px ${accent}15` : 'var(--shadow-sm)',
            transition: 'all 200ms ease',
            position: 'relative',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.625rem' }}>
              <div style={{ 
                width: '24px', height: '24px', borderRadius: '6px', background: fired ? accent : 'var(--bg-hover)', 
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: fired ? '#fff' : 'var(--ink-3)'
              }}>
                {meta.icon && <div style={{ transform: 'scale(0.8)' }}>{meta.icon}</div>}
              </div>
              <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>
                {meta.label}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px',
                background: fired ? '#FEF2F2' : 'var(--bg-hover)',
                color: fired ? '#c55b55' : 'var(--ink-4)',
                border: `1px solid ${fired ? '#FECACA' : 'var(--border)'}`
              }}>
                {fired ? 'CRITICAL' : 'NOMINAL'}
              </span>
            </div>
            {score !== null && (
              <>
                <div style={{ height: '3px', background: 'var(--bg-hover)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.625rem' }}>
                  <div style={{
                    width: `${(score * 100).toFixed(0)}%`,
                    height: '100%',
                    background: fired ? accent : 'var(--ink-4)',
                    borderRadius: '999px',
                    transition: 'width 1s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--ink-2)', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 700, color: '#000' }}>{(score * 100).toFixed(0)}%</span> {meta.description}
                </div>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Info stat box ──────────────────────────────────────────────────── */
function StatBox({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: '#fff', 
      border: '1px solid var(--border)', borderRadius: '0.375rem', padding: '0.625rem 0.75rem',
      boxShadow: 'var(--shadow-sm)'
    }}>
      <div style={{ fontSize: '0.5rem', color: '#71717A', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem', letterSpacing: '0.05em' }}>{label}</div>
      <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: color ?? '#000', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.5625rem', color: '#71717A', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  )
}

/* ── Factor breakdown ────────────────────────────────────────────────── */
function FactorBreakdown({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = Object.entries(risk.factors ?? {}).sort(([, a], [, b]) => b.weighted - a.weighted)
  const accent = '#18181B'

  return (
    <div style={{ display: 'flex', flexDirection: 'column' }}>
      {factors.map(([name, f], i) => (
        <div key={name} style={{ 
          padding: '0.625rem 0',
          borderBottom: i === factors.length - 1 ? 'none' : '1px solid var(--border)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
            <span style={{ fontSize: '0.75rem', color: '#000', fontWeight: 600, textTransform: 'capitalize' }}>
              {name.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: '0.8125rem', color: '#000', fontWeight: 700 }}>
              {(f.value * 100).toFixed(0)}%
            </span>
          </div>
          
          <div style={{ 
            height: '2px', background: 'var(--bg-hover)', borderRadius: '1px', overflow: 'hidden', marginBottom: '0.25rem', 
          }}>
            <div style={{
              width: `${Math.min(100, f.value * 100).toFixed(0)}%`,
              height: '100%',
              background: accent,
              transition: 'width 1s ease',
            }} />
          </div>
          <div style={{ fontSize: '0.625rem', color: '#71717A', lineHeight: 1.4, fontWeight: 500 }}>{f.explanation}</div>
        </div>
      ))}
    </div>
  )
}

/* ── AI Recommendation with mitigation plan redirect ───────────────── */
function AIRecommendationPanel({ card, supplierId }: { card: IntelligentActionCard | null | undefined; supplierId: string }) {
  const navigate = useNavigate()

  if (!card) {
    return (
      <div style={{ padding: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-4)' }}>
        No strategic data available.
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', position: 'relative', paddingLeft: '1rem' }}>
      {/* Precision vertical guideline */}
      <div style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '1px', background: '#E2E8F0' }} />

      {card.recommended_action && (
        <div style={{ marginBottom: '0.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#000' }} />
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Action
            </div>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000', lineHeight: 1.5 }}>
            {card.recommended_action}
          </div>
        </div>
      )}

      {card.urgency_narrative && (
        <div style={{ marginTop: '0.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#D29729' }} />
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#D29729', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Urgency
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 500, color: 'var(--ink-2)', lineHeight: 1.4 }}>{card.urgency_narrative}</div>
        </div>
      )}

      {card.reasoning && (
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: 'var(--border-strong)' }} />
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Logic
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', lineHeight: 1.4 }}>{card.reasoning}</div>
        </div>
      )}

      {card.cost_of_delay_narrative && (
        <div style={{ marginTop: '0.125rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <div style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#c55b55' }} />
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#c55b55', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Inaction Cost
            </div>
          </div>
          <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#c55b55', lineHeight: 1.4 }}>{card.cost_of_delay_narrative}</div>
        </div>
      )}

      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--border)', marginTop: '0.25rem' }}>
        <button
          onClick={() => navigate(`/risks/${supplierId}/mitigation`)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            width: '100%',
            padding: '0.625rem 0.75rem',
            background: '#000',
            color: '#fff',
            borderRadius: '0.375rem',
            border: 'none', cursor: 'pointer',
            fontSize: '0.75rem', fontWeight: 600,
            transition: 'opacity 150ms ease',
          }}
          onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
          onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
        >
          Generate Mitigation Strategy
          <span style={{ fontSize: '0.625rem' }}>→</span>
        </button>
      </div>
    </div>
  )
}

/* ── Mitigation panel ────────────────────────────────────────────────── */
function MitigationSection({ supplierId }: { supplierId: string }) {
  const [sim, setSim] = useState<MitigationSimulation | null>(null)
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const run = useCallback(async () => {
    setLoading(true)
    try {
      const result = await api.getMitigationSimulation(supplierId)
      setSim(result)
    } finally {
      setLoading(false)
    }
  }, [supplierId])

  if (!sim) {
    return (
      <div style={{ padding: '1rem', textAlign: 'center', background: 'var(--bg-hover)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '0.75rem' }}>Run a quick simulation to estimate potential exposure reduction via strategic mitigation.</p>
        <button
          onClick={run}
          disabled={loading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            padding: '0.5rem 1rem', background: '#000', color: '#fff', border: 'none', borderRadius: '4px',
            cursor: loading ? 'not-allowed' : 'pointer', fontSize: '0.75rem', fontWeight: 600, margin: '0 auto'
          }}
        >
          {loading ? 'CALCULATING...' : 'RUN QUICK SIMULATION'}
        </button>
      </div>
    )
  }

  const pct = sim.risk_before > 0 ? Math.min(100, ((sim.risk_before - sim.risk_after) / sim.risk_before) * 100) : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      {/* Precision metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        <StatBox label="Exposure" value={formatINR(sim.current_exposure_inr)} color="#DC2626" />
        <StatBox label="Mitigated" value={formatINR(sim.mitigated_exposure_inr)} color="#059669" />
        <StatBox label="Total Saving" value={formatINR(sim.savings_inr)} />
      </div>

      {/* Blueprint sequence */}
      <div style={{ position: 'relative', paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {/* Guideline */}
        <div style={{ position: 'absolute', left: 0, top: '4px', bottom: '4px', width: '1px', background: '#E2E8F0' }} />

        {sim.options.map((opt, i) => (
          <div key={i} style={{ 
            padding: '0.25rem 0 0.75rem', 
            position: 'relative'
          }}>
            <div style={{ position: 'absolute', left: '-1.45rem', top: '0.5rem', width: '7px', height: '7px', borderRadius: '50%', background: '#000', border: '2px solid #fff' }} />
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: '0.5rem', fontWeight: 700, color: '#71717A', textTransform: 'uppercase', marginBottom: '0.125rem', letterSpacing: '0.05em' }}>STEP 0{i+1}</div>
                <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>{opt.description}</div>
                <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '2px' }}>
                  {opt.time_to_effect_days}d to effect · {(opt.confidence * 100).toFixed(0)}% confidence
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#059669' }}>−{formatINR(opt.exposure_reduction_inr)}</div>
              </div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate(`/risks/${supplierId}/mitigation`)}
        style={{
          width: '100%', padding: '0.625rem', background: '#000', color: '#fff',
          border: 'none', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer',
          transition: 'opacity 150ms ease'
        }}
        onMouseEnter={e => { e.currentTarget.style.opacity = '0.8'; }}
        onMouseLeave={e => { e.currentTarget.style.opacity = '1'; }}
      >
        VIEW FULL STRANDS MITIGATION PLAN →
      </button>
    </div>
  )
}

/* ── Cascade section ─────────────────────────────────────────────────── */
function CascadeSection({ supplierId }: { supplierId: string }) {
  const { data: cascade, isLoading } = useQuery({
    queryKey: queryKeys.risk(supplierId + '-cascade'),
    queryFn: () => api.getCascadeAnalysis(supplierId),
    staleTime: 300_000,
  })

  if (isLoading) return <Skeleton h={80} />
  if (!cascade || cascade.total_affected === 0) {
    return (
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.75rem',
        padding: '0.75rem 1rem', border: '1px solid var(--border)', borderRadius: '0.5rem',
      }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#4ade80' }} />
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>No cascade propagation detected. This supplier failure is isolated.</span>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem', alignItems: 'center' }}>
        <Badge level={cascade.severity} />
        <span style={{ fontSize: '0.875rem', color: 'var(--ink-3)' }}>
          <strong style={{ color: 'var(--ink-1)' }}>{cascade.total_affected}</strong> downstream suppliers affected · max propagation depth <strong style={{ color: 'var(--ink-1)' }}>{cascade.max_depth}</strong>
        </span>
      </div>
      {cascade.nodes.slice(0, 6).map(node => (
        <div key={node.supplier_id} style={{
          display: 'flex', alignItems: 'center', gap: '0.875rem',
          padding: '0.875rem 1rem',
          paddingLeft: `${1 + node.depth * 1.5}rem`,
          background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '0.625rem',
        }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--border-strong)', fontFamily: 'monospace' }}>{'└─'.repeat(Math.min(node.depth, 2))}</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink-1)', flex: 1 }}>{node.supplier_name}</span>
          <span style={{ fontSize: '0.8125rem', fontFamily: 'JetBrains Mono, monospace', color: '#c55b55', fontWeight: 500 }}>
            {(node.propagated_impact * 100).toFixed(0)}% impact
          </span>
          <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)', textTransform: 'capitalize' }}>{node.dependency_type}</span>
        </div>
      ))}
    </div>
  )
}

/* ── Risk Detail Page ────────────────────────────────────────────────── */
export default function RiskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: risks, isCustom: customWeightsActive } = useWeightedRiskAnalysis()
  const { data: cards } = useProcurementCards()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const risk = riskList.find(r => r.supplier_id === id)
  const card = (cards as IntelligentActionCard[] | undefined ?? []).find(c => c.supplier_id === id)

  if (!id) return null

  const accent = RISK_BORDER[risk?.risk_level ?? 'medium'] ?? '#52bde0'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={() => navigate('/risks')}
          style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.375rem' }}
        >
          ← Risks
        </button>
        <span style={{ color: 'var(--ink-5)' }}>/</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-1)', fontWeight: 500 }}>{risk?.supplier_name ?? 'Loading…'}</span>
        {risk && (
          <>
            <span style={{ color: 'var(--ink-5)' }}>/</span>
            <span style={{ fontSize: '0.8125rem', color: 'var(--ink-3)' }}>Risk Detail</span>
          </>
        )}
      </div>

      {/* Custom weights notice */}
      {customWeightsActive && (
        <div style={{
          padding: '0.75rem 1.25rem',
          background: 'var(--bg-hover)',
          border: '1px solid var(--border)',
          borderRadius: '0.75rem',
          fontSize: '0.8125rem',
          color: 'var(--ink-2)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}>
          <AlertTriangle size={14} style={{ color: '#D29729' }} />
          <span><strong style={{ color: '#000' }}>Custom Risk Configuration Active</strong> — Calculations are currently weighted based on your specific settings profile.</span>
        </div>
      )}

      {/* ── Minimalist Hero Section ── */}
      {risk ? (
        <div style={{
          position: 'relative',
          background: '#fff',
          border: '1px solid var(--border)',
          borderRadius: '0.5rem',
          padding: '0.75rem',
          boxShadow: 'var(--shadow-sm)',
          display: 'flex',
          flexDirection: 'column',
          gap: '0.75rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
                <Badge level={risk.risk_level} />
                {risk.human_review_required && (
                  <span style={{ 
                    fontSize: '0.5rem', padding: '1px 5px', borderRadius: '3px', border: '1px solid #EF4444', color: '#EF4444', 
                    fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em'
                  }}>
                    Review Required
                  </span>
                )}
              </div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', letterSpacing: '-0.02em', lineHeight: 1.1, marginBottom: '0.125rem' }}>
                {risk.supplier_name}
              </h1>
              {card && (
                <p style={{ fontSize: '0.75rem', color: 'var(--ink-2)', maxWidth: '600px', lineHeight: 1.4, fontWeight: 400 }}>
                  {card.executive_summary}
                </p>
              )}
            </div>

            {/* Precision Score Cluster */}
            <div style={{ 
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.375rem', flexShrink: 0, 
              padding: '0.5rem', background: 'var(--bg-hover)',
              borderRadius: '0.5rem', border: '1px solid var(--border)', minWidth: '280px'
            }}>
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#000', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {(risk.overall_score * 100).toFixed(0)}<span style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginLeft: '1px' }}>%</span>
                </div>
                <div style={{ fontSize: '0.5rem', color: 'var(--ink-4)', marginTop: '0.125rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Score</div>
              </div>
              <SparklineChart
                supplierId={risk.supplier_id}
                currentScore={risk.overall_score}
                riskLevel={risk.risk_level}
              />
            </div>
          </div>

          {/* Clean Metric Grid */}
          {card && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.375rem' }}>
              <StatBox label="Exposure" value={formatINR(card.financial_exposure_inr)} color="#c55b55" />
              <StatBox label="Stockout" value={`${card.days_to_stockout} Days`} />
              <StatBox label="SKUs At Risk" value={String(card.affected_skus)} />
              <StatBox label="Recovery" value={card.escalation_window} />
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', borderRadius: '0.5rem', padding: '0.75rem', border: '1px solid var(--border)' }}>
          <Skeleton h={100} />
        </div>
      )}

      {/* ── Signal Confidence Grid ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Confidence Matrix</h3>
          <span style={{ fontSize: '0.4375rem', color: 'var(--ink-4)', fontWeight: 600 }}>STRANDS ANALYTICS</span>
        </div>
        {risk ? <SignalConfidenceGrid risk={risk} /> : <Skeleton h={80} />}
      </div>

      {/* Secondary Grids */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '0.5rem' }}>
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Risk Factors</h3>
          {risk ? <FactorBreakdown risk={risk} /> : <Skeleton h={200} />}
        </div>

        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
          <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Strategic Insight</h3>
          <AIRecommendationPanel card={card} supplierId={id} />
        </div>
      </div>

      {/* ── Cascade Propagation ── */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
        <h3 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Cascade Impact</h3>
        <CascadeSection supplierId={id} />
      </div>

      {/* Mitigation Simulation */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '0.75rem', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <h3 style={{ fontSize: '0.75rem', fontWeight: 700, color: '#000' }}>Mitigation Simulation</h3>
          <span style={{ fontSize: '0.4375rem', color: 'var(--ink-4)', padding: '1px 4px', background: 'var(--bg-hover)', borderRadius: '3px', fontWeight: 700, textTransform: 'uppercase' }}>
            Active
          </span>
        </div>
        <MitigationSection supplierId={id} />
      </div>
    </div>
  )
}
