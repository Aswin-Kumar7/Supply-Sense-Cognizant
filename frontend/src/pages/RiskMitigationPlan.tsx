/**
 * Risk Mitigation Plan Page — /risks/:id/mitigation
 *
 * Full mitigation plan driven by Strands agent data:
 * - Impact KPI dashboard (TFE, cascade, revenue at risk, confidence)
 * - Signal confidence breakdown (which of the 5 signals fired)
 * - Step-by-step mitigation actions with owner / timeline / cost / TFE reduction
 * - Before/after TFE comparison bar
 * - Embedded alternate supplier recommendation
 */

import { useState, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
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
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: 6 }} />
}

const RISK_BORDER: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
}

const SIGNAL_META: Record<string, { label: string; icon: string; description: string }> = {
  delivery_reliability:    { label: 'Delivery Reliability', icon: '🚚', description: 'On-time delivery performance last 30 days' },
  disruption_severity:     { label: 'Active Disruptions',   icon: '🌀', description: 'Severity of current disruptions at this supplier' },
  inventory_pressure:      { label: 'Inventory Pressure',   icon: '📦', description: 'Stock vs. safety stock threshold' },
  festival_proximity:      { label: 'Festival Proximity',   icon: '🎆', description: 'Upcoming festival demand surge within 14 days' },
  dependency_exposure:     { label: 'Dependency Exposure',  icon: '🔗', description: 'Upstream Tier-2 concentration risk' },
  logistics_vulnerability: { label: 'Logistics Risk',       icon: '🛣️', description: 'Single-route or single-mode logistics exposure' },
}

const STEP_OWNERS: string[] = ['Procurement', 'Logistics', 'Finance', 'Procurement', 'Operations']
const STEP_TIMELINES: string[] = ['Immediate (24h)', '3 days', '7 days', '14 days', '30 days']

/* ── KPI tile ────────────────────────────────────────────────────────── */
function KPITile({ label, value, sub, color }: { label: string; value: string; sub?: string; color?: string }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.75rem',
      padding: '1rem 1.125rem',
    }}>
      <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', fontWeight: 500, marginBottom: '0.375rem' }}>{label}</div>
      <div style={{ fontSize: '1.375rem', fontWeight: 800, color: color ?? 'var(--ink-1)', letterSpacing: '-0.02em', lineHeight: 1 }}>
        {value}
      </div>
      {sub && <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>{sub}</div>}
    </div>
  )
}

/* ── Signal Confidence Grid ──────────────────────────────────────────── */
function SignalGrid({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = risk.factors ?? {}
  const firedSignals = Object.entries(factors).filter(([, f]) => f.value > 0.3).length

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
        <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', margin: 0 }}>Signal Confidence Analysis</h3>
        <span style={{
          fontSize: '0.6875rem', padding: '3px 10px', borderRadius: '999px',
          background: risk.confidence >= 0.8 ? '#DCFCE7' : risk.confidence >= 0.5 ? '#FFFBEB' : '#FEF2F2',
          color: risk.confidence >= 0.8 ? '#059669' : risk.confidence >= 0.5 ? '#D97706' : '#DC2626',
          border: `1px solid ${risk.confidence >= 0.8 ? '#BBF7D0' : risk.confidence >= 0.5 ? '#FDE68A' : '#FECACA'}`,
          fontWeight: 700,
        }}>
          {firedSignals} of {Object.keys(factors).length} signals active · {(risk.confidence * 100).toFixed(0)}% confidence
        </span>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '0.625rem' }}>
        {Object.entries(SIGNAL_META).map(([key, meta]) => {
          const factor = factors[key]
          const fired = factor ? factor.value > 0.3 : false
          const value = factor?.value ?? 0

          return (
            <div key={key} style={{
              padding: '0.75rem',
              background: fired ? (value >= 0.7 ? 'rgba(220,38,38,0.04)' : value >= 0.5 ? 'rgba(217,119,6,0.04)' : 'rgba(37,99,235,0.04)') : 'var(--bg-hover)',
              border: `1px solid ${fired ? (value >= 0.7 ? 'rgba(220,38,38,0.2)' : value >= 0.5 ? 'rgba(217,119,6,0.2)' : 'rgba(37,99,235,0.2)') : 'var(--border)'}`,
              borderRadius: '0.625rem',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '0.625rem',
            }}>
              <div style={{
                width: 28, height: 28, flexShrink: 0, borderRadius: '0.375rem',
                background: fired ? (value >= 0.7 ? 'rgba(220,38,38,0.1)' : 'rgba(37,99,235,0.1)') : 'var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.875rem',
              }}>
                {meta.icon}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--ink-1)' }}>{meta.label}</span>
                  <span style={{
                    fontSize: '0.625rem', fontWeight: 700,
                    color: fired ? (value >= 0.7 ? '#DC2626' : value >= 0.5 ? '#D97706' : '#2563EB') : 'var(--ink-4)',
                  }}>
                    {fired ? `${(value * 100).toFixed(0)}%` : '—'}
                  </span>
                </div>
                <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '2px' }}>{meta.description}</div>
                {factor && (
                  <div style={{ marginTop: '0.375rem', height: '3px', background: 'var(--border)', borderRadius: '999px', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(value * 100).toFixed(0)}%`, height: '100%', borderRadius: '999px',
                      background: value >= 0.7 ? '#DC2626' : value >= 0.5 ? '#D97706' : '#2563EB',
                      transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                    }} />
                  </div>
                )}
              </div>
              <div style={{
                width: 8, height: 8, borderRadius: '50%', flexShrink: 0, marginTop: '5px',
                background: fired ? (value >= 0.7 ? '#DC2626' : value >= 0.5 ? '#D97706' : '#2563EB') : 'var(--ink-5)',
              }} />
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Mitigation Steps ────────────────────────────────────────────────── */
function MitigationSteps({ sim, accent }: { sim: MitigationSimulation; accent: string }) {
  return (
    <div>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.875rem' }}>
        Step-by-Step Mitigation Actions
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {sim.options.map((opt, i) => (
          <div key={i} style={{
            display: 'flex', gap: '1rem',
            padding: '1rem 1.125rem',
            background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.75rem',
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
          }}>
            {/* Step number */}
            <div style={{
              width: 32, height: 32, borderRadius: '50%', flexShrink: 0,
              background: accent + '15', border: `2px solid ${accent}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: '0.875rem', fontWeight: 800, color: accent,
              marginTop: '2px',
            }}>
              {i + 1}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Action */}
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)', marginBottom: '0.375rem' }}>
                {opt.description}
              </div>

              {/* Meta row */}
              <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', marginBottom: '0.5rem' }}>
                <span style={{
                  fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px',
                  background: 'var(--border-strong)', border: '1px solid #E2E8F0', color: 'var(--ink-2)', fontWeight: 500,
                }}>
                  👤 {STEP_OWNERS[i % STEP_OWNERS.length]}
                </span>
                <span style={{
                  fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px',
                  background: i === 0 ? '#FEF2F2' : i <= 1 ? '#FFFBEB' : '#F0FDF4',
                  border: `1px solid ${i === 0 ? '#FECACA' : i <= 1 ? '#FDE68A' : '#BBF7D0'}`,
                  color: i === 0 ? '#DC2626' : i <= 1 ? '#D97706' : '#059669', fontWeight: 600,
                }}>
                  ⏱ {STEP_TIMELINES[i % STEP_TIMELINES.length]}
                </span>
                <span style={{
                  fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px',
                  background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', fontWeight: 500,
                }}>
                  {(opt.confidence * 100).toFixed(0)}% confidence
                </span>
              </div>

              {/* TFE reduction bar */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <div style={{ flex: 1, height: '6px', background: 'var(--border-strong)', borderRadius: '999px', overflow: 'hidden' }}>
                  <div style={{
                    width: `${Math.min(100, opt.risk_reduction * 100)}%`,
                    height: '100%', background: '#059669', borderRadius: '999px',
                    transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                  }} />
                </div>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#059669', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace' }}>
                  −{formatINR(opt.exposure_reduction_inr)} TFE
                </div>
              </div>
              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '3px' }}>
                Risk reduction: {(opt.risk_reduction * 100).toFixed(0)}% · Effect in {opt.time_to_effect_days}d · Cost: {formatINR(opt.cost_inr)}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Before/After TFE Bar ────────────────────────────────────────────── */
function TFEComparisonBar({ sim }: { sim: MitigationSimulation }) {
  const pct = sim.current_exposure_inr > 0
    ? (sim.mitigated_exposure_inr / sim.current_exposure_inr) * 100
    : 50

  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem',
      padding: '1.25rem',
    }}>
      <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '1rem' }}>
        Financial Exposure — Before vs. After Mitigation
      </h3>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ textAlign: 'center', padding: '0.875rem', background: 'rgba(220,38,38,0.04)', border: '1px solid rgba(220,38,38,0.15)', borderRadius: '0.625rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#DC2626', letterSpacing: '-0.02em' }}>{formatINR(sim.current_exposure_inr)}</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Current TFE</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.875rem', background: 'rgba(5,150,105,0.04)', border: '1px solid rgba(5,150,105,0.15)', borderRadius: '0.625rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#059669', letterSpacing: '-0.02em' }}>{formatINR(sim.mitigated_exposure_inr)}</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>After Mitigation</div>
        </div>
        <div style={{ textAlign: 'center', padding: '0.875rem', background: 'rgba(37,99,235,0.04)', border: '1px solid rgba(37,99,235,0.15)', borderRadius: '0.625rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#2563EB', letterSpacing: '-0.02em' }}>{formatINR(sim.savings_inr)}</div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '4px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Potential Saving</div>
        </div>
      </div>

      {/* Visual bar */}
      <div style={{ position: 'relative', height: '36px', background: 'var(--border-strong)', borderRadius: '999px', overflow: 'hidden' }}>
        {/* Current (red) full width background */}
        <div style={{ position: 'absolute', inset: 0, background: 'rgba(220,38,38,0.15)', borderRadius: '999px' }} />
        {/* Mitigated (green) portion */}
        <div style={{
          position: 'absolute', left: 0, top: 0, bottom: 0,
          width: `${pct.toFixed(0)}%`,
          background: 'linear-gradient(90deg, #059669, #10B981)',
          borderRadius: '999px',
          display: 'flex', alignItems: 'center', paddingLeft: '1rem',
          transition: 'width 1s cubic-bezier(0.34,1.56,0.64,1)',
        }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--bg-card)', whiteSpace: 'nowrap' }}>
            After: {formatINR(sim.mitigated_exposure_inr)} ({pct.toFixed(0)}%)
          </span>
        </div>
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.5rem' }}>
        <span style={{ fontSize: '0.6875rem', color: '#059669', fontWeight: 600 }}>₹0</span>
        <span style={{ fontSize: '0.6875rem', color: '#DC2626', fontWeight: 600 }}>
          Current: {formatINR(sim.current_exposure_inr)}
        </span>
      </div>
    </div>
  )
}

/* ── Page ────────────────────────────────────────────────────────────── */
export default function RiskMitigationPlan() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [sim, setSim] = useState<MitigationSimulation | null>(null)
  const [simLoading, setSimLoading] = useState(false)
  const [simError, setSimError] = useState(false)

  const { data: risks } = useRiskAnalysis()
  const { data: cards } = useProcurementCards()

  const { data: cascade } = useQuery({
    queryKey: queryKeys.risk((id ?? '') + '-cascade'),
    queryFn: () => api.getCascadeAnalysis(id!),
    staleTime: 300_000,
    enabled: !!id,
  })

  const { data: altsData } = useQuery({
    queryKey: ['alternates', id],
    queryFn: () => api.getAlternateSuppliersDirect(id!),
    staleTime: 300_000,
    enabled: !!id,
  })

  const runSim = useCallback(async () => {
    if (!id) return
    setSimLoading(true)
    setSimError(false)
    try {
      const result = await api.getMitigationSimulation(id)
      setSim(result)
    } catch {
      setSimError(true)
    } finally {
      setSimLoading(false)
    }
  }, [id])

  if (!id) return null

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const risk = riskList.find(r => r.supplier_id === id)
  const card = (cards as IntelligentActionCard[] | undefined ?? []).find(c => c.supplier_id === id)
  const accent = RISK_BORDER[risk?.risk_level ?? 'medium'] ?? '#2563EB'

  // Deduplicate alternates
  const uniqueAlts = (altsData?.alternates ?? []).reduce<AlternateSupplierRecord[]>((acc, a) => {
    if (!acc.find(x => x.supplier_id === a.supplier_id)) acc.push(a)
    return acc
  }, []).slice(0, 3)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button onClick={() => navigate('/risks')}
          style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          ← Risks
        </button>
        <span style={{ color: 'var(--ink-5)' }}>/</span>
        <button onClick={() => navigate(`/risks/${id}`)}
          style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {risk?.supplier_name ?? '…'}
        </button>
        <span style={{ color: 'var(--ink-5)' }}>/</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-1)', fontWeight: 600 }}>Mitigation Plan</span>
      </div>

      {/* Hero banner */}
      <div style={{
        background: 'var(--bg-card)',
        border: `1px solid ${accent}30`,
        borderLeft: `5px solid ${accent}`,
        borderRadius: '0.875rem',
        padding: '1.25rem 1.5rem',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
        flexWrap: 'wrap',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.5rem' }}>
            {risk && <Badge level={risk.risk_level} />}
            <span style={{ fontSize: '0.6875rem', padding: '2px 8px', borderRadius: '999px', background: '#EFF6FF', border: '1px solid #BFDBFE', color: '#2563EB', fontWeight: 600 }}>
              Generated by AWS Strands Agents
            </span>
          </div>
          <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
            {risk?.supplier_name ?? <Skeleton w="200px" h={28} />} — Mitigation Plan
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
            Risk score: {risk ? `${(risk.overall_score * 100).toFixed(0)}%` : '—'} · Confidence: {risk ? `${(risk.confidence * 100).toFixed(0)}%` : '—'} · Generated {new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: '0.625rem' }}>
          <button
            onClick={() => window.print()}
            style={{
              fontSize: '0.8125rem', fontWeight: 600, padding: '0.5rem 1rem',
              background: 'var(--bg-hover)', border: '1px solid #E2E8F0', borderRadius: '0.5rem',
              cursor: 'pointer', fontFamily: 'inherit', color: 'var(--ink-2)',
              display: 'flex', alignItems: 'center', gap: '0.375rem',
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M4 6V2h8v4M4 10H3a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1h-1M4 10v4h8v-4H4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/></svg>
            Export PDF
          </button>
          <button
            onClick={() => navigate(`/risks/${id}`)}
            style={{
              fontSize: '0.8125rem', fontWeight: 600, padding: '0.5rem 1rem',
              background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.5rem',
              cursor: 'pointer', fontFamily: 'inherit', color: '#2563EB',
            }}
          >
            ← Back to Detail
          </button>
        </div>
      </div>

      {/* Impact KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.875rem' }}>
        <KPITile label="Total Financial Exposure" value={card ? formatINR(card.financial_exposure_inr) : '—'} sub="from financial engine" color="#DC2626" />
        <KPITile label="Cascade Affected" value={cascade ? `${cascade.total_affected} suppliers` : '—'} sub={cascade ? `max depth ${cascade.max_depth}` : undefined} color="#D97706" />
        <KPITile label="Revenue at Risk" value={card ? formatINR(card.financial_exposure_inr * 0.6) : '—'} sub="stockout engine estimate" color="#7C3AED" />
        <KPITile label="Signal Confidence" value={risk ? `${(risk.confidence * 100).toFixed(0)}%` : '—'} sub={risk?.human_review_required ? '⚠ Human review flagged' : 'auto-eligible'} color={risk?.confidence && risk.confidence >= 0.8 ? '#059669' : '#D97706'} />
      </div>

      {/* Signal confidence grid */}
      {risk ? (
        <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <SignalGrid risk={risk} />
        </div>
      ) : null}

      {/* Mitigation simulation */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        {!sim ? (
          <div style={{ textAlign: 'center', padding: '2rem 1rem' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>⚡</div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.5rem' }}>
              Generate Mitigation Plan
            </h3>
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', maxWidth: '380px', margin: '0 auto 1.25rem' }}>
              Run the Strands agent simulation to get step-by-step mitigation actions, owner assignments, and TFE reduction projections.
            </p>
            {simError && (
              <p style={{ fontSize: '0.8125rem', color: '#DC2626', marginBottom: '0.75rem' }}>
                Simulation failed — ensure backend is running, then retry.
              </p>
            )}
            <button
              onClick={runSim}
              disabled={simLoading}
              style={{
                fontSize: '0.875rem', fontWeight: 700, padding: '0.75rem 2rem',
                background: accent, color: 'var(--bg-card)', border: 'none', borderRadius: '0.625rem',
                cursor: simLoading ? 'not-allowed' : 'pointer', opacity: simLoading ? 0.7 : 1,
                fontFamily: 'inherit', display: 'inline-flex', alignItems: 'center', gap: '0.5rem',
              }}
            >
              {simLoading ? (
                <>
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" style={{ animation: 'spin 1s linear infinite' }}>
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="20 10"/>
                  </svg>
                  Running Strands simulation…
                </>
              ) : '⚡ Run Mitigation Simulation'}
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <MitigationSteps sim={sim} accent={accent} />
          </div>
        )}
      </div>

      {/* TFE comparison (only after sim runs) */}
      {sim && <TFEComparisonBar sim={sim} />}

      {/* Alternate supplier recommendations */}
      {uniqueAlts.length > 0 && (
        <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.875rem' }}>
            Alternate Supplier Recommendations
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: '0.75rem' }}>
            {uniqueAlts.map(alt => (
              <div key={alt.supplier_id} style={{
                padding: '0.875rem',
                background: 'var(--bg-hover)', border: '1px solid #E2E8F0', borderRadius: '0.75rem',
              }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{alt.supplier_name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px', marginBottom: '0.75rem' }}>
                  {alt.city} · {alt.region}
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                  <div style={{ textAlign: 'center', padding: '0.375rem', background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '0.375rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: alt.cost_premium_pct < 10 ? '#059669' : '#D97706' }}>+{alt.cost_premium_pct.toFixed(1)}%</div>
                    <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>Cost Premium</div>
                  </div>
                  <div style={{ textAlign: 'center', padding: '0.375rem', background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '0.375rem' }}>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{((alt.quality_score) * 100).toFixed(0)}%</div>
                    <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>Quality</div>
                  </div>
                </div>
                {card?.alternate_supplier_rationale && (
                  <p style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', marginTop: '0.625rem', lineHeight: 1.5 }}>
                    {card.alternate_supplier_rationale}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
