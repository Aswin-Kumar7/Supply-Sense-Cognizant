import { useState, useMemo } from 'react'
import { useSync } from '../hooks/useGlobalSync'
import { useRiskAnalysis } from '../hooks/useQueries'
import { applyWeights, DEFAULT_WEIGHTS as HookDefaults } from '../hooks/useRiskWeights'
import type { SupplierRiskAnalysis } from '../types'

const WEIGHTS_KEY = 'ss_risk_weights'

interface RiskWeights {
  delivery_reliability: number
  disruption_severity: number
  inventory_pressure: number
  logistics_vulnerability: number
  dependency_exposure: number
  festival_proximity: number
}

const DEFAULT_WEIGHTS: RiskWeights = {
  delivery_reliability:     0.25,
  disruption_severity:      0.25,
  inventory_pressure:       0.20,
  logistics_vulnerability:  0.15,
  dependency_exposure:      0.10,
  festival_proximity:       0.05,
}

function loadWeights(): RiskWeights {
  try {
    const raw = localStorage.getItem(WEIGHTS_KEY)
    return raw ? JSON.parse(raw) : DEFAULT_WEIGHTS
  } catch { return DEFAULT_WEIGHTS }
}

function saveWeights(w: RiskWeights) {
  localStorage.setItem(WEIGHTS_KEY, JSON.stringify(w))
}

const WEIGHT_LABELS: Record<keyof RiskWeights, { label: string; desc: string }> = {
  delivery_reliability:    { label: 'Delivery Reliability', desc: 'Weight for on-time delivery performance' },
  disruption_severity:     { label: 'Disruption Severity', desc: 'Weight for active disruption events (cyclones, strikes…)' },
  inventory_pressure:      { label: 'Inventory Pressure', desc: 'Weight for current stock vs. safety stock levels' },
  logistics_vulnerability: { label: 'Logistics Vulnerability', desc: 'Weight for single-route / single-mode dependency' },
  dependency_exposure:     { label: 'Dependency Exposure', desc: 'Weight for upstream supplier concentration' },
  festival_proximity:      { label: 'Festival Proximity', desc: 'Weight for demand spikes near Indian festivals' },
}

/* ── Slider ─────────────────────────────────────────────────────────── */
function WeightSlider({
  name, value, onChange,
}: {
  name: keyof RiskWeights
  value: number
  onChange: (v: number) => void
}) {
  const { label, desc } = WEIGHT_LABELS[name]
  const pct = (value * 100).toFixed(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>{label}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{desc}</div>
        </div>
        <div style={{
          minWidth: '44px', textAlign: 'center',
          fontSize: '1rem', fontWeight: 700, color: '#2563EB',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {pct}%
        </div>
      </div>
      <input
        type="range"
        min={0} max={0.5} step={0.01}
        value={value}
        onChange={e => onChange(parseFloat(e.target.value))}
        style={{
          width: '100%', height: '6px', accentColor: '#2563EB',
          cursor: 'pointer', borderRadius: '999px',
        }}
      />
    </div>
  )
}

/* ── Live weight preview ─────────────────────────────────────────────── */
const RISK_COLOR: Record<string, string> = {
  critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669',
}

function LiveWeightPreview({ weights }: { weights: RiskWeights }) {
  const { data: rawRisks } = useRiskAnalysis()
  const riskList = (rawRisks as SupplierRiskAnalysis[] | undefined) ?? []

  // Pick the highest-scoring supplier as "sample"
  const sample = useMemo(() => {
    if (!riskList.length) return null
    return [...riskList].sort((a, b) => b.overall_score - a.overall_score)[0]
  }, [riskList])

  const recomputed = useMemo(() => {
    if (!sample) return null
    return applyWeights(sample, weights as typeof HookDefaults)
  }, [sample, weights])

  if (!sample || !recomputed) return null

  const defaultScore  = sample.overall_score
  const newScore      = recomputed.overall_score
  const delta         = newScore - defaultScore
  const deltaLabel    = `${delta >= 0 ? '+' : ''}${(delta * 100).toFixed(1)}%`

  return (
    <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.5rem' }}>
        Live Weight Preview
      </h2>
      <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginBottom: '1rem' }}>
        Shows how your current slider values would affect the highest-risk supplier's score in real time.
      </p>

      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', flexWrap: 'wrap' }}>
        {/* Supplier name */}
        <div style={{ minWidth: 140 }}>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: 2 }}>Supplier</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{sample.supplier_name}</div>
        </div>

        {/* Default score */}
        <div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: 2 }}>Backend Score</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: RISK_COLOR[sample.risk_level] ?? 'var(--ink-3)' }}>
            {(defaultScore * 100).toFixed(1)}%
            <span style={{ fontSize: '0.625rem', fontWeight: 500, color: 'var(--ink-4)', marginLeft: 4 }}>
              ({sample.risk_level})
            </span>
          </div>
        </div>

        <div style={{ fontSize: '1.25rem', color: 'var(--ink-5)' }}>→</div>

        {/* New score */}
        <div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 500, marginBottom: 2 }}>With Your Weights</div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: RISK_COLOR[recomputed.risk_level] ?? 'var(--ink-3)' }}>
            {(newScore * 100).toFixed(1)}%
            <span style={{ fontSize: '0.625rem', fontWeight: 500, color: 'var(--ink-4)', marginLeft: 4 }}>
              ({recomputed.risk_level})
            </span>
          </div>
        </div>

        {/* Delta pill */}
        <div style={{
          padding: '0.25rem 0.625rem',
          borderRadius: '999px',
          background: Math.abs(delta) < 0.001 ? 'var(--border-strong)' : delta > 0 ? '#FEF2F2' : '#ECFDF5',
          color: Math.abs(delta) < 0.001 ? 'var(--ink-3)' : delta > 0 ? '#DC2626' : '#059669',
          fontSize: '0.8125rem',
          fontWeight: 700,
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {Math.abs(delta) < 0.001 ? '± 0%' : deltaLabel}
        </div>

        {recomputed.risk_level !== sample.risk_level && (
          <div style={{
            padding: '0.25rem 0.75rem',
            borderRadius: '999px',
            background: '#FFF7ED',
            border: '1px solid #FED7AA',
            color: '#EA580C',
            fontSize: '0.75rem',
            fontWeight: 600,
          }}>
            ⚡ Risk level changed!
          </div>
        )}
      </div>

      {/* Factor breakdown */}
      <div style={{ marginTop: '1rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
        {Object.entries(sample.factors ?? {}).map(([name, factor]) => {
          const w = (weights as unknown as Record<string, number>)[name] ?? 0
          const newW = +(factor.value * w).toFixed(4)
          const oldW = factor.weighted ?? 0
          const factorDelta = newW - oldW
          return (
            <div key={name} style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', fontSize: '0.75rem' }}>
              <span style={{ width: 170, color: '#475569', fontWeight: 500, textTransform: 'capitalize' }}>
                {name.replace(/_/g, ' ')}
              </span>
              <span style={{ color: 'var(--ink-4)', fontFamily: 'monospace' }}>
                val={( factor.value * 100).toFixed(0)}%
              </span>
              <span style={{ color: 'var(--ink-5)' }}>×</span>
              <span style={{ color: '#2563EB', fontFamily: 'monospace', fontWeight: 600 }}>
                w={( w * 100).toFixed(0)}%
              </span>
              <span style={{ color: 'var(--ink-5)' }}>=</span>
              <span style={{ fontFamily: 'monospace', fontWeight: 700, color: 'var(--ink-1)' }}>
                {(newW * 100).toFixed(1)}%
              </span>
              {Math.abs(factorDelta) > 0.001 && (
                <span style={{ fontSize: '0.6875rem', color: factorDelta > 0 ? '#DC2626' : '#059669', fontWeight: 600 }}>
                  ({factorDelta > 0 ? '+' : ''}{(factorDelta * 100).toFixed(1)}%)
                </span>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Settings page ──────────────────────────────────────────────────── */
export default function SettingsPage() {
  const { bufferMs, setBufferMs, cooldownMs, setCooldownMs } = useSync()
  const [weights, setWeights] = useState<RiskWeights>(loadWeights)
  const [saved, setSaved] = useState(false)

  const bufferMinutes = Math.round(bufferMs / 60_000)
  const cooldownSecs  = Math.round(cooldownMs / 1_000)

  const totalWeight = Object.values(weights).reduce((s, v) => s + v, 0)

  const updateWeight = (key: keyof RiskWeights, val: number) => {
    setWeights(prev => ({ ...prev, [key]: val }))
    setSaved(false)
  }

  const handleSave = () => {
    saveWeights(weights)
    setSaved(true)
    setTimeout(() => setSaved(false), 3000)
  }

  const handleReset = () => {
    setWeights(DEFAULT_WEIGHTS)
    saveWeights(DEFAULT_WEIGHTS)
    setSaved(false)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem', maxWidth: '740px' }}>

      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>Settings</h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
          Configure data refresh, caching, and risk scoring behaviour
        </p>
      </div>

      {/* Sync & Caching */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '1.25rem' }}>Data Sync & Caching</h2>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

          {/* Cache buffer */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>Cache Buffer Duration</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>How long data is considered fresh before background re-fetch is triggered</div>
              </div>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB', fontFamily: 'JetBrains Mono, monospace' }}>
                {bufferMinutes}m
              </span>
            </div>
            <input
              type="range" min={1} max={60} step={1}
              value={bufferMinutes}
              onChange={e => setBufferMs(parseInt(e.target.value) * 60_000)}
              style={{ width: '100%', height: '6px', accentColor: '#2563EB', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>
              <span>1 min (real-time)</span><span>30 min (balanced)</span><span>60 min (light load)</span>
            </div>
          </div>

          {/* Refresh cooldown */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.375rem' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>Refresh Cooldown</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>Minimum wait between manual refresh button clicks</div>
              </div>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: '#2563EB', fontFamily: 'JetBrains Mono, monospace' }}>
                {cooldownSecs}s
              </span>
            </div>
            <input
              type="range" min={10} max={300} step={5}
              value={cooldownSecs}
              onChange={e => setCooldownMs(parseInt(e.target.value) * 1_000)}
              style={{ width: '100%', height: '6px', accentColor: '#2563EB', cursor: 'pointer' }}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>
              <span>10s (responsive)</span><span>60s (default)</span><span>5min (conservative)</span>
            </div>
          </div>

        </div>
      </div>

      {/* Risk weight sliders */}
      <div style={{ background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.5rem', boxShadow: '0 1px 4px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-1)' }}>Risk Scoring Weights</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
              Adjust how much each factor contributes to the overall supplier risk score
            </p>
          </div>
          <div style={{
            padding: '0.25rem 0.625rem', borderRadius: '0.375rem',
            background: Math.abs(totalWeight - 1) > 0.01 ? '#FEF2F2' : '#ECFDF5',
            color: Math.abs(totalWeight - 1) > 0.01 ? '#DC2626' : '#059669',
            fontSize: '0.75rem', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace',
          }}>
            Σ {(totalWeight * 100).toFixed(0)}%
          </div>
        </div>

        {Math.abs(totalWeight - 1) > 0.01 && (
          <div style={{
            padding: '0.625rem 0.875rem', background: '#FEF2F2', border: '1px solid #FECACA',
            borderRadius: '0.5rem', fontSize: '0.75rem', color: '#DC2626', marginBottom: '1rem',
          }}>
            ⚠️ Weights should sum to 100%. Current total: {(totalWeight * 100).toFixed(0)}%
          </div>
        )}

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {(Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]).map(key => (
            <WeightSlider key={key} name={key} value={weights[key]} onChange={v => updateWeight(key, v)} />
          ))}
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1.5rem', paddingTop: '1.25rem', borderTop: '1px solid #F1F5F9' }}>
          <button onClick={handleSave} className="btn-primary btn-sm">
            {saved ? '✓ Saved!' : 'Save Weights'}
          </button>
          <button onClick={handleReset} className="btn-ghost btn-sm">
            Reset to Defaults
          </button>
        </div>

        <p style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', marginTop: '0.75rem', lineHeight: 1.5 }}>
          ✅ <strong>How this works:</strong> Weights are saved to your browser and applied client-side instantly.
          The backend returns raw signal values (0–1) per factor; the frontend multiplies each by your weights and recomputes the overall risk score.
          No page reload required — navigate to Risks or Dashboard after saving to see updated scores.
        </p>
      </div>

      {/* Live weight preview */}
      <LiveWeightPreview weights={weights} />


      {/* About */}
      <div style={{ background: 'var(--bg-hover)', border: '1px solid #E2E8F0', borderRadius: '0.875rem', padding: '1.25rem' }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', lineHeight: 1.7 }}>
          <strong style={{ color: 'var(--ink-2)' }}>SupplySense v1.0.0</strong> · Module 5 — AI Procurement Intelligence<br />
          Stack: FastAPI · PostgreSQL (AWS RDS) · AWS Bedrock (Claude) · Strands Agents · React 18 + TypeScript<br />
          Dataset: Synthetic Indian retail supply chain · {new Date().getFullYear()}
        </div>
      </div>
    </div>
  )
}
