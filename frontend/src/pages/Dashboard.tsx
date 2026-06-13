import { useMemo, useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import {
  useDashboardSummary, useDisruptions, useStockoutForecast,
  useActionCards, useProcurementCards, useWeightedRiskAnalysis,
} from '../hooks/useQueries'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import type { SupplierRiskAnalysis, IntelligentActionCard, ActionCard } from '../types'
import {
  AlertTriangle, Package, Activity, Wind, Truck, ClipboardList,
  ChevronRight, ShieldCheck, Users, Clock, TrendingDown
} from 'lucide-react'

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Sk({ w = '100%', h = 18 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 6 }} />
}

function getTopFactor(factors: SupplierRiskAnalysis['factors']): string {
  if (!factors) return ''
  return Object.entries(factors).sort(([, a], [, b]) => b.weighted - a.weighted)[0]?.[0] ?? ''
}

const FACTOR_LABEL: Record<string, string> = {
  disruption_severity:     'Active disruption affecting supply',
  inventory_pressure:      'Stock levels critically low',
  delivery_reliability:    'Delivery delays reported',
  logistics_vulnerability: 'High logistics risk in region',
  dependency_exposure:     'Heavy dependency on this supplier',
  festival_proximity:      'Demand spike — festival season ahead',
}

function getReason(risk: SupplierRiskAnalysis, card: IntelligentActionCard): string {
  if (card.days_to_stockout <= 3) return `Stock runs out in ${card.days_to_stockout} days`
  if (card.days_to_stockout <= 7) return `Only ${card.days_to_stockout} days of stock left`
  return FACTOR_LABEL[getTopFactor(risk.factors)] ?? card.title ?? 'Elevated supply risk'
}

const SEV: Record<string, { color: string; bg: string; border: string; strip: string; label: string }> = {
  critical: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', strip: '#DC2626', label: 'Critical' },
  high:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', strip: '#D97706', label: 'High'     },
  medium:   { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', strip: '#2563EB', label: 'Medium'   },
  low:      { color: '#059669', bg: '#F0FDF4', border: '#BBF7D0', strip: '#94A3B8', label: 'Low'      },
}

const TYPE_ICON: Record<string, React.ReactNode> = {
  cyclone: <Wind size={14} />, strike: <Truck size={14} />, logistics: <Package size={14} />,
  inventory: <Activity size={14} />, quality: <Activity size={14} />, regulatory: <ClipboardList size={14} />,
}



/* ── Alert Marquee ───────────────────────────────────────────────────── */
function AlertMarquee({ disruptions }: { disruptions: any[] }) {
  const navigate = useNavigate()
  const trackRef = useRef<HTMLDivElement>(null)
  const isHovered = useRef(false)
  const [isDragging, setIsDragging] = useState(false)
  const startX = useRef(0)
  const scrollLeft = useRef(0)

  useEffect(() => {
    let animationId: number;
    const scroll = () => {
      if (trackRef.current && !isHovered.current && !isDragging) {
        trackRef.current.scrollLeft += 0.5
        if (trackRef.current.scrollLeft >= trackRef.current.scrollWidth - trackRef.current.clientWidth - 2) {
          trackRef.current.scrollLeft = 0;
        }
      }
      animationId = requestAnimationFrame(scroll)
    }
    animationId = requestAnimationFrame(scroll)
    return () => cancelAnimationFrame(animationId)
  }, [isDragging])

  const active = disruptions.filter(d => d.is_active && d.severity !== 'low')
  if (active.length === 0) return null

  const content = active.map((item, i) => {
    const sev = SEV[item.severity] ?? SEV.low
    return (
      <div key={i} onClick={() => { if (!isDragging) navigate('/disruptions') }} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.625rem', margin: '0 2rem', cursor: 'pointer', flexShrink: 0 }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: sev.color, animation: 'livePulse 1.5s ease-in-out infinite' }} />
        <span style={{ fontSize: '0.75rem', fontWeight: 800, color: sev.color, textTransform: 'uppercase' }}>{sev.label}</span>
        <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{item.title}</span>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-3)' }}>{item.region ? `· ${item.region}` : ''}</span>
      </div>
    )
  })

  return (
    <div className="card" style={{ overflow: 'hidden', padding: '0.875rem 1.25rem', display: 'flex', alignItems: 'center', gap: '1rem', borderRadius: '0.75rem', cursor: isDragging ? 'grabbing' : 'grab' }}
      onMouseEnter={() => isHovered.current = true}
      onMouseLeave={() => { isHovered.current = false; setIsDragging(false) }}
      onMouseDown={e => {
        setIsDragging(true)
        startX.current = e.pageX - (trackRef.current?.offsetLeft || 0)
        scrollLeft.current = trackRef.current?.scrollLeft || 0
      }}
      onMouseUp={() => setIsDragging(false)}
      onMouseMove={e => {
        if (!isDragging || !trackRef.current) return
        e.preventDefault()
        const x = e.pageX - trackRef.current.offsetLeft
        const walk = (x - startX.current) * 2
        trackRef.current.scrollLeft = scrollLeft.current - walk
      }}
    >
      <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--ink-1)', textTransform: 'uppercase', letterSpacing: '0.05em', borderRight: '1px solid var(--border)', paddingRight: '1rem', flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Wind size={16} color="var(--ink-3)" /> Live Alerts
      </div>
      <div ref={trackRef} className="hide-scrollbar" style={{ flex: 1, overflowX: 'auto', whiteSpace: 'nowrap', display: 'flex', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
        {content}
        {content}
        {content}
        {content}
      </div>
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        @keyframes livePulse { 0%, 100% { opacity: 1; transform: scale(1); } 50% { opacity: 0.35; transform: scale(0.75); } }
        .table-row-hover {
          background: var(--bg-card);
        }
        .table-row-hover td {
          transition: background 150ms ease;
        }
        .table-row-hover:hover td {
          background: var(--bg-hover);
        }
        .btn-table-action {
          background: var(--bg-card);
          color: var(--ink-2);
          border: 1px solid var(--border-strong);
          cursor: pointer;
          transition: all 150ms ease;
          outline: none;
        }
        .table-row-hover:hover .btn-table-action {
          background: var(--ink-1);
          color: #fff;
          border-color: var(--ink-1);
        }
      `}</style>
    </div>
  )
}

/* ── KPI Card ────────────────────────────────────────────────────────── */
function KpiCard({ value, label, sub, icon, onClick, loading, children }: {
  value: string | number; label: string; sub?: string
  icon: React.ReactNode; onClick?: () => void; loading?: boolean; children?: React.ReactNode
}) {
  return (
    <div onClick={onClick} className="card"
      style={{ padding: '1.25rem', cursor: onClick ? 'pointer' : 'default', display: 'flex', flexDirection: 'column', justifyContent: 'space-between', position: 'relative', overflow: 'hidden' }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.borderColor = 'var(--border-strong)'; e.currentTarget.style.boxShadow = 'var(--shadow-md)' } }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.boxShadow = 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-3)' }}>{label}</span>
        <span style={{ color: 'var(--ink-3)', background: 'var(--bg-hover)', padding: '0.375rem', borderRadius: '0.5rem' }}>{icon}</span>
      </div>
      {loading ? <Sk w="55%" h={28} /> : (
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem' }}>
          <span style={{ fontSize: '1.5rem', fontWeight: 900, color: 'var(--ink-1)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{value}</span>
        </div>
      )}
      <div style={{ marginTop: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-4)', fontWeight: 500 }}>{sub}</span>
        {children}
      </div>
    </div>
  )
}

/* ── Act Today Row ───────────────────────────────────────────────────── */
function ActTodayRow({ risk, card }: { risk: SupplierRiskAnalysis; card: IntelligentActionCard }) {
  const navigate = useNavigate()
  const sev = SEV[risk.risk_level] ?? SEV.low
  const isCrit = risk.risk_level === 'critical'

  return (
    <tr
      onClick={() => navigate(`/risks/${risk.supplier_id}/mitigation`)}
      style={{ cursor: 'pointer' }}
      className="table-row-hover"
    >
      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
          <div style={{ position: 'relative', flexShrink: 0 }}>
            <div style={{ width: 32, height: 32, borderRadius: '6px', background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800, fontSize: '0.875rem' }}>
              {risk.supplier_name.charAt(0)}
            </div>
            {isCrit && <div style={{ position: 'absolute', top: -2, right: -2, width: 8, height: 8, background: '#DC2626', borderRadius: '50%', border: '1.5px solid var(--bg-card)', animation: 'livePulse 1.5s infinite' }} />}
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{risk.supplier_name}</div>
            <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', textTransform: 'capitalize' }}>{card.category} · {card.region}</div>
          </div>
        </div>
      </td>
      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', alignSelf: 'flex-start', fontSize: '0.625rem', fontWeight: 800, padding: '1px 5px', background: sev.bg, color: sev.color, borderRadius: '4px', border: `1px solid ${sev.border}`, textTransform: 'uppercase' }}>
            {TYPE_ICON[card.action_type] ?? <AlertTriangle size={10} />}
            {sev.label}
          </span>
          <span style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={getReason(risk, card)}>
            {getReason(risk, card)}
          </span>
        </div>
      </td>
      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: card.days_to_stockout <= 3 ? '#DC2626' : card.days_to_stockout <= 7 ? '#D97706' : 'var(--ink-2)' }}>
            {card.days_to_stockout} {card.days_to_stockout === 1 ? 'day' : 'days'}
          </span>
          <div style={{ width: '100%', height: 4, background: 'var(--bg-hover)', borderRadius: 2, overflow: 'hidden' }}>
            <div style={{ width: `${Math.min(100, Math.max(5, 100 - (card.days_to_stockout / 14) * 100))}%`, background: sev.color, height: '100%' }} />
          </div>
        </div>
      </td>
      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--ink-1)', fontFamily: 'JetBrains Mono, monospace' }}>
          {formatINR(card.financial_exposure_inr)}
        </div>
      </td>
      <td style={{ padding: '0.75rem 1rem', verticalAlign: 'middle', textAlign: 'right', borderBottom: '1px solid var(--border)' }}>
        <button className="btn-table-action" style={{ padding: '0.375rem 0.625rem', fontSize: '0.75rem', fontWeight: 700, borderRadius: '4px' }}>
          Review
        </button>
      </td>
    </tr>
  )
}

/* ── Supplier List Panel ─────────────────────────────────────────────── */
function SupplierListRight({ risks, cardMap }: { risks: SupplierRiskAnalysis[]; cardMap: Map<string, IntelligentActionCard> }) {
  const navigate = useNavigate()
  return (
    <div className="card-flush" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
        <span style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--ink-1)' }}>Suppliers at Risk</span>
        <button onClick={() => navigate('/risks')} style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>View all <ChevronRight size={14} /></button>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', maxHeight: '400px' }}>
        {risks.length === 0 ? (
          <div style={{ padding: '2.5rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>All suppliers stable</div>
        ) : risks.map(r => {
          const card = cardMap.get(r.supplier_id)
          const sev  = SEV[r.risk_level] ?? SEV.low
          const factors = Object.entries(r.factors || {}).sort((a, b) => b[1].weighted - a[1].weighted).slice(0, 2)
          return (
            <div key={r.supplier_id}
              onClick={() => navigate(`/risks/${r.supplier_id}`)}
              style={{ display: 'flex', alignItems: 'center', padding: '0.875rem 1.25rem', borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 150ms ease' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--bg-hover)' }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}>
              <div style={{ position: 'relative', marginRight: '1rem', flexShrink: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: '50%', background: sev.bg, color: sev.color, border: `1px solid ${sev.border}`, fontWeight: 800, fontSize: '0.9375rem', boxShadow: `0 2px 6px ${sev.color}20` }}>
                  {r.supplier_name.charAt(0)}
                </div>
                <div style={{ position: 'absolute', bottom: -1, right: -1, width: 10, height: 10, borderRadius: '50%', background: sev.color, border: '2px solid var(--bg-card)' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginBottom: '2px' }}>{r.supplier_name}</div>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.375rem', marginTop: '2px' }}>
                  <span style={{ fontSize: '0.625rem', fontWeight: 800, color: sev.color, background: sev.bg, padding: '1px 5px', borderRadius: 4, border: `1px solid ${sev.border}`, textTransform: 'uppercase' }}>{sev.label}</span>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-2)', background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>Score: {Math.round(r.overall_score)}</span>
                  <span style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', background: 'var(--bg-hover)', padding: '1px 5px', borderRadius: 4, border: '1px solid var(--border)' }}>{Math.round(r.confidence * 100)}% Conf.</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '4px', flexWrap: 'wrap' }}>
                  {factors.map(([key]) => {
                    const cleanKey = key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
                    return (
                      <span key={key} style={{ fontSize: '0.625rem', fontWeight: 600, color: 'var(--ink-3)', background: 'var(--bg-hover)', padding: '0px 4px', borderRadius: 3, border: '1px dashed var(--border)' }}>
                        {cleanKey.replace(' Exposure', '').replace(' Pressure', '').replace(' Vulnerability', '').replace(' Reliability', '')}
                      </span>
                    )
                  })}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0, paddingLeft: '1rem' }}>
                <div style={{ fontSize: '0.875rem', fontWeight: 800, color: 'var(--ink-1)', fontFamily: 'JetBrains Mono, monospace' }}>{card ? formatINR(card.financial_exposure_inr) : '—'}</div>
                {card && (
                  <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', fontWeight: 600, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '3px', justifyContent: 'flex-end' }}>
                    <Clock size={10} /> {card.days_to_stockout}d buffer
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Daily Savings Chart ─────────────────────────────────────────────── */
function DailySavingsChart({ actionCards }: { actionCards: ActionCard[] }) {
  const [timeframe, setTimeframe] = useState<'days'|'weeks'|'months'|'years'>('days')

  const { chartData, totalSaved } = useMemo(() => {
    const today = new Date()
    const map = new Map<string, number>()
    let steps = 14
    
    if (timeframe === 'days') {
      steps = 14
      for (let i = steps - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i)
        map.set(d.toISOString().slice(0, 10), 0)
      }
    } else if (timeframe === 'weeks') {
      steps = 12
      for (let i = steps - 1; i >= 0; i--) {
        const d = new Date(today); d.setDate(d.getDate() - i * 7)
        const weekNum = Math.ceil((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 / 7)
        map.set(`W${weekNum} ${d.getFullYear().toString().slice(2)}`, 0)
      }
    } else if (timeframe === 'months') {
      steps = 12
      for (let i = steps - 1; i >= 0; i--) {
        const d = new Date(today.getFullYear(), today.getMonth() - i, 1)
        map.set(`${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear().toString().slice(2)}`, 0)
      }
    } else if (timeframe === 'years') {
      steps = 5
      for (let i = steps - 1; i >= 0; i--) {
        map.set(`${today.getFullYear() - i}`, 0)
      }
    }

    for (const card of actionCards) {
      if (!card.is_resolved || !card.resolved_at || card.estimated_impact_inr <= 0) continue
      const d = new Date(card.resolved_at)
      let key = ''
      if (timeframe === 'days') {
        key = d.toISOString().slice(0, 10)
      } else if (timeframe === 'weeks') {
        const weekNum = Math.ceil((d.getTime() - new Date(d.getFullYear(), 0, 1).getTime()) / 86400000 / 7)
        key = `W${weekNum} ${d.getFullYear().toString().slice(2)}`
      } else if (timeframe === 'months') {
        key = `${d.toLocaleString('default', { month: 'short' })} ${d.getFullYear().toString().slice(2)}`
      } else if (timeframe === 'years') {
        key = `${d.getFullYear()}`
      }
      if (map.has(key)) map.set(key, map.get(key)! + card.estimated_impact_inr)
    }

    const data = [...map.entries()].map(([k, v]) => ({
      label: k.includes('-') ? new Date(k + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : k,
      value: v
    }))
    return { chartData: data, totalSaved: data.reduce((s, d) => s + d.value, 0) }
  }, [actionCards, timeframe])

  const maxVal = Math.max(...chartData.map(d => d.value), 1)
  const hasSavings = totalSaved > 0

  const W = 500, H = 220, PT = 20, PB = 30, PL = 60, PR = 20
  const chartW = W - PL - PR, chartH = H - PT - PB

  const pts = chartData.map((d, i) => ({
    x: PL + (i / Math.max(1, chartData.length - 1)) * chartW,
    y: PT + chartH - (d.value / maxVal) * chartH
  }))

  let dPath = pts.length > 0 ? `M ${pts[0].x} ${pts[0].y}` : ''
  for (let i = 0; i < pts.length - 1; i++) {
    const cx = (pts[i].x + pts[i+1].x) / 2
    dPath += ` C ${cx} ${pts[i].y}, ${cx} ${pts[i+1].y}, ${pts[i+1].x} ${pts[i+1].y}`
  }
  const fillPath = pts.length > 0 ? dPath + ` L ${pts[pts.length-1].x} ${PT+chartH} L ${pts[0].x} ${PT+chartH} Z` : ''

  const yTicks = [0, 0.5, 1].map(p => ({
    y: PT + chartH - p * chartH, label: p > 0 ? formatINR(maxVal * p) : '₹0', pct: p,
  }))

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--ink-1)' }}>Money Saved</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--ink-4)', marginTop: '2px' }}>Value of resolved actions</div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '1.25rem', fontWeight: 900, color: 'var(--ink-1)', fontFamily: 'JetBrains Mono, monospace', lineHeight: 1 }}>{formatINR(totalSaved)}</div>
          </div>
          <div style={{ display: 'flex', gap: '2px', background: 'var(--bg-hover)', padding: '2px', borderRadius: '6px', border: '1px solid var(--border)' }}>
            {(['days', 'weeks', 'months', 'years'] as const).map(t => (
              <button
                key={t}
                onClick={() => setTimeframe(t)}
                style={{
                  padding: '0.25rem 0.5rem',
                  borderRadius: '4px',
                  border: 'none',
                  background: timeframe === t ? 'var(--bg-card)' : 'transparent',
                  color: timeframe === t ? 'var(--ink-1)' : 'var(--ink-3)',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: timeframe === t ? 'var(--shadow-sm)' : 'none',
                  transition: 'all 150ms ease',
                  textTransform: 'capitalize'
                }}
              >
                {t}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div style={{ flex: 1, position: 'relative', minHeight: 180, marginTop: '1rem' }}>
        {!hasSavings ? (
           <div style={{ display: 'flex', height: '100%', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>No data for this period</div>
        ) : (
          <svg width="100%" height="100%" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ overflow: 'visible', display: 'block' }}>
            <defs>
              <linearGradient id="lineFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#3B82F6" stopOpacity="0.2" />
                <stop offset="100%" stopColor="#3B82F6" stopOpacity="0" />
              </linearGradient>
            </defs>
            {yTicks.map(t => (
              <g key={t.y}>
                <line x1={PL} y1={t.y} x2={W - PR} y2={t.y} stroke="var(--border)" strokeWidth={1} strokeDasharray="4 4" />
                <text x={PL - 8} y={t.y + 4} textAnchor="end" style={{ fontSize: '10px', fill: 'var(--ink-4)', fontFamily: 'JetBrains Mono, monospace', fontWeight: 600 }}>{t.label}</text>
              </g>
            ))}
            <path d={fillPath} fill="url(#lineFill)" />
            <path d={dPath} fill="none" stroke="#3B82F6" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round" />
            {chartData.map((d, i) => {
              if (chartData.length > 8 && i % 2 !== 0 && i !== chartData.length - 1) return null
              return (
                <text key={i} x={pts[i].x} y={H - 8} textAnchor="middle" style={{ fontSize: '9px', fill: 'var(--ink-4)', fontWeight: 600 }}>
                  {d.label}
                </text>
              )
            })}
          </svg>
        )}
      </div>
    </div>
  )
}

/* ── Exposure Donut Chart ────────────────────────────────────────────── */
function ExposureDonutChart({ activeRisks, cardMap }: { activeRisks: SupplierRiskAnalysis[], cardMap: Map<string, IntelligentActionCard> }) {
  const colors = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']
  
  const data = useMemo(() => {
    const list = activeRisks.map(r => ({
      name: r.supplier_name,
      value: cardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0
    })).filter(x => x.value > 0).sort((a, b) => b.value - a.value)
    
    const top = list.slice(0, 4)
    const otherVal = list.slice(4).reduce((s, x) => s + x.value, 0)
    if (otherVal > 0) top.push({ name: 'Others', value: otherVal })
    return top
  }, [activeRisks, cardMap])

  const total = data.reduce((s, d) => s + d.value, 0)
  let offset = 0

  const categorySummary = useMemo(() => {
    const map = new Map<string, number>()
    for (const r of activeRisks) {
      const card = cardMap.get(r.supplier_id)
      if (!card) continue
      const cat = card.category || 'Other'
      map.set(cat, (map.get(cat) || 0) + card.financial_exposure_inr)
    }
    const sorted = [...map.entries()].sort((a, b) => b[1] - a[1])
    return sorted[0] ? { name: sorted[0][0], value: sorted[0][1] } : null
  }, [activeRisks, cardMap])

  return (
    <div className="card" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem', height: '100%' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--ink-1)' }}>Suppliers Distribution</div>
          <div style={{ fontSize: '0.8125rem', color: 'var(--ink-4)', marginTop: '2px' }}>Money at risk by supplier</div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '2.5rem', marginTop: '0.5rem' }}>
        <div style={{ width: 140, height: 140, position: 'relative', filter: 'drop-shadow(0 8px 12px rgba(0,0,0,0.08))', flexShrink: 0 }}>
          {total > 0 ? (
            <svg viewBox="0 0 42 42" style={{ transform: 'rotate(-90deg)', width: '100%', height: '100%', overflow: 'visible' }}>
              <circle cx="21" cy="21" r="15.915" fill="#ffffff" stroke="var(--bg-hover)" strokeWidth="6" />
              {data.map((d, i) => {
                const pct = (d.value / total) * 100
                const dasharray = `${pct} ${100 - pct}`
                const dashoffset = -offset
                offset += pct
                return (
                  <circle key={d.name} cx="21" cy="21" r="15.915" fill="transparent"
                    stroke={colors[i % colors.length]} strokeWidth="6"
                    strokeDasharray={dasharray} strokeDashoffset={dashoffset}
                    style={{ transition: 'stroke-dasharray 1s cubic-bezier(0.4, 0, 0.2, 1)' }}
                    strokeLinecap={pct < 100 ? "round" : "butt"}
                  />
                )
              })}
            </svg>
          ) : (
            <div style={{ width: '100%', height: '100%', borderRadius: '50%', border: '6px solid var(--bg-hover)', background: '#fff' }} />
          )}
          <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, rgba(0,0,0,0.02) 0%, transparent 60%)', borderRadius: '50%' }}>
            <span style={{ fontSize: '0.625rem', color: 'var(--ink-4)', fontWeight: 600, letterSpacing: '0.05em', textTransform: 'uppercase' }}>Total Risk</span>
            <span style={{ fontSize: '1.125rem', fontWeight: 900, color: 'var(--ink-1)', fontFamily: 'JetBrains Mono, monospace', marginTop: '1px', letterSpacing: '-0.02em' }}>{formatINR(total)}</span>
          </div>
        </div>
        
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
          {data.length === 0 && <div style={{ fontSize: '0.875rem', color: 'var(--ink-4)' }}>No suppliers at risk</div>}
          {data.map((d, i) => (
            <div key={d.name} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0.375rem 0', borderBottom: i < data.length - 1 ? '1px dashed var(--border)' : 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                <span style={{ width: 10, height: 10, borderRadius: '3px', background: colors[i % colors.length], boxShadow: `0 2px 4px ${colors[i % colors.length]}30`, flexShrink: 0 }} />
                <span style={{ color: 'var(--ink-1)', fontWeight: 700, fontSize: '0.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={d.name}>{d.name}</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', textAlign: 'right', flexShrink: 0 }}>
                <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: 'var(--ink-2)', fontFamily: 'JetBrains Mono, monospace' }}>{formatINR(d.value)}</span>
                <span style={{ fontWeight: 800, color: 'var(--ink-4)', width: '32px', fontSize: '0.6875rem', background: 'var(--bg-hover)', padding: '1px 3px', borderRadius: '3px', textAlign: 'center' }}>{((d.value / total) * 100).toFixed(0)}%</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {categorySummary && total > 0 && (
        <div style={{ marginTop: '0.25rem', padding: '0.5rem 0.75rem', background: 'var(--bg-hover)', borderRadius: '0.5rem', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
            <AlertTriangle size={12} color="#D97706" style={{ flexShrink: 0 }} />
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Highest exposure category: <strong style={{ color: 'var(--ink-1)' }}>{categorySummary.name}</strong>
            </span>
          </div>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-1)', flexShrink: 0, fontFamily: 'JetBrains Mono, monospace' }}>
            {formatINR(categorySummary.value)} ({((categorySummary.value / total) * 100).toFixed(0)}%)
          </span>
        </div>
      )}
    </div>
  )
}

/* ── Dashboard ───────────────────────────────────────────────────────── */
export function Dashboard() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  useDashboardSummary()
  const { data: risks, isLoading: loadingRisks }   = useWeightedRiskAnalysis()
  const { data: disruptions, isLoading: loadingD } = useDisruptions()
  const { data: stockout }                         = useStockoutForecast()
  const { data: actionData }                       = useActionCards()
  const { data: procCards }                        = useProcurementCards()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const allCards = actionData?.action_cards ?? []

  const cardMap = useMemo(
    () => new Map((procCards as IntelligentActionCard[] | undefined ?? []).map(c => [c.supplier_id, c])),
    [procCards]
  )

  const resolvedSupplierIds = useMemo(() => {
    const map = new Map<string, { resolved: number; total: number }>()
    for (const c of allCards) {
      if (!c.supplier_id) continue
      const e = map.get(c.supplier_id) ?? { resolved: 0, total: 0 }
      e.total++; if (c.is_resolved) e.resolved++
      map.set(c.supplier_id, e)
    }
    return new Set([...map.entries()].filter(([, { resolved, total }]) => total > 0 && resolved === total).map(([id]) => id))
  }, [allCards])

  const activeRiskList = useMemo(() => riskList.filter(r => {
    if (resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = cardMap.get(r.supplier_id)
    return card && card.financial_exposure_inr > 0
  }), [riskList, resolvedSupplierIds, cardMap])

  const activeExposure = useMemo(
    () => activeRiskList.reduce((s, r) => s + (cardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0), 0),
    [activeRiskList, cardMap]
  )

  const sortedActive = useMemo(() => {
    const order: Record<string, number> = { critical: 0, high: 1, medium: 2 }
    return [...activeRiskList].sort((a, b) => {
      const lo = (order[a.risk_level] ?? 3) - (order[b.risk_level] ?? 3)
      if (lo !== 0) return lo
      const da = cardMap.get(a.supplier_id)?.days_to_stockout ?? 999
      const db = cardMap.get(b.supplier_id)?.days_to_stockout ?? 999
      return da !== db ? da - db : (cardMap.get(b.supplier_id)?.financial_exposure_inr ?? 0) - (cardMap.get(a.supplier_id)?.financial_exposure_inr ?? 0)
    })
  }, [activeRiskList, cardMap])

  const criticalCount      = activeRiskList.filter(r => r.risk_level === 'critical').length
  const highCount          = activeRiskList.filter(r => r.risk_level === 'high').length
  const disruptions_active = (disruptions?.disruptions ?? []).filter((d: any) => d.is_active && d.severity !== 'low').length

  useEffect(() => {
    api.syncRisks().then(({ synced }) => {
      if (synced > 0) queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
    }).catch(() => {})
  }, [queryClient])

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Header ──────────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
          <div className="section-label" style={{ marginBottom: '0.2rem' }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 900, color: 'var(--ink-1)', letterSpacing: '-0.03em', lineHeight: 1 }}>Dashboard</h1>
        </div>
      </div>

      {/* ── Marquee News ─────────────────────────────────────────────── */}
      {!loadingD && <AlertMarquee disruptions={disruptions?.disruptions ?? []} />}
      {loadingD && <Sk h={60} />}

      {/* ── 4 KPI cards ─────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1.25rem' }}>
        <KpiCard label="Total Suppliers at Risk" icon={<Users size={16} />}
          value={loadingRisks ? '—' : activeRiskList.length}
          sub={criticalCount > 0 ? `${criticalCount} critical · ${highCount} high` : highCount > 0 ? `${highCount} high` : 'All stable'}
          onClick={() => navigate('/risks')} loading={loadingRisks}>
            {activeRiskList.length > 0 && (
              <div style={{ display: 'flex', height: 4, width: 40, borderRadius: 2, overflow: 'hidden', background: 'var(--bg-hover)' }}>
                <div style={{ width: `${(criticalCount/activeRiskList.length)*100}%`, background: '#DC2626' }} />
                <div style={{ width: `${(highCount/activeRiskList.length)*100}%`, background: '#D97706' }} />
              </div>
            )}
        </KpiCard>
        <KpiCard label="Total Financial Exposure" icon={<TrendingDown size={16} />}
          value={loadingRisks ? '—' : formatINR(activeExposure)} sub="At risk"
          onClick={() => navigate('/risks')} loading={loadingRisks}>
             <div style={{ padding: '2px 6px', background: '#FEF2F2', color: '#DC2626', borderRadius: 4, fontSize: '0.625rem', fontWeight: 800, display: 'flex', alignItems: 'center', gap: '2px' }}>
                <TrendingDown size={10} /> {loadingRisks ? '—' : 'High'}
             </div>
        </KpiCard>
        <KpiCard label="Critical Stockouts" icon={<Package size={16} />}
          value={stockout?.critical_count ?? '—'} sub="SKUs critical"
          onClick={() => navigate('/risks')}>
             <div style={{ padding: '2px 6px', background: '#FFFBEB', color: '#D97706', borderRadius: 4, fontSize: '0.625rem', fontWeight: 800 }}>
                Requires Action
             </div>
        </KpiCard>
        <KpiCard label="Active Disruptions" icon={<Activity size={16} />}
          value={loadingD ? '—' : disruptions_active} sub="Active alerts"
          onClick={() => navigate('/disruptions')} loading={loadingD}>
             <span style={{ width: 6, height: 6, borderRadius: '50%', background: disruptions_active > 0 ? '#DC2626' : '#059669', animation: disruptions_active > 0 ? 'livePulse 1.5s ease-in-out infinite' : 'none' }} />
        </KpiCard>
      </div>

      {/* ── Row 2: Act Today & Daily Savings ───────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
        <div className="card-flush" style={{ display: 'flex', flexDirection: 'column', maxHeight: '480px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '1.25rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem' }}>
              <span style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--ink-1)' }}>Pending Actions</span>
              {sortedActive.length > 0 && (
                <span style={{ fontSize: '0.75rem', fontWeight: 700, padding: '2px 8px', background: 'var(--bg-hover)', color: 'var(--ink-3)', border: '1px solid var(--border)', borderRadius: '99px' }}>
                  {sortedActive.length}
                </span>
              )}
            </div>
            <button onClick={() => navigate('/actions')}
              style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '2px' }}>
              View all <ChevronRight size={14} />
            </button>
          </div>
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {loadingRisks ? (
              <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}><Sk h={60} /><Sk h={60} /><Sk h={60} /></div>
            ) : sortedActive.length === 0 ? (
              <div style={{ padding: '3rem', textAlign: 'center' }}>
                <ShieldCheck size={36} color="var(--ink-4)" style={{ margin: '0 auto 1rem' }} />
                <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: 'var(--ink-1)' }}>Nothing to act on</div>
                <div style={{ fontSize: '0.875rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>All suppliers look healthy</div>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '500px' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)', background: 'var(--bg-hover)' }}>
                      <th style={{ width: '32%', padding: '0.625rem 1rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Supplier</th>
                      <th style={{ width: '25%', padding: '0.625rem 1rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Risk & Reason</th>
                      <th style={{ width: '20%', padding: '0.625rem 1rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'left' }}>Stock Buffer</th>
                      <th style={{ width: '15%', padding: '0.625rem 1rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}>Exposure</th>
                      <th style={{ width: '8%', padding: '0.625rem 1rem', fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.05em', textAlign: 'right' }}></th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedActive.map(r => {
                      const card = cardMap.get(r.supplier_id)
                      if (!card) return null
                      return <ActTodayRow key={r.supplier_id} risk={r} card={card} />
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>

        <DailySavingsChart actionCards={allCards} />
      </div>

      {/* ── Row 3: Exposure Donut & Suppliers at Risk ───────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem', marginTop: '0.5rem' }}>
        <ExposureDonutChart activeRisks={sortedActive} cardMap={cardMap} />
        <SupplierListRight risks={sortedActive} cardMap={cardMap} />
      </div>
    </div>
  )
}
