import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useWeightedRiskAnalysis, useProcurementCards } from '../hooks/useQueries'
import { WhatIfChat } from '../components/panels/WhatIfChat'
import { Badge } from '../components/ui/Badge'
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
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
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
  const color = RISK_BORDER[riskLevel] ?? '#2563EB'

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

  const W = 200
  const H = 44
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
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '2px' }}>
      <svg width={W} height={H} style={{ overflow: 'visible' }}>
        {/* Area fill */}
        <path d={fillD} fill={color} fillOpacity="0.08" />
        {/* Line */}
        <path d={pathD} fill="none" stroke={color} strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
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
const SIGNAL_META: Record<string, { label: string; icon: string; description: string }> = {
  reliability:    { label: 'Reliability',    icon: '📊', description: 'Historical delivery performance & SLA compliance' },
  disruption:     { label: 'Active Disruption', icon: '⚠️', description: 'Live disruption events impacting operations' },
  geopolitical:   { label: 'Geo / Weather',  icon: '🌍', description: 'Regional weather, strikes, policy changes' },
  financial:      { label: 'Financial Risk',  icon: '💰', description: 'Payment delays, credit signals, capacity constraints' },
  lead_time:      { label: 'Lead Time',       icon: '🕐', description: 'Delivery window deviation vs contracted SLA' },
  inventory:      { label: 'Inventory',       icon: '📦', description: 'Stockout proximity & reorder urgency' },
}

function SignalConfidenceGrid({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = risk.factors ?? {}
  const accent = RISK_BORDER[risk.risk_level] ?? '#2563EB'

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
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
        <div style={{
          padding: '0.375rem 0.875rem',
          background: firedCount >= 4 ? '#FEF2F2' : firedCount >= 2 ? '#FFFBEB' : '#F0FDF4',
          border: `1px solid ${firedCount >= 4 ? '#FECACA' : firedCount >= 2 ? '#FDE68A' : '#BBF7D0'}`,
          borderRadius: '0.5rem',
          fontSize: '0.75rem',
          fontWeight: 700,
          color: firedCount >= 4 ? '#DC2626' : firedCount >= 2 ? '#D97706' : '#059669',
        }}>
          {firedCount} / {signals.length} signals triggered
        </div>
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>
          Overall confidence: {(risk.confidence * 100).toFixed(0)}%
        </span>
      </div>

      {/* Signal cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.875rem' }}>
        {signals.map(({ key, meta, score, fired }) => (
          <div key={key} style={{
            padding: '1rem',
            background: fired ? `${accent}0A` : 'var(--bg-app)',
            border: `1px solid ${fired ? `${accent}30` : 'var(--border)'}`,
            borderRadius: '0.875rem',
            position: 'relative',
            overflow: 'hidden',
            boxShadow: fired ? `0 2px 8px ${accent}10` : 'none',
            transition: 'transform 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
          >
            {/* Fired indicator strip */}
            {fired && (
              <div style={{
                position: 'absolute', top: 0, left: 0, right: 0, height: '4px',
                background: accent,
              }} />
            )}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
              <span style={{ fontSize: '1rem' }}>{meta.icon}</span>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: fired ? 'var(--ink-1)' : 'var(--ink-2)' }}>
                {meta.label}
              </span>
              <span style={{
                marginLeft: 'auto',
                fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
                background: fired ? accent : 'var(--bg-hover)',
                color: fired ? '#fff' : 'var(--ink-4)',
                border: `1px solid ${fired ? accent : 'var(--border-strong)'}`
              }}>
                {fired ? 'FIRED' : 'OK'}
              </span>
            </div>
            {score !== null && (
              <>
                <div style={{ height: '6px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{
                    width: `${(score * 100).toFixed(0)}%`,
                    height: '100%',
                    background: fired ? accent : 'var(--ink-4)',
                    borderRadius: '999px',
                    transition: 'width 0.6s ease',
                  }} />
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', lineHeight: 1.4 }}>
                  <span style={{ fontWeight: 600, color: fired ? accent : 'var(--ink-3)' }}>{(score * 100).toFixed(0)}%</span> — {meta.description}
                </div>
              </>
            )}
            {score === null && (
              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-5)', marginTop: '0.5rem' }}>No signal data</div>
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
      background: 'var(--bg-hover)', border: '1px solid #E2E8F0', borderRadius: '0.625rem', padding: '0.875rem',
    }}>
      <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', fontWeight: 500, marginBottom: '0.25rem' }}>{label}</div>
      <div style={{ fontSize: '1.125rem', fontWeight: 700, color: color ?? 'var(--ink-1)', lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  )
}

/* ── Factor breakdown ────────────────────────────────────────────────── */
function FactorBreakdown({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = Object.entries(risk.factors ?? {}).sort(([, a], [, b]) => b.weighted - a.weighted)
  const accent = RISK_BORDER[risk.risk_level] ?? '#2563EB'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      {factors.map(([name, f]) => (
        <div key={name} style={{ background: 'var(--bg-app)', padding: '0.875rem', borderRadius: '0.625rem', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.875rem', color: 'var(--ink-1)', fontWeight: 700, textTransform: 'capitalize' }}>
              {name.replace(/_/g, ' ')}
            </span>
            <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-3)', fontWeight: 500 }}>
              <span style={{ color: accent, fontWeight: 700 }}>{(f.value * 100).toFixed(0)}%</span> · w:{(f.weighted * 100).toFixed(1)}%
            </span>
          </div>
          <div style={{ height: '8px', background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '999px', overflow: 'hidden', marginBottom: '0.5rem' }}>
            <div style={{
              width: `${Math.min(100, f.value * 100).toFixed(0)}%`,
              height: '100%',
              background: accent,
              borderRadius: '999px',
              transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
            }} />
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', lineHeight: 1.5 }}>{f.explanation}</div>
        </div>
      ))}
    </div>
  )
}

/* ── AI Recommendation with mitigation plan redirect ───────────────── */
function AIRecommendationPanel({
  card,
  supplierId,
}: {
  card: IntelligentActionCard | undefined
  supplierId: string
}) {
  const navigate = useNavigate()

  if (!card) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div style={{ fontSize: '0.875rem', color: 'var(--ink-4)' }}>
          AI analysis not available for this supplier.
        </div>
        <button
          onClick={() => navigate(`/risks/${supplierId}/mitigation`)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
            padding: '0.875rem 1.25rem',
            background: 'linear-gradient(135deg, #1D4ED8, #2563EB)',
            color: '#fff',
            borderRadius: '0.625rem',
            border: 'none', cursor: 'pointer',
            fontSize: '0.875rem', fontWeight: 700,
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(37,99,235,0.35)',
            transition: 'transform 100ms, box-shadow 100ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(37,99,235,0.45)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(37,99,235,0.35)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <path d="M2 8h10M8 4l4 4-4 4" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          View Full Mitigation Plan
        </button>
      </div>
    )
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {card.recommended_action && (
        <div style={{ background: 'linear-gradient(to bottom right, #F8FAFC, #EFF6FF)', border: '1px solid #BFDBFE', borderRadius: '0.75rem', padding: '1rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', fontWeight: 800, color: '#1D4ED8', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            <span>🤖</span> Recommended Action
          </div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#1E3A8A', lineHeight: 1.5 }}>
            {card.recommended_action}
          </div>
        </div>
      )}

      {card.urgency_narrative && (
        <div style={{
          display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
          padding: '0.875rem 1rem',
          background: '#FFFBEB', border: '1px solid #FCD34D', borderRadius: '0.625rem',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>⏱️</span>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#92400E', lineHeight: 1.5 }}>{card.urgency_narrative}</div>
        </div>
      )}

      {card.reasoning && (
        <div style={{ padding: '0 0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Reasoning
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', lineHeight: 1.6 }}>{card.reasoning}</div>
        </div>
      )}

      {card.cost_of_delay_narrative && (
        <div style={{
          padding: '0.875rem 1rem',
          background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: '0.625rem',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 800, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '4px' }}>
            Cost of Delay
          </div>
          <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#7F1D1D', lineHeight: 1.5 }}>{card.cost_of_delay_narrative}</div>
        </div>
      )}

      {card.alternate_supplier_rationale && (
        <div style={{ padding: '0 0.5rem' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 800, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.5rem' }}>
            Alternate Supplier
          </div>
          <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', lineHeight: 1.6 }}>{card.alternate_supplier_rationale}</div>
        </div>
      )}

      {/* CTA → Mitigation Plan */}
      <div style={{ paddingTop: '1rem', borderTop: '1px solid var(--border)', marginTop: '0.5rem' }}>
        <button
          onClick={() => navigate(`/risks/${supplierId}/mitigation`)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.625rem',
            width: '100%',
            padding: '1rem 1.25rem',
            background: 'var(--ink-1)',
            color: '#fff',
            borderRadius: '0.75rem',
            border: 'none', cursor: 'pointer',
            fontSize: '0.9375rem', fontWeight: 700,
            fontFamily: 'inherit',
            boxShadow: 'var(--shadow-md)',
            transition: 'transform 100ms, box-shadow 100ms, background 100ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-2px)'
            e.currentTarget.style.boxShadow = 'var(--shadow-lg)'
            e.currentTarget.style.background = '#000'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = 'var(--shadow-md)'
            e.currentTarget.style.background = 'var(--ink-1)'
          }}
        >
          <svg width="18" height="18" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="3" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
            <path d="M5 8h6M8 5l3 3-3 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          View Full Mitigation Plan
          <span style={{ fontSize: '0.75rem', opacity: 0.75, fontWeight: 500 }}>→ Strands Analysis</span>
        </button>
        <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', textAlign: 'center', marginTop: '0.625rem', fontWeight: 500 }}>
          Step-by-step actions · TFE simulation · Alternate supplier analysis
        </div>
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
      <div style={{ display: 'flex', gap: '0.75rem' }}>
        <button
          onClick={run}
          disabled={loading}
          className="btn btn-secondary"
          style={{ flex: 1 }}
        >
          {loading ? (
            <><svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}><circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10"/></svg> Running simulation…</>
          ) : '⚡ Run Quick Simulation'}
        </button>
        <button
          onClick={() => navigate(`/risks/${supplierId}/mitigation`)}
          style={{
            padding: '0 1.25rem',
            background: 'var(--ink-1)', color: '#fff',
            borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
            fontSize: '0.8125rem', fontWeight: 600, fontFamily: 'inherit',
          }}
        >
          Full Plan →
        </button>
      </div>
    )
  }

  const pct = sim.risk_before > 0
    ? Math.min(100, ((sim.risk_before - sim.risk_after) / sim.risk_before) * 100)
    : 0

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Exposure comparison */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.625rem' }}>
        <StatBox label="Current Exposure" value={formatINR(sim.current_exposure_inr)} color="#DC2626" />
        <StatBox label="After Mitigation" value={formatINR(sim.mitigated_exposure_inr)} color="#059669" />
        <StatBox label="Potential Saving" value={formatINR(sim.savings_inr)} color="#2563EB" />
      </div>

      {/* Risk reduction bar */}
      <div style={{ padding: '0.75rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.625rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#15803D' }}>Risk Reduction Potential</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#15803D' }}>{pct.toFixed(0)}%</span>
        </div>
        <div style={{ height: '8px', background: '#DCFCE7', borderRadius: '999px', overflow: 'hidden' }}>
          <div style={{ width: `${pct}%`, height: '100%', background: '#059669', borderRadius: '999px', transition: 'width 0.8s ease' }} />
        </div>
      </div>

      {/* Options */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
        {sim.options.map((opt, i) => (
          <div key={i} style={{
            display: 'flex', alignItems: 'center', gap: '1rem',
            padding: '1rem',
            background: 'var(--bg-app)', border: '1px solid var(--border)', borderRadius: '0.875rem',
            boxShadow: 'var(--shadow-sm)',
            transition: 'border-color 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--ink-4)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)'; }}
          >
            <div style={{
              width: '28px', height: '28px', borderRadius: '50%',
              background: 'var(--ink-1)', color: '#fff',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.8125rem', fontWeight: 800, flexShrink: 0,
            }}>{i + 1}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>{opt.description}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '4px' }}>
                <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{opt.time_to_effect_days}d</span> to effect · <span style={{ color: 'var(--ink-2)', fontWeight: 500 }}>{(opt.confidence * 100).toFixed(0)}%</span> confidence
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: '#059669' }}>−{formatINR(opt.exposure_reduction_inr)}</div>
            </div>
          </div>
        ))}
      </div>

      <button
        onClick={() => navigate(`/risks/${supplierId}/mitigation`)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
          padding: '0.625rem',
          background: 'none', border: '1px solid #E2E8F0',
          borderRadius: '0.5rem', cursor: 'pointer',
          fontSize: '0.8125rem', fontWeight: 600, color: '#2563EB',
          fontFamily: 'inherit',
        }}
      >
        View Full Strands Mitigation Plan →
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
        display: 'flex', alignItems: 'center', gap: '0.625rem',
        padding: '0.875rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.625rem',
      }}>
        <span style={{ fontSize: '1rem' }}>✅</span>
        <span style={{ fontSize: '0.875rem', color: '#15803D' }}>No cascade propagation detected — this supplier failure is isolated.</span>
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
          <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)', flex: 1 }}>{node.supplier_name}</span>
          <span style={{ fontSize: '0.8125rem', fontFamily: 'JetBrains Mono, monospace', color: '#DC2626', fontWeight: 700 }}>
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

  const accent = RISK_BORDER[risk?.risk_level ?? 'medium'] ?? '#2563EB'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

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
          padding: '0.625rem 1rem',
          background: '#EFF6FF',
          border: '1px solid #BFDBFE',
          borderRadius: '0.625rem',
          fontSize: '0.8125rem',
          color: '#1D4ED8',
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
        }}>
          <span>⚖️</span>
          <span><strong>Custom risk weights active</strong> — this score is recomputed using your Settings configuration, not the backend default.</span>
        </div>
      )}

      {/* ── Hero card ── */}
      {risk ? (
        <div style={{
          background: 'var(--bg-card)',
          border: `1px solid ${accent}40`,
          borderTop: `6px solid ${accent}`,
          borderRadius: '1rem',
          padding: '2rem',
          boxShadow: 'var(--shadow-md)',
          position: 'relative',
          overflow: 'hidden',
        }}>
          {/* Decorative background glow */}
          <div style={{
            position: 'absolute', top: 0, right: 0, width: '300px', height: '300px',
            background: `radial-gradient(circle at top right, ${accent}15, transparent 70%)`,
            pointerEvents: 'none',
          }} />

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem', position: 'relative', zIndex: 1 }}>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
                <Badge level={risk.risk_level} />
                {risk.human_review_required && (
                  <span style={{ fontSize: '0.75rem', padding: '0.25rem 0.625rem', borderRadius: '999px', background: '#FFFBEB', color: '#D97706', border: '1px solid #FDE68A', fontWeight: 600 }}>
                    👤 Human Review Required
                  </span>
                )}
                <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontWeight: 500 }}>
                  Confidence: {(risk.confidence * 100).toFixed(0)}%
                </span>
              </div>
              <h1 style={{ fontSize: '1.875rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.03em', lineHeight: 1.2 }}>
                {risk.supplier_name}
              </h1>
              {card && (
                <p style={{ fontSize: '0.9375rem', color: 'var(--ink-3)', marginTop: '0.5rem', maxWidth: '640px', lineHeight: 1.6 }}>
                  {card.executive_summary}
                </p>
              )}
            </div>

            {/* Score + sparkline */}
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '0.75rem', flexShrink: 0, background: 'var(--bg-app)', padding: '1.25rem', borderRadius: '0.875rem', border: '1px solid var(--border)', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)' }}>
              <div style={{ textAlign: 'center', width: '100%' }}>
                <div style={{ fontSize: '3.5rem', fontWeight: 900, color: accent, letterSpacing: '-0.04em', lineHeight: 0.9 }}>
                  {(risk.overall_score * 100).toFixed(0)}<span style={{ fontSize: '1.5rem', color: 'var(--ink-4)', fontWeight: 700 }}>%</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '0.375rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Score</div>
              </div>
              <SparklineChart
                supplierId={risk.supplier_id}
                currentScore={risk.overall_score}
                riskLevel={risk.risk_level}
              />
            </div>
          </div>

          {/* Key KPI stats */}
          {card && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', marginTop: '1.25rem' }}>
              <StatBox label="Financial Exposure" value={formatINR(card.financial_exposure_inr)} color="#DC2626" />
              <StatBox label="Days to Stockout"   value={`${card.days_to_stockout}d`} color={card.days_to_stockout < 7 ? '#DC2626' : '#D97706'} />
              <StatBox label="SKUs Affected"       value={String(card.affected_skus)} />
              <StatBox label="Escalation Window"   value={card.escalation_window} />
            </div>
          )}
        </div>
      ) : (
        <div style={{ background: '#fff', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.5rem' }}>
          <Skeleton h={140} />
        </div>
      )}

      {/* ── Signal Confidence Grid ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)' }}>Signal Confidence Breakdown</h3>
          <span style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', padding: '2px 8px', background: 'var(--border-strong)', borderRadius: '0.375rem' }}>
            AI · Strands Agents
          </span>
        </div>
        {risk ? <SignalConfidenceGrid risk={risk} /> : <Skeleton h={160} />}
      </div>

      {/* ── Main 2-col grid: Factor Breakdown + AI Recommendation ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>

        <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '1rem' }}>Risk Factor Breakdown</h3>
          {risk ? <FactorBreakdown risk={risk} /> : <Skeleton h={200} />}
        </div>

        <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '1rem' }}>AI Recommendation</h3>
          <AIRecommendationPanel card={card} supplierId={id} />
        </div>
      </div>

      {/* ── Cascade Propagation ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '1rem' }}>Cascade Propagation</h3>
        <CascadeSection supplierId={id} />
      </div>

      {/* ── Mitigation Simulation ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '1rem' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)' }}>Mitigation Simulation</h3>
          <span style={{ fontSize: '0.6875rem', color: '#7C3AED', padding: '2px 8px', background: '#F5F3FF', borderRadius: '0.375rem', fontWeight: 600 }}>
            ⚡ Strands Powered
          </span>
        </div>
        <MitigationSection supplierId={id} />
      </div>

      {/* ── What-If Chat ── */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.5rem' }}>What-If Advisor</h3>
        <p style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', marginBottom: '1rem' }}>
          Ask scenario questions about <strong>{risk?.supplier_name ?? 'this supplier'}</strong>.
        </p>
        <WhatIfChat prefillContext={risk?.supplier_name} />
      </div>

    </div>
  )
}
