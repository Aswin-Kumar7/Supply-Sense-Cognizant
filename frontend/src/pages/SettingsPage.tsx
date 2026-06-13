import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSync } from '../hooks/useGlobalSync'
import { useRiskAnalysis } from '../hooks/useQueries'
import { applyWeights, DEFAULT_WEIGHTS as HookDefaults } from '../hooks/useRiskWeights'
import { Database, Activity, Scale, ShieldAlert, CheckCircle2, RotateCcw } from 'lucide-react'
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

/* ── Custom Range Input Component ───────────────────────────────────── */
function RangeInput({ value, onChange, min, max, step }: { value: number, onChange: (v: number) => void, min: number, max: number, step: number }) {
  return (
    <input
      type="range"
      min={min} max={max} step={step}
      value={value}
      onChange={e => onChange(parseFloat(e.target.value))}
      style={{
        width: '100%', height: '4px', background: '#e2e8f0',
        appearance: 'none', cursor: 'pointer', borderRadius: '4px',
        outline: 'none', accentColor: '#000',
      }}
    />
  )
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>{label}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontWeight: 500 }}>{desc}</div>
        </div>
        <div style={{
          fontSize: '1rem', fontWeight: 700, color: '#000',
          fontFamily: 'JetBrains Mono, monospace',
        }}>
          {pct}%
        </div>
      </div>
      <RangeInput value={value} onChange={onChange} min={0} max={0.5} step={0.01} />
    </div>
  )
}

/* ── Live weight preview ─────────────────────────────────────────────── */
const RISK_COLOR: Record<string, string> = {
  critical: '#dc2626', high: '#d97706', medium: '#0284c7', low: '#16a34a',
}

function LiveWeightPreview({ weights }: { weights: RiskWeights }) {
  const { data: rawRisks } = useRiskAnalysis()
  const riskList = (rawRisks as SupplierRiskAnalysis[] | undefined) ?? []

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
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.25rem' }}>
        <Activity size={16} color="#000" />
        <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          Precision Analysis Engine
        </h2>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '2rem', marginBottom: '1.5rem', paddingBottom: '1.5rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.375rem' }}>Supplier Benchmark</div>
          <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000' }}>{sample.supplier_name}</div>
        </div>
        <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
        <div>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.375rem' }}>Baseline</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: 'var(--ink-3)', fontFamily: 'JetBrains Mono' }}>
            {(defaultScore * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{ fontSize: '1.25rem', color: 'var(--ink-4)', fontWeight: 300 }}>→</div>
        <div>
          <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.375rem' }}>Adjusted</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 700, color: RISK_COLOR[recomputed.risk_level], fontFamily: 'JetBrains Mono' }}>
            {(newScore * 100).toFixed(1)}%
          </div>
        </div>
        <div style={{
          padding: '4px 10px',
          borderRadius: '4px',
          background: Math.abs(delta) < 0.001 ? 'var(--bg-hover)' : delta > 0 ? '#fef2f2' : '#f0fdf4',
          color: Math.abs(delta) < 0.001 ? 'var(--ink-3)' : delta > 0 ? '#dc2626' : '#16a34a',
          fontSize: '0.8125rem',
          fontWeight: 700,
          fontFamily: 'JetBrains Mono, monospace',
          border: `1px solid ${Math.abs(delta) < 0.001 ? 'var(--border)' : delta > 0 ? '#fee2e2' : '#dcfce7'}`,
        }}>
          {Math.abs(delta) < 0.001 ? '± 0%' : deltaLabel}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {Object.entries(sample.factors ?? {}).map(([name, factor]) => {
          const w = (weights as unknown as Record<string, number>)[name] ?? 0
          const newW = +(factor.value * w).toFixed(4)
          const oldW = factor.weighted ?? 0
          const factorDelta = newW - oldW
          
          return (
            <div key={name} style={{ 
              display: 'grid', 
              gridTemplateColumns: '150px 80px 20px 80px 20px 60px 60px',
              alignItems: 'center', 
              fontSize: '0.75rem',
              fontFamily: 'JetBrains Mono, monospace'
            }}>
              <span style={{ 
                color: '#000', fontWeight: 600, textTransform: 'uppercase', 
                fontSize: '0.625rem', letterSpacing: '0.04em', fontFamily: 'Inter, sans-serif'
              }}>
                {name.replace(/_/g, ' ')}
              </span>
              
              <span style={{ color: 'var(--ink-3)', textAlign: 'right', fontWeight: 500 }}>
                val={Math.round(factor.value * 100)}%
              </span>
              
              <span style={{ color: 'var(--ink-4)', textAlign: 'center', fontWeight: 400 }}>×</span>
              
              <span style={{ color: '#000', fontWeight: 600, textAlign: 'right', whiteSpace: 'nowrap' }}>
                w={Math.round(w * 100)}%
              </span>
              
              <span style={{ color: 'var(--ink-4)', textAlign: 'center', fontWeight: 400 }}>=</span>
              
              <span style={{ fontWeight: 700, color: '#000', textAlign: 'right' }}>
                {(newW * 100).toFixed(1)}%
              </span>
              
              <div style={{ textAlign: 'right' }}>
                {Math.abs(factorDelta) > 0.001 && (
                  <span style={{ fontSize: '0.625rem', color: factorDelta > 0 ? '#dc2626' : '#16a34a', fontWeight: 600 }}>
                    {factorDelta > 0 ? '↑' : '↓'} {(Math.abs(factorDelta) * 100).toFixed(1)}
                  </span>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Settings page ──────────────────────────────────────────────────── */
export default function SettingsPage() {
  const navigate = useNavigate()
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

  const isWeightValid = Math.abs(totalWeight - 1) < 0.01

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px' }}>

      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span 
              onClick={() => navigate('/')}
              style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Dashboard / Preferences
            </span>
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#000000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            Engine Configuration
          </h1>
        </div>

        <div style={{ display: 'flex', gap: '2rem' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>System Latency</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 600, color: '#000000', lineHeight: 1 }}>{cooldownSecs}s</div>
          </div>
          <div style={{ width: '1px', height: '32px', background: 'var(--border)' }} />
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.4rem' }}>Cache Buffer</div>
            <div style={{ fontSize: '1.375rem', fontWeight: 600, color: '#000000', lineHeight: 1 }}>{bufferMinutes}m</div>
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', alignItems: 'start' }}>
        
        {/* Risk weight sliders */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
            <Scale size={16} color="#000" />
            <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Risk Scoring Weights</h2>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {(Object.keys(DEFAULT_WEIGHTS) as (keyof RiskWeights)[]).map(key => (
              <WeightSlider key={key} name={key} value={weights[key]} onChange={v => updateWeight(key, v)} />
            ))}
          </div>

          <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: isWeightValid ? 'var(--ink-4)' : '#dc2626' }}>
                AGGREGATE WEIGHT
              </div>
              <div style={{ fontSize: '1rem', fontWeight: 800, color: isWeightValid ? '#16a34a' : '#dc2626', fontFamily: 'JetBrains Mono' }}>
                {(totalWeight * 100).toFixed(0)}%
              </div>
            </div>
            {!isWeightValid && (
              <div style={{ padding: '0.75rem', background: '#fef2f2', border: '1px solid #fee2e2', borderRadius: '4px', fontSize: '0.6875rem', color: '#dc2626', fontWeight: 600 }}>
                <ShieldAlert size={12} style={{ display: 'inline', marginRight: '4px' }} />
                Weights must total 100% for balanced analysis.
              </div>
            )}
            <div style={{ display: 'flex', gap: '0.75rem' }}>
              <button 
                onClick={handleSave} 
                disabled={!isWeightValid}
                style={{ 
                  flex: 1, background: '#000', color: '#fff', border: 'none', padding: '0.75rem', borderRadius: '6px', 
                  fontSize: '0.75rem', fontWeight: 700, cursor: isWeightValid ? 'pointer' : 'not-allowed', opacity: isWeightValid ? 1 : 0.5,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem'
                }}
              >
                {saved ? <CheckCircle2 size={16} /> : null}
                {saved ? 'Settings Applied' : 'Apply Configuration'}
              </button>
              <button 
                onClick={handleReset}
                style={{ 
                  background: '#fff', color: '#000', border: '1px solid var(--border)', padding: '0.75rem', borderRadius: '6px', 
                  fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.5rem'
                }}
              >
                <RotateCcw size={16} />
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Sync & Caching */}
          <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.5rem', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
              <Database size={16} color="#000" />
              <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Data Lifecycle</h2>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Cache Buffer</div>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono' }}>{bufferMinutes}m</span>
                </div>
                <RangeInput min={1} max={60} step={1} value={bufferMinutes} onChange={v => setBufferMs(v * 60_000)} />
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.625rem', color: 'var(--ink-4)', marginTop: '0.5rem', fontWeight: 600 }}>
                  <span>REAL-TIME</span><span>BALANCED</span><span>LONG-TERM</span>
                </div>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000' }}>Refresh Cooldown</div>
                  <span style={{ fontSize: '1rem', fontWeight: 700, color: '#000', fontFamily: 'JetBrains Mono' }}>{cooldownSecs}s</span>
                </div>
                <RangeInput min={10} max={300} step={5} value={cooldownSecs} onChange={v => setCooldownMs(v * 1_000)} />
              </div>
            </div>
          </div>

          {/* Live Preview */}
          <LiveWeightPreview weights={weights} />
        </div>
      </div>

      {/* Metadata Strip */}
      <div style={{ marginTop: '2rem', padding: '1.5rem', background: 'var(--bg-hover)', borderRadius: '0.5rem', border: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>
            <span style={{ fontWeight: 700, color: '#000' }}>SupplySense v1.0.0</span> · Advanced AI Procurement Intelligence
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600 }}>
            STX-2026-SYNTHETIC-INDIA
          </div>
        </div>
        <div style={{ marginTop: '0.75rem', fontSize: '0.6875rem', color: 'var(--ink-4)', lineHeight: 1.5 }}>
          Stack: FastAPI / PostgreSQL / AWS Bedrock (Claude 3) / React 18 / TypeScript. 
          Configured weights are stored in local persistence and applied to real-time risk signal streams.
        </div>
      </div>
    </div>
  )
}
