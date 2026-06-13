import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useWeightedRiskAnalysis, useProcurementCards, useActionCards } from '../hooks/useQueries'
import { Badge } from '../components/ui/Badge'

import { 
  LineChart, CloudLightning, ShieldAlert, CalendarDays, Box, 
  Bot, CheckCircle2, PlayCircle, 
  Network, ChevronRight, XCircle, Timer, Banknote, Layers,
  TrendingDown
} from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'

/* ── Typography & formatting utils ───────────────────────────────────────── */
function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(2)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(2)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Skeleton({ w = '100%', h = 16 }: { w?: string | number; h?: number }) {
  return <div style={{ width: w, height: h, borderRadius: 8, background: '#E5E7EB', animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite' }} />
}

const RISK_COLORS: Record<string, { bg: string, border: string, text: string }> = {
  critical: { bg: '#FEF2F2', border: '#FCA5A5', text: '#DC2626' },
  high:     { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' },
  medium:   { bg: '#EFF6FF', border: '#BFDBFE', text: '#2563EB' },
  low:      { bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' },
}

/* ── Sparkline ───────────────────────────────────────────────────────── */
function seededNoise(seed: number, i: number): number {
  const x = Math.sin(seed * 9301 + i * 49297 + 233) * 10000
  return (x - Math.floor(x)) * 2 - 1
}

function SparklineMini({ supplierId, currentScore, color }: { supplierId: string; currentScore: number; color: string }) {
  const points = useMemo(() => {
    const seed = supplierId.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
    const n = 20
    const pts: number[] = []
    for (let i = 0; i < n; i++) {
      const dayOffset = n - 1 - i
      const drift = dayOffset * 0.003 * seededNoise(seed, i * 3)
      const noise = 0.04 * seededNoise(seed, i)
      pts.push(Math.max(0, Math.min(1, currentScore + drift + noise)))
    }
    pts[n - 1] = currentScore
    return pts
  }, [supplierId, currentScore])

  const W = 80, H = 24, PAD = 2
  const min = Math.min(...points), max = Math.max(...points), range = max - min || 0.01

  const toX = (i: number) => PAD + (i / (points.length - 1)) * (W - PAD * 2)
  const toY = (v: number) => H - PAD - ((v - min) / range) * (H - PAD * 2)

  const pathD = points.map((v, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)},${toY(v).toFixed(1)}`).join(' ')

  return (
    <svg width={W} height={H} style={{ overflow: 'visible' }}>
      <path d={pathD} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={toX(points.length - 1)} cy={toY(points[points.length - 1])} r="3" fill={color} />
    </svg>
  )
}

/* ── Signal Matrix (Data Table Style) ────────────────────────────────── */
const SIGNAL_META: Record<string, { label: string; icon: React.ReactNode }> = {
  delivery_reliability:    { label: 'Delivery Reliability',      icon: <LineChart size={14} /> },
  disruption_severity:     { label: 'Disruption Severity',       icon: <CloudLightning size={14} /> },
  festival_proximity:      { label: 'Seasonal Demand',           icon: <CalendarDays size={14} /> },
  dependency_exposure:     { label: 'Dependency Risk',           icon: <ShieldAlert size={14} /> },
  logistics_vulnerability: { label: 'Logistics Volatility',      icon: <Layers size={14} /> },
  inventory_pressure:      { label: 'Inventory Pressure',        icon: <Box size={14} /> },
}

function SignalDataTable({ risk }: { risk: SupplierRiskAnalysis }) {
  const factors = risk.factors ?? {}
  const signals = Object.entries(SIGNAL_META).map(([key, meta]) => {
    const f = factors[key]
    const score = f ? f.value : null
    const fired = score !== null ? score > 0.4 : false
    return { key, meta, score, fired }
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return (
    <div style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
        <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <tr>
            <th style={{ padding: '8px 12px', fontWeight: 600, color: '#4B5563', width: '40%' }}>Signal</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, color: '#4B5563', width: '20%' }}>Status</th>
            <th style={{ padding: '8px 12px', fontWeight: 600, color: '#4B5563', width: '40%' }}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => (
            <tr key={s.key} style={{ borderBottom: i === signals.length - 1 ? 'none' : '1px solid #F3F4F6', background: s.fired ? '#FAFAFA' : '#FFF' }}>
              <td style={{ padding: '8px 12px', color: '#111827', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span style={{ color: '#9CA3AF' }}>{s.meta.icon}</span>
                {s.meta.label}
              </td>
              <td style={{ padding: '8px 12px' }}>
                {s.fired ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#DC2626', fontWeight: 600, padding: '2px 8px', background: '#FEF2F2', borderRadius: '8px' }}>
                    <XCircle size={12} /> Critical
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#6B7280' }}>
                    Nominal
                  </span>
                )}
              </td>
              <td style={{ padding: '8px 12px' }}>
                {s.score !== null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <div style={{ flex: 1, height: '4px', background: '#E5E7EB', borderRadius: '2px', overflow: 'hidden' }}>
                      <div style={{ width: `${s.score * 100}%`, height: '100%', background: s.fired ? '#DC2626' : '#9CA3AF' }} />
                    </div>
                    <span style={{ fontFamily: 'monospace', fontSize: '12px', color: s.fired ? '#111827' : '#6B7280', width: '30px', textAlign: 'right' }}>
                      {(s.score * 100).toFixed(0)}%
                    </span>
                  </div>
                ) : (
                  <span style={{ color: '#D1D5DB' }}>--</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/* ── Cascade Impact (Compact Tree) ───────────────────────────────────── */
function CascadeTree({ supplierId }: { supplierId: string }) {
  const { data: cascade, isLoading } = useQuery({
    queryKey: queryKeys.risk(supplierId + '-cascade'),
    queryFn: () => api.getCascadeAnalysis(supplierId),
    staleTime: 300_000,
  })

  if (isLoading) return <Skeleton h={80} />
  if (!cascade || cascade.total_affected === 0) {
    return <div style={{ fontSize: '12px', color: '#6B7280' }}>No downstream dependencies detected.</div>
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', color: '#374151' }}>
        <Network size={14} color="#6B7280" />
        <span><strong style={{ color: '#111827' }}>{cascade.total_affected}</strong> systems affected, tier <strong>{cascade.max_depth}</strong> limit</span>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', borderLeft: '1px solid #E5E7EB', marginLeft: '6px', paddingLeft: '10px' }}>
        {(cascade.nodes ?? []).slice(0, 4).map(node => (
          <div key={node.supplier_id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: '12px', padding: '2px 0' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#D1D5DB', fontFamily: 'monospace' }}>{'└'.padEnd(node.depth + 1, '─')}</span>
              <span style={{ color: '#111827', fontWeight: 500 }}>{node.supplier_name}</span>
              <span style={{ color: '#9CA3AF', fontSize: '11px' }}>{node.dependency_type}</span>
            </div>
            <span style={{ fontFamily: 'monospace', color: '#DC2626', fontWeight: 600 }}>{(node.propagated_impact * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ── Metric Block ────────────────────────────────────────────────────── */
function MetricItem({ label, value, icon, alert = false }: { label: string, value: string, icon: React.ReactNode, alert?: boolean }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#6B7280', fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
        {icon} {label}
      </div>
      <div style={{ fontSize: '18px', fontWeight: 600, color: alert ? '#DC2626' : '#111827', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
        {value}
      </div>
    </div>
  )
}

/* ── Main Page Component ─────────────────────────────────────────────── */
export default function RiskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: risks } = useWeightedRiskAnalysis()
  const { data: cards } = useProcurementCards()
  const { data: actionData } = useActionCards()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const risk = riskList.find(r => r.supplier_id === id)
  const card = (cards as IntelligentActionCard[] | undefined ?? []).find(c => c.supplier_id === id)

  const supplierActionCards = (actionData?.action_cards ?? []).filter((c: any) => c.supplier_id === id)
  const isResolved = supplierActionCards.length > 0 && supplierActionCards.every((c: any) => c.is_resolved)
  const resolvedCard = supplierActionCards
    .filter((c: any) => c.is_resolved)
    .sort((a: any, b: any) => new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime())[0]

  if (!id) return null

  if (isResolved && resolvedCard) {
    return (
      <div style={{ padding: '32px', maxWidth: '800px', margin: '0 auto', fontFamily: 'Inter, system-ui, sans-serif' }}>
        <button onClick={() => navigate('/risks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '13px', display: 'flex', alignItems: 'center', gap: '4px', padding: 0, marginBottom: '24px' }}>
          ← Back to Registry
        </button>
        <div style={{ border: '1px solid #E5E7EB', background: '#FFF', borderRadius: '16px', padding: '32px', textAlign: 'center' }}>
          <CheckCircle2 size={32} color="#10B981" style={{ margin: '0 auto 16px' }} />
          <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 8px' }}>Risk Incident Resolved</h2>
          <p style={{ fontSize: '13px', color: '#6B7280', margin: '0 0 24px' }}>All action items for {risk?.supplier_name || 'this supplier'} have been completed.</p>
          <button onClick={() => navigate(`/activity/${resolvedCard.id}`)} style={{ background: '#111827', color: '#FFF', border: 'none', padding: '8px 16px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
            View Incident Report
          </button>
        </div>
      </div>
    )
  }

  const rColor = risk ? RISK_COLORS[risk.risk_level] || RISK_COLORS.medium : RISK_COLORS.medium

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', height: '100%', 
      background: '#FAFAFA', color: '#111827', 
      fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
      overflowY: 'auto'
    }}>
      
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '12px 24px', background: '#FFF', borderBottom: '1px solid #E5E7EB',
        position: 'sticky', top: 0, zIndex: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <button onClick={() => navigate('/risks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '13px', padding: 0, display: 'flex', alignItems: 'center' }}>
            Risks
          </button>
          <ChevronRight size={14} color="#D1D5DB" />
          <span style={{ fontSize: '14px', fontWeight: 600 }}>{risk?.supplier_name ?? <Skeleton w={120} h={16} />}</span>
          {risk && (
            <span style={{ 
              fontSize: '11px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em',
              padding: '2px 8px', borderRadius: '8px', background: rColor.bg, color: rColor.text, border: `1px solid ${rColor.border}`
            }}>
              {risk.risk_level} Risk
            </span>
          )}
        </div>
        
        <div style={{ display: 'flex', gap: '12px' }}>
          <button
            onClick={() => navigate(`/advisor?supplier=${encodeURIComponent(id ?? '')}&name=${encodeURIComponent(risk?.supplier_name ?? '')}`)}
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px',
              padding: '6px 14px', background: '#FFF', color: '#374151',
              border: '1px solid #D1D5DB', borderRadius: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}
          >
            <Bot size={14} /> AI Advisor
          </button>
        </div>
      </div>

      <div style={{ padding: '20px 24px', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '20px' }}>
        
        {/* ── Executive Dashboard Strip ─────────────────────────────────── */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '20px',
          background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '16px 20px',
          boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
        }}>
          {/* Main Score & Trend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderRight: '1px solid #E5E7EB', paddingRight: '20px' }}>
            <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', fontWeight: 600 }}>Risk Score</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '24px', fontWeight: 700, fontFamily: 'monospace', color: rColor.text, lineHeight: 1 }}>
                {risk ? `${(risk.overall_score * 100).toFixed(0)}%` : '--'}
              </div>
              {risk && <SparklineMini supplierId={risk.supplier_id} currentScore={risk.overall_score} color={rColor.text} />}
            </div>
          </div>
          
          <MetricItem label="Financial Exposure" value={card ? formatINR(card.financial_exposure_inr) : '--'} icon={<Banknote size={14} />} alert={true} />
          <MetricItem label="Days to Stockout" value={card ? String(card.days_to_stockout) : '--'} icon={<Timer size={14} />} alert={card && card.days_to_stockout < 5} />
          <MetricItem label="SKUs at Risk" value={card ? String(card.affected_skus) : '--'} icon={<Box size={14} />} />
          <MetricItem label="Recovery Window" value={card ? card.escalation_window : '--'} icon={<TrendingDown size={14} />} />
        </div>

        {/* ── Main Layout: 2 Columns ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.8fr 1fr', gap: '20px', alignItems: 'start' }}>
          
          {/* Left Col: AI Insight & Data Tables */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* AI Strategic Assessment */}
            {card && (
              <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '16px', overflow: 'hidden', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
                <div style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB', padding: '12px 16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Bot size={16} color="#2563EB" />
                  <span style={{ fontSize: '14px', fontWeight: 600, color: '#111827' }}>AI Strategic Assessment</span>
                </div>
                <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '14px' }}>
                  <div>
                    <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 8px', color: '#111827' }}>{card.recommended_action}</h3>
                    <p style={{ fontSize: '13px', color: '#4B5563', lineHeight: 1.5, margin: 0 }}>{card.reasoning}</p>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px' }}>
                    {card.urgency_narrative && (
                      <div style={{ flex: 1, background: '#FEF2F2', border: '1px solid #FCA5A5', padding: '10px 12px', borderRadius: '12px', display: 'flex', gap: '10px' }}>
                        <ShieldAlert size={16} color="#DC2626" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ fontSize: '12px', color: '#991B1B', lineHeight: 1.4, fontWeight: 500 }}>{card.urgency_narrative}</span>
                      </div>
                    )}
                    {card.cost_of_delay_narrative && (
                      <div style={{ flex: 1, background: '#FFFBEB', border: '1px solid #FDE68A', padding: '10px 12px', borderRadius: '12px', display: 'flex', gap: '10px' }}>
                        <Timer size={16} color="#D97706" style={{ flexShrink: 0, marginTop: '1px' }} />
                        <span style={{ fontSize: '12px', color: '#B45309', lineHeight: 1.4, fontWeight: 500 }}>{card.cost_of_delay_narrative}</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Primary Call to Action */}
                  <div style={{ marginTop: '6px', borderTop: '1px solid #E5E7EB', paddingTop: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '12px', color: '#6B7280' }}>Simulate alternative suppliers to mitigate this risk.</span>
                    <button
                      onClick={() => navigate(`/risks/${id}/mitigation`)}
                      style={{ 
                        display: 'flex', alignItems: 'center', gap: '8px',
                        padding: '8px 16px', background: '#2563EB', color: '#FFF',
                        border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: 600, cursor: 'pointer',
                        boxShadow: '0 1px 2px rgba(37,99,235,0.2)',
                        transition: 'background 0.2s'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#1D4ED8'}
                      onMouseLeave={e => e.currentTarget.style.background = '#2563EB'}
                    >
                      <PlayCircle size={16} color="#FFF" /> Run Mitigation Simulation
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Risk Telemetry */}
            <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, margin: 0, color: '#111827' }}>Risk Telemetry</h3>
                <span style={{ fontSize: '10px', color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>Strands Analytics</span>
              </div>
              {risk ? <SignalDataTable risk={risk} /> : <Skeleton h={150} />}
            </div>

          </div>

          {/* Right Col: Deep Dives */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Cascade Network */}
            <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 16px', color: '#111827' }}>Cascade Network Impact</h3>
              <CascadeTree supplierId={id!} />
            </div>

            {/* Contributing Factors */}
            <div style={{ background: '#FFF', border: '1px solid #E5E7EB', borderRadius: '16px', padding: '16px', boxShadow: '0 1px 2px rgba(0,0,0,0.02)' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 16px', color: '#111827' }}>Weighted Drivers</h3>
              {risk ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  {Object.entries(risk.factors ?? {})
                    .sort(([,a], [,b]) => b.weighted - a.weighted)
                    .slice(0, 4)
                    .map(([name, f]) => (
                    <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '12px', fontWeight: 600, color: '#374151', textTransform: 'capitalize' }}>{name.replace(/_/g, ' ')}</span>
                        <span style={{ fontSize: '12px', fontFamily: 'monospace', fontWeight: 600, color: '#111827' }}>{(f.value * 100).toFixed(0)}%</span>
                      </div>
                      <span style={{ fontSize: '11px', color: '#6B7280', lineHeight: 1.4 }}>{f.explanation}</span>
                    </div>
                  ))}
                </div>
              ) : <Skeleton h={150} />}
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}
