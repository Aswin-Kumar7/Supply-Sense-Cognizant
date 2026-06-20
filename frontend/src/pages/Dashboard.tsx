import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, Cell,
} from 'recharts'
import {
  useDisruptions, useStockoutForecast,
  useActionCards, useProcurementCards, useWeightedRiskAnalysis,
  useExecutiveBrief,
} from '../hooks/useQueries'
import { useSSE } from '../hooks/useSSE'
import type { SupplierRiskAnalysis, IntelligentActionCard, ActionCard } from '../types'
import {
  AlertTriangle, TrendingDown, ArrowRight, Shield,
  Package, Activity, Zap, ChevronRight,
} from 'lucide-react'

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function getTopFactor(factors: SupplierRiskAnalysis['factors']): string {
  if (!factors) return ''
  return Object.entries(factors).sort(([, a], [, b]) => b.weighted - a.weighted)[0]?.[0] ?? ''
}

const FACTOR_LABEL: Record<string, string> = {
  disruption_severity:     'Active disruption affecting supply',
  inventory_pressure:      'Stock levels critically low',
  delivery_reliability:    'Delivery delays reported',
  logistics_vulnerability: 'Logistics risk elevated',
  dependency_exposure:     'Heavy dependency on this supplier',
  festival_proximity:      'Demand spike — festival season',
}

function getReason(risk: SupplierRiskAnalysis, card: IntelligentActionCard): string {
  if (card.days_to_stockout <= 3) return `Stock runs out in ${card.days_to_stockout} days`
  if (card.days_to_stockout <= 7) return `Only ${card.days_to_stockout} days of stock left`
  return FACTOR_LABEL[getTopFactor(risk.factors)] ?? card.title ?? 'Elevated supply risk'
}

const SEV: Record<string, { color: string; bg: string; border: string; label: string }> = {
  critical: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.12)', label: 'Critical' },
  high:     { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.12)', label: 'High'     },
  medium:   { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.12)', label: 'Medium'   },
  low:      { color: '#10B981', bg: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.12)', label: 'Low'      },
}

const CSS = `
  @keyframes dash-fade-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes dash-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
  @keyframes dash-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
  .dash-skeleton {
    background: linear-gradient(90deg, #F1F5F9 25%, #E2E8F0 50%, #F1F5F9 75%);
    background-size: 200% 100%;
    animation: dash-shimmer 1.6s ease-in-out infinite;
    border-radius: 6px;
  }
  .dash-hover:hover { background: rgba(248, 250, 252, 0.6) !important; }
  .dash-item-hover {
    transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid transparent;
  }
  .dash-item-hover:hover {
    background: #FFFFFF !important;
    border-color: #E2E8F0 !important;
    box-shadow: 0 4px 12px rgba(15, 23, 42, 0.03) !important;
    transform: translateX(4px);
  }
  .recharts-cartesian-grid-horizontal line,
  .recharts-cartesian-grid-vertical line { stroke: #F1F5F9 !important; }

  @keyframes ticker-slide {
    0% { transform: translate3d(0, 0, 0); }
    100% { transform: translate3d(-33.3333%, 0, 0); }
  }
  .ticker-container {
    display: flex;
    align-items: center;
    overflow: hidden;
    width: 100%;
    position: relative;
    mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent);
    -webkit-mask-image: linear-gradient(to right, transparent, black 16px, black calc(100% - 16px), transparent);
  }
  .ticker-track {
    display: inline-flex;
    white-space: nowrap;
    animation: ticker-slide 32s linear infinite;
  }
  .ticker-track:hover {
    animation-play-state: paused;
  }
`

function Skeleton({ w = '100%', h = 20 }: { w?: string | number; h?: number }) {
  return <div className="dash-skeleton" style={{ width: w, height: h }} />
}

function Num({ children, size = '2rem', color = '#0F172A' }: { children: React.ReactNode; size?: string; color?: string }) {
  return (
    <span style={{
      fontFamily: "'Inter', system-ui, sans-serif", fontWeight: 800, fontSize: size, color,
      letterSpacing: '-0.03em', lineHeight: 1, fontVariantNumeric: 'tabular-nums',
    }}>{children}</span>
  )
}

function Card({ children, style, hover }: { children: React.ReactNode; style?: React.CSSProperties; hover?: boolean }) {
  return (
    <div
      style={{
        background: 'linear-gradient(180deg, #FFFFFF 0%, #FAFBFC 100%)',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        overflow: 'hidden',
        boxShadow: '0 1px 3px rgba(15, 23, 42, 0.02), 0 4px 12px rgba(15, 23, 42, 0.03)',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
      onMouseEnter={e => {
        if (hover) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(15, 23, 42, 0.06)'
          e.currentTarget.style.borderColor = '#CBD5E1'
        }
      }}
      onMouseLeave={e => {
        if (hover) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 1px 3px rgba(15, 23, 42, 0.02), 0 4px 12px rgba(15, 23, 42, 0.03)'
          e.currentTarget.style.borderColor = '#E2E8F0'
        }
      }}
    >
      {children}
    </div>
  )
}

function CardHeader({ title, sub, right }: { title: string; sub?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #F1F5F9' }}>
      <div>
        <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A' }}>{title}</div>
        {sub && <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>{sub}</div>}
      </div>
      {right}
    </div>
  )
}

function ViewAllBtn({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick} style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B', background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '2px' }}>
      View all <ChevronRight size={12} />
    </button>
  )
}

/* ── Page Header ─────────────────────────────────────────────────────── */
function DashboardHeader({ exposure, riskCount, totalSuppliers, loading }: { exposure: number; riskCount: number; totalSuppliers: number; loading: boolean }) {
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      borderBottom: '1px solid #E2E8F0',
      paddingBottom: '20px',
      marginBottom: '8px',
      animation: 'dash-fade-in 0.25s ease-out',
      flexWrap: 'wrap',
      gap: '16px'
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
          <span style={{
            fontSize: '0.6875rem',
            fontWeight: 700,
            color: '#4F46E5',
            background: 'rgba(79, 70, 229, 0.05)',
            border: '1px solid rgba(79, 70, 229, 0.12)',
            padding: '2px 8px',
            borderRadius: '4px',
            textTransform: 'uppercase',
            letterSpacing: '0.05em'
          }}>
            Supply Chain Command
          </span>
          <span style={{ fontSize: '0.75rem', color: '#CBD5E1' }}>•</span>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>{date}</span>
        </div>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', margin: 0, lineHeight: 1.1 }}>
          Operational Overview
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748B', fontWeight: 400, marginTop: '6px', marginBottom: 0, lineHeight: 1.5 }}>
          {loading ? 'Analyzing supply network pathways...' :
           riskCount === 0 ? `Monitoring ${totalSuppliers} active supply paths. All nodes stable.` :
           `Monitoring ${totalSuppliers} active paths. ${riskCount} supplier${riskCount > 1 ? 's' : ''} require attention — ${formatINR(exposure)} at risk.`
          }
        </p>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
        <div style={{ textAlign: 'right', paddingLeft: '16px', borderLeft: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Active Nodes</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            {loading ? '—' : totalSuppliers}
          </div>
        </div>
        <div style={{ textAlign: 'right', paddingLeft: '16px', borderLeft: '1px solid #E2E8F0' }}>
          <div style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Risk Ratio</div>
          <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#0F172A', marginTop: '2px', fontFamily: "'Inter', sans-serif" }}>
            {loading ? '—' : `${((riskCount / Math.max(1, totalSuppliers)) * 100).toFixed(0)}%`}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Alert Banner ────────────────────────────────────────────────────── */
function AlertBanner({ disruptions }: { disruptions: any[] }) {
  const navigate = useNavigate()
  const active = disruptions.filter(d => d.is_active && d.severity !== 'low')
  if (active.length === 0) return null

  return (
    <Card style={{ 
      padding: '6px 12px', 
      display: 'flex', 
      alignItems: 'center', 
      gap: '12px',
      background: 'rgba(255, 255, 255, 0.8)',
      backdropFilter: 'blur(8px)',
      border: '1px solid rgba(226, 232, 240, 0.8)',
    }}>
      {/* Pinned left title label */}
      <div style={{ 
        display: 'flex', 
        alignItems: 'center', 
        gap: '6px', 
        flexShrink: 0, 
        paddingRight: '12px', 
        borderRight: '1px solid #E2E8F0',
        zIndex: 5
      }}>
        <span style={{ 
          width: 6, 
          height: 6, 
          borderRadius: '50%', 
          background: '#EF4444', 
          animation: 'dash-pulse 2s ease-in-out infinite', 
          boxShadow: '0 0 6px #EF4444' 
        }} />
        <span style={{ 
          fontSize: '0.6875rem', 
          fontWeight: 750, 
          color: '#EF4444', 
          textTransform: 'uppercase', 
          letterSpacing: '0.08em' 
        }}>
          Live Alerts
        </span>
      </div>

      {/* Scrolling ticker track */}
      <div className="ticker-container">
        <div className="ticker-track">
          {/* We repeat active items list 3 times for a perfect seamless CSS infinite loop */}
          {[...active, ...active, ...active].map((item, i) => {
            const sev = SEV[item.severity] ?? SEV.low
            return (
              <span
                key={i}
                onClick={() => navigate('/disruptions')}
                style={{
                  display: 'inline-flex', 
                  alignItems: 'center', 
                  gap: '6px',
                  margin: '0 12px', 
                  cursor: 'pointer', 
                  flexShrink: 0,
                  padding: '4px 10px', 
                  borderRadius: '6px', 
                  background: '#FFFFFF',
                  border: '1px solid #E2E8F0',
                  boxShadow: '0 1px 2px rgba(15, 23, 42, 0.02)',
                  transition: 'all 150ms ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.borderColor = sev.color
                  e.currentTarget.style.background = sev.bg
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.borderColor = '#E2E8F0'
                  e.currentTarget.style.background = '#FFFFFF'
                }}
              >
                <span style={{ width: 5, height: 5, borderRadius: '50%', background: sev.color }} />
                <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#334155' }}>{item.title}</span>
                {item.region && <span style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 500 }}>· {item.region}</span>}
              </span>
            )
          })}
        </div>
      </div>
    </Card>
  )
}

/* ── Consolidated Mitigation & Savings ───────────────────────────────── */
function MitigationSavingsOverview({ actionCards }: { actionCards: ActionCard[] }) {
  const [view, setView] = useState<'cumulative' | 'weekly'>('cumulative')
  const [period, setPeriod] = useState<'7d' | '14d' | '30d'>('14d')

  // Cumulative savings logic
  const potentialSavings = useMemo(() => {
    return actionCards
      .filter(c => !c.is_resolved && c.estimated_impact_inr > 0)
      .reduce((sum, c) => sum + c.estimated_impact_inr, 0)
  }, [actionCards])

  const cumulativeData = useMemo(() => {
    const days = period === '7d' ? 7 : period === '14d' ? 14 : 30
    const today = new Date()
    const result: { date: string; label: string; saved: number; potential: number }[] = []
    for (let i = days - 1; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      result.push({ 
        date: d.toISOString().slice(0, 10), 
        label: d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }), 
        saved: 0,
        potential: 0
      })
    }
    for (const card of actionCards) {
      if (!card.is_resolved || !card.resolved_at || card.estimated_impact_inr <= 0) continue
      const key = new Date(card.resolved_at).toISOString().slice(0, 10)
      const entry = result.find(r => r.date === key)
      if (entry) entry.saved += card.estimated_impact_inr
    }
    
    let cumSaved = 0
    let cumPotential = 0
    const dailyPotentialIncrement = potentialSavings / days
    
    result.forEach((r) => {
      cumSaved += r.saved
      r.saved = cumSaved
      cumPotential += dailyPotentialIncrement
      r.potential = cumSaved + cumPotential
    })
    return result
  }, [actionCards, period, potentialSavings])

  const totalSaved = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].saved : 0
  const maxPotential = cumulativeData.length > 0 ? cumulativeData[cumulativeData.length - 1].potential : 0

  // Weekly resolved/pending logic
  const weeklyData = useMemo(() => {
    const map = new Map<string, { resolved: number; pending: number }>()
    const today = new Date()
    for (let i = 6; i >= 0; i--) {
      const d = new Date(today); d.setDate(d.getDate() - i)
      map.set(d.toLocaleDateString('en-IN', { weekday: 'short' }), { resolved: 0, pending: 0 })
    }
    for (const card of actionCards) {
      if (card.estimated_impact_inr <= 0) continue
      const label = new Date(card.created_at).toLocaleDateString('en-IN', { weekday: 'short' })
      const entry = map.get(label)
      if (entry) { 
        if (card.is_resolved) entry.resolved += card.estimated_impact_inr
        else entry.pending += card.estimated_impact_inr 
      }
    }
    return [...map.entries()].map(([day, v]) => ({ day, ...v }))
  }, [actionCards])

  const ChartTooltip = ({ active, payload, label }: any) => {
    if (!active || !payload?.length) return null
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '10px 12px', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
        <div style={{ fontSize: '0.625rem', color: '#64748B', marginBottom: '4px' }}>{label}</div>
        {payload.map((p: any) => (
          <div key={p.name || p.dataKey} style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
            <div style={{ width: 6, height: 6, borderRadius: p.name ? '50%' : '2px', background: p.color }} />
            <span style={{ fontSize: '0.6875rem', color: '#64748B', marginRight: '4px' }}>{p.name || (p.dataKey === 'resolved' ? 'Resolved' : 'Pending')}:</span>
            <span style={{ fontSize: '0.75rem', color: '#0F172A', fontWeight: 700 }}>{formatINR(p.value)}</span>
          </div>
        ))}
      </div>
    )
  }

  return (
    <Card style={{ animation: 'dash-fade-in 0.3s ease-out' }}>
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid #F1F5F9' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A' }}>Mitigation & Savings</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '2px' }}>
              {view === 'cumulative' ? 'Cumulative realized savings vs potential unmitigated risk exposure' : 'Daily analysis of resolved vs pending actions this week'}
            </div>
          </div>
          
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* View Switcher: Cumulative vs Weekly */}
            <div style={{ display: 'flex', gap: '1px', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
              <button 
                onClick={() => setView('cumulative')} 
                style={{
                  padding: '4px 10px', borderRadius: '5px', border: 'none',
                  background: view === 'cumulative' ? '#FFFFFF' : 'transparent',
                  color: view === 'cumulative' ? '#0F172A' : '#64748B',
                  fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                  boxShadow: view === 'cumulative' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 150ms ease',
                }}
              >
                Cumulative Trend
              </button>
              <button 
                onClick={() => setView('weekly')} 
                style={{
                  padding: '4px 10px', borderRadius: '5px', border: 'none',
                  background: view === 'weekly' ? '#FFFFFF' : 'transparent',
                  color: view === 'weekly' ? '#0F172A' : '#64748B',
                  fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                  boxShadow: view === 'weekly' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                  transition: 'all 150ms ease',
                }}
              >
                Weekly Influx
              </button>
            </div>

            {/* Timeframe Switcher (only for Cumulative) */}
            {view === 'cumulative' && (
              <div style={{ display: 'flex', gap: '1px', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
                {(['7d', '14d', '30d'] as const).map(p => (
                  <button key={p} onClick={() => setPeriod(p)} style={{
                    padding: '4px 8px', borderRadius: '5px', border: 'none',
                    background: period === p ? '#FFFFFF' : 'transparent',
                    color: period === p ? '#0F172A' : '#94A3B8',
                    fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                    boxShadow: period === p ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    transition: 'all 150ms ease',
                  }}>{p}</button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Legend / Metrics block */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '4px' }}>
              {view === 'cumulative' ? 'Total Saved' : 'Weekly Savings Rate'}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
              <Num size="1.625rem">{formatINR(totalSaved)}</Num>
              {view === 'cumulative' && maxPotential > 0 && (
                <span style={{ fontSize: '0.75rem', color: '#94A3B8' }}>
                  of {formatINR(maxPotential)} potential
                </span>
              )}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '14px', marginBottom: '4px' }}>
            {view === 'cumulative' ? (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4F46E5' }} />
                  <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 500 }}>Realized Savings</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#A5B4FC', border: '1px dashed #4F46E5' }} />
                  <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 500 }}>Unmitigated Exposure</span>
                </div>
              </>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '2px', background: '#0F172A' }} />
                  <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 500 }}>Resolved</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                  <div style={{ width: 8, height: 8, borderRadius: '2px', background: '#CBD5E1' }} />
                  <span style={{ fontSize: '0.6875rem', color: '#64748B', fontWeight: 500 }}>Pending</span>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div style={{ height: 200, padding: '16px 8px 12px' }}>
        {view === 'cumulative' ? (
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={cumulativeData} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="savGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#4F46E5" stopOpacity={0.08} />
                  <stop offset="100%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="0" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#CBD5E1' }} dy={6} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#CBD5E1' }} tickFormatter={v => formatINR(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: '#E2E8F0', strokeDasharray: '3 3' }} />
              <Area name="Unmitigated Exposure" type="monotone" dataKey="potential" stroke="#A5B4FC" strokeDasharray="3 3" strokeWidth={1.5} fill="transparent" dot={false} />
              <Area name="Realized Savings" type="monotone" dataKey="saved" stroke="#4F46E5" strokeWidth={2.2} fill="url(#savGrad)" dot={false} activeDot={{ r: 4, fill: '#4F46E5', strokeWidth: 2, stroke: '#FFF' }} />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={weeklyData} barGap={4} margin={{ top: 8, right: 12, left: -16, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="day" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#CBD5E1' }} dy={4} />
              <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#CBD5E1' }} tickFormatter={v => formatINR(v)} />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: 'rgba(241,245,249,0.2)' }} />
              <Bar name="Resolved" dataKey="resolved" fill="#0F172A" radius={[3, 3, 0, 0]} barSize={12} background={{ fill: 'rgba(15, 23, 42, 0.02)', radius: 3 }} />
              <Bar name="Pending" dataKey="pending" fill="#CBD5E1" radius={[3, 3, 0, 0]} barSize={12} background={{ fill: 'rgba(15, 23, 42, 0.02)', radius: 3 }} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/* ── KPI Cards Helper ────────────────────────────────────────────────── */
const mapKpiTheme = (lbl: string) => {
  if (lbl.includes('Suppliers')) return { icon: AlertTriangle }
  if (lbl.includes('exposure')) return { icon: TrendingDown }
  if (lbl.includes('stockouts')) return { icon: Package }
  return { icon: Activity }
}

/* ── KPI Cards ───────────────────────────────────────────────────────── */
function KpiCard({ label, value, sub, progress, onClick, loading, delay = 0 }: {
  label: string; value: string | number; sub: string; progress: number
  onClick?: () => void; loading?: boolean; delay?: number
}) {
  const theme = mapKpiTheme(label)
  const Icon = theme.icon

  // Determine distinct colors per KPI card to make them visually distinct
  let color = '#4F46E5' // Default indigo
  if (label.toLowerCase().includes('supplier')) color = '#EF4444' // Soft Red for risk
  else if (label.toLowerCase().includes('financial') || label.toLowerCase().includes('exposure')) color = '#F59E0B' // Soft Amber for exposure
  else if (label.toLowerCase().includes('stockout')) color = '#EC4899' // Soft Pink/Rose for critical stockouts
  else if (label.toLowerCase().includes('disruption')) color = '#3B82F6' // Soft Blue for active disruptions

  return (
    <Card hover={!!onClick} style={{
      cursor: onClick ? 'pointer' : 'default',
      animation: `dash-fade-in 0.3s ease-out ${delay}ms both`,
      padding: '20px 24px',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }} onClick={onClick}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginBottom: '6px' }}>{label}</div>
          {loading ? <Skeleton w="55%" h={28} /> : <Num size="1.875rem">{value}</Num>}
          <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '6px', fontWeight: 400 }}>{sub}</div>
        </div>
        <Icon size={18} strokeWidth={1.5} style={{ color: color, flexShrink: 0, marginLeft: '12px', marginTop: '2px' }} />
      </div>
      {/* Dynamic progress bar detail */}
      <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', marginTop: '14px', overflow: 'hidden' }}>
        <div style={{ 
          width: `${Math.min(100, Math.max(5, progress))}%`, 
          height: '100%', 
          background: color, 
          borderRadius: '2px',
          transition: 'width 600ms cubic-bezier(0.16, 1, 0.3, 1)' 
        }} />
      </div>
    </Card>
  )
}

/* ── Supplier Risk Distribution Chart ───────────────────────────────── */
function SupplierRiskDistribution({ risks, loading }: { risks: SupplierRiskAnalysis[]; loading: boolean }) {
  const distribution = useMemo(() => {
    const counts = { critical: 0, high: 0, medium: 0, low: 0 }
    risks.forEach(r => {
      if (r.risk_level === 'critical') counts.critical++
      else if (r.risk_level === 'high') counts.high++
      else if (r.risk_level === 'medium') counts.medium++
      else if (r.risk_level === 'low') counts.low++
    })
    return [
      { name: 'Critical', value: counts.critical, color: '#EF4444' },
      { name: 'High', value: counts.high, color: '#F59E0B' },
      { name: 'Medium', value: counts.medium, color: '#3B82F6' },
      { name: 'Low', value: counts.low, color: '#10B981' }
    ]
  }, [risks])

  const total = useMemo(() => distribution.reduce((sum, item) => sum + item.value, 0), [distribution])

  const ChartTooltip = ({ active, payload }: any) => {
    if (!active || !payload?.length) return null
    const data = payload[0].payload
    return (
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '8px 12px', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <div style={{ width: 6, height: 6, borderRadius: '50%', background: data.color }} />
          <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#0F172A' }}>{data.name}:</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A' }}>{data.value} supplier{data.value !== 1 ? 's' : ''}</span>
        </div>
      </div>
    )
  }

  const SEV_STYLE: Record<string, { bg: string; border: string; text: string }> = {
    Critical: { bg: 'rgba(239, 68, 68, 0.04)', border: '1px solid rgba(239, 68, 68, 0.12)', text: '#EF4444' },
    High:     { bg: 'rgba(245, 158, 11, 0.04)', border: '1px solid rgba(245, 158, 11, 0.12)', text: '#F59E0B' },
    Medium:   { bg: 'rgba(59, 130, 246, 0.04)', border: '1px solid rgba(59, 130, 246, 0.12)', text: '#3B82F6' },
    Low:      { bg: 'rgba(16, 185, 129, 0.04)', border: '1px solid rgba(16, 185, 129, 0.12)', text: '#10B981' },
  }

  return (
    <Card style={{ animation: 'dash-fade-in 0.35s ease-out', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardHeader title="Supplier Risk Tiers" sub="Distribution of suppliers across risk levels" />
      <div style={{ padding: '8px 24px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', flexShrink: 0 }}>
        <div>
          <div style={{ fontSize: '0.6875rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.04em' }}>Total Assessed</div>
          <Num size="1.5rem">{loading ? '—' : total}</Num>
        </div>
        
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          {distribution.map(d => {
            const style = SEV_STYLE[d.name] || { bg: '#F8FAFC', border: '1px solid #E2E8F0', text: '#64748B' }
            return (
              <div key={d.name} style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: '5px', 
                background: style.bg, 
                border: style.border, 
                padding: '3px 8px', 
                borderRadius: '20px' 
              }}>
                <div style={{ width: 5, height: 5, borderRadius: '50%', background: d.color }} />
                <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#334155' }}>{d.name}:</span>
                <span style={{ fontSize: '0.6875rem', fontWeight: 750, color: style.text }}>{d.value}</span>
              </div>
            )
          })}
        </div>
      </div>
      
      <div style={{ flex: 1, minHeight: 180, padding: '16px 24px 16px' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px', height: '100%', justifyContent: 'center' }}><Skeleton h={24} /><Skeleton h={24} /><Skeleton h={24} /></div>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={distribution} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
              <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }} dy={4} />
              <YAxis width={20} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#CBD5E1' }} allowDecimals={false} />
              <Tooltip cursor={{ fill: 'rgba(241,245,249,0.2)' }} content={<ChartTooltip />} />
              <Bar dataKey="value" barSize={32} radius={[4, 4, 0, 0]} background={{ fill: 'rgba(15, 23, 42, 0.02)', radius: 4 }}>
                {distribution.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </Card>
  )
}

/* ── Activity Feed Unified Icon Map (Marker Icons & Colors) ──────────── */
const getTimelineBadge = (type: string, severity: string) => {
  let icon = <Activity size={10} style={{ color: '#475569' }} />
  let bg = 'rgba(71, 85, 105, 0.04)'
  let border = 'rgba(71, 85, 105, 0.1)'
  
  if (severity === 'critical') {
    bg = 'rgba(239, 68, 68, 0.05)'
    border = 'rgba(239, 68, 68, 0.15)'
  } else if (severity === 'high') {
    bg = 'rgba(245, 158, 11, 0.05)'
    border = 'rgba(245, 158, 11, 0.15)'
  } else if (severity === 'medium') {
    bg = 'rgba(59, 130, 246, 0.05)'
    border = 'rgba(59, 130, 246, 0.15)'
  } else if (severity === 'low') {
    bg = 'rgba(16, 185, 129, 0.05)'
    border = 'rgba(16, 185, 129, 0.15)'
  }
  
  const cSlate = severity === 'critical' ? '#EF4444' : severity === 'high' ? '#F59E0B' : severity === 'medium' ? '#3B82F6' : severity === 'low' ? '#10B981' : '#475569'

  if (type === 'disruption_alert' || type === 'stockout_warning') {
    icon = <AlertTriangle size={10} style={{ color: cSlate }} />
  } else if (type === 'action_generated' || type === 'demand_spike' || type === 'risk_update') {
    icon = <Zap size={10} style={{ color: cSlate }} />
  } else if (type === 'inventory_update' || type === 'delivery_update') {
    icon = <Package size={10} style={{ color: cSlate }} />
  } else {
    icon = <Activity size={10} style={{ color: cSlate }} />
  }
  
  return { icon, bg, border }
}

/* ── Activity Timeline ───────────────────────────────────────────────── */
function ActivityTimeline() {
  const navigate = useNavigate()
  const { events } = useSSE({ maxEvents: 6 })

  return (
    <Card style={{ animation: 'dash-fade-in 0.35s ease-out', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardHeader title="Activity" right={<ViewAllBtn onClick={() => navigate('/activity')} />} />
      <div style={{ padding: '16px 24px', flex: 1 }}>
        {events.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <Activity size={22} style={{ color: '#E2E8F0', marginBottom: '6px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#CBD5E1' }}>No recent activity</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {events.map((ev, i) => {
              const badge = getTimelineBadge(ev.event_type, ev.severity)
              const ago = Math.round((Date.now() - new Date(ev.timestamp).getTime()) / 60000)
              const agoLabel = ago < 1 ? 'just now' : ago < 60 ? `${ago}m ago` : `${Math.round(ago / 60)}h ago`
              return (
                <div 
                  key={ev.id || i} 
                  style={{ 
                    display: 'flex', 
                    gap: '14px', 
                    paddingBottom: i < events.length - 1 ? '16px' : '0', 
                    paddingTop: i > 0 ? '16px' : '0', 
                    borderBottom: i < events.length - 1 ? '1px dashed #F1F5F9' : 'none', 
                    position: 'relative' 
                  }}
                >
                  {/* Vertical timeline line */}
                  {i < events.length - 1 && (
                    <div style={{
                      position: 'absolute',
                      left: '11px',
                      top: '26px',
                      bottom: '-16px',
                      width: '1px',
                      background: '#E2E8F0',
                      zIndex: 1,
                    }} />
                  )}
                  {/* Left timeline badge */}
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative', width: '24px' }}>
                    <div style={{
                      width: '24px', height: '24px', borderRadius: '50%',
                      background: badge.bg, border: `1px solid ${badge.border}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      zIndex: 2, flexShrink: 0,
                      marginTop: '2px'
                    }}>
                      {badge.icon}
                    </div>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', color: '#334155', fontWeight: 600, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {ev.message}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#94A3B8', marginTop: '2px' }}>{agoLabel}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ── Exposure Ranking ────────────────────────────────────────────────── */
function ExposureRanking({ risks, cardMap }: { risks: SupplierRiskAnalysis[]; cardMap: Map<string, IntelligentActionCard> }) {
  const navigate = useNavigate()

  const ranked = useMemo(() => {
    return risks
      .map(r => ({ risk: r, card: cardMap.get(r.supplier_id) }))
      .filter(({ card }) => card && card.financial_exposure_inr > 0)
      .sort((a, b) => b.card!.financial_exposure_inr - a.card!.financial_exposure_inr)
      .slice(0, 5)
  }, [risks, cardMap])

  const maxExposure = ranked[0]?.card?.financial_exposure_inr ?? 1

  return (
    <Card style={{ animation: 'dash-fade-in 0.35s ease-out', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardHeader title="Top exposure" sub="Ranked by financial impact" right={<ViewAllBtn onClick={() => navigate('/risks')} />} />
      <div style={{ padding: '8px 24px 16px', flex: 1 }}>
        {ranked.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <Shield size={22} style={{ color: '#E2E8F0', marginBottom: '6px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#CBD5E1' }}>No financial exposure</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {ranked.map(({ risk, card }, i) => {
              const sev = SEV[risk.risk_level] ?? SEV.low
              const pct = (card!.financial_exposure_inr / maxExposure) * 100
              return (
                <div
                  key={risk.supplier_id}
                  onClick={() => navigate(`/risks/${risk.supplier_id}`)}
                  className="dash-item-hover"
                  style={{ cursor: 'pointer', padding: '8px 10px', borderRadius: '8px', transition: 'all 200ms ease' }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                      <span style={{ fontSize: '0.75rem', color: '#CBD5E1', fontWeight: 600, fontVariantNumeric: 'tabular-nums', width: '14px', textAlign: 'right' }}>{i + 1}</span>
                      <div style={{
                        width: 26, height: 26, borderRadius: '6px',
                        background: '#FFFFFF', color: '#334155',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontWeight: 700, fontSize: '0.75rem', flexShrink: 0,
                        border: '1px solid #E2E8F0',
                        boxShadow: '0 1px 2px rgba(15, 23, 42, 0.05)',
                      }}>
                        {risk.supplier_name.charAt(0)}
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {risk.supplier_name}
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '5px', marginTop: '2.5px' }}>
                          <span style={{
                            fontSize: '0.625rem', fontWeight: 600,
                            color: sev.color, background: sev.bg, border: sev.border,
                            padding: '2px 6px', borderRadius: '10px',
                            display: 'inline-flex', alignItems: 'center', gap: '3px'
                          }}>
                            {sev.label}
                          </span>
                          <span style={{ fontSize: '0.6875rem', color: '#94A3B8', display: 'inline-flex', alignItems: 'center', gap: '2px' }}>
                            · {card!.days_to_stockout}d left
                          </span>
                        </div>
                      </div>
                    </div>
                    <Num size="0.875rem">{formatINR(card!.financial_exposure_inr)}</Num>
                  </div>
                  <div style={{ height: 2, background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden', marginLeft: '22px' }}>
                    <div style={{ width: `${pct}%`, height: '100%', background: sev.color, borderRadius: '2px', transition: 'width 500ms ease' }} />
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ── Pending Actions ─────────────────────────────────────────────────── */
function PendingActions({ risks, cardMap, loading }: {
  risks: SupplierRiskAnalysis[]; cardMap: Map<string, IntelligentActionCard>; loading: boolean
}) {
  const navigate = useNavigate()

  return (
    <Card style={{ animation: 'dash-fade-in 0.35s ease-out', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardHeader
        title="Pending actions"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {risks.length > 0 && <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '3px' }}>{risks.length}</span>}
            <ViewAllBtn onClick={() => navigate('/actions')} />
          </div>
        }
      />
      <div style={{ padding: '8px 24px 16px', flex: 1 }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}><Skeleton h={52} /><Skeleton h={52} /><Skeleton h={52} /></div>
        ) : risks.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <Shield size={22} style={{ color: '#E2E8F0', marginBottom: '6px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#0F172A', fontWeight: 600 }}>All clear</div>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>No pending actions</div>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {risks.slice(0, 4).map(r => {
              const card = cardMap.get(r.supplier_id)
              if (!card) return null
              return (
                <div
                  key={r.supplier_id}
                  className="dash-item-hover"
                  onClick={() => navigate(`/risks/${r.supplier_id}/mitigation`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '12px',
                    padding: '10px 12px', borderRadius: '8px', cursor: 'pointer',
                    transition: 'all 200ms ease',
                  }}
                >
                  <div style={{ width: 4, height: 4, borderRadius: '50%', background: '#CBD5E1', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>{r.supplier_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '1px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {getReason(r, card)}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right', flexShrink: 0, marginRight: '8px' }}>
                    <Num size="0.8125rem">{formatINR(card.financial_exposure_inr)}</Num>
                    <div style={{ fontSize: '0.6875rem', color: '#94A3B8', marginTop: '1px' }}>{card.days_to_stockout}d left</div>
                  </div>
                  <ArrowRight size={14} style={{ color: '#CBD5E1', flexShrink: 0 }} />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ── AI Insights ─────────────────────────────────────────────────────── */
function AIInsights() {
  const { data: brief, isLoading } = useExecutiveBrief()

  return (
    <Card style={{ animation: 'dash-fade-in 0.4s ease-out' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '16px 24px', borderBottom: '1px solid #F1F5F9' }}>
        <span style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A' }}>AI Insights</span>
        <span style={{ fontSize: '0.625rem', fontWeight: 500, color: '#94A3B8', border: '1px solid #E2E8F0', padding: '2px 6px', borderRadius: '20px', marginLeft: 'auto', background: '#F8FAFC' }}>Powered by Bedrock</span>
      </div>
      <div style={{ padding: '0' }}>
        {isLoading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', padding: '24px' }}><Skeleton h={14} /><Skeleton w="80%" h={14} /><Skeleton w="60%" h={14} /></div>
        ) : !brief ? (
          <div style={{ padding: '24px', textAlign: 'center', color: '#CBD5E1', fontSize: '0.8125rem' }}>
            Insights will appear when data is available
          </div>
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
            gap: '24px',
            padding: '24px'
          }}>
            {/* Column 1: Summary Callout */}
            <div style={{
              background: 'rgba(79, 70, 229, 0.02)',
              border: '1px solid rgba(79, 70, 229, 0.08)',
              borderRadius: '8px',
              padding: '20px',
              backgroundImage: 'radial-gradient(rgba(79, 70, 229, 0.04) 1px, transparent 1px)',
              backgroundSize: '12px 12px',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'center',
            }}>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#4F46E5', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '8px' }}>Executive Summary</div>
              <p style={{ fontSize: '0.875rem', color: '#334155', lineHeight: 1.6, fontWeight: 500, margin: 0 }}>
                {brief.summary}
              </p>
            </div>

            {/* Column 2: Key Risks */}
            {brief.top_risks?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Key Risks</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {brief.top_risks.slice(0, 3).map((risk, i) => (
                    <div key={i} className="dash-item-hover" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.4, padding: '8px 10px', borderRadius: '6px' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#EF4444', flexShrink: 0, marginTop: '7px' }} />
                      <span style={{ fontWeight: 500 }}>{risk}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Column 3: Recommended Actions */}
            {brief.immediate_actions?.length > 0 && (
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '12px' }}>Recommended Actions</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {brief.immediate_actions.slice(0, 3).map((action, i) => (
                    <div key={i} className="dash-item-hover" style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '0.8125rem', color: '#475569', lineHeight: 1.4, padding: '8px 10px', borderRadius: '6px' }}>
                      <span style={{ width: 4, height: 4, borderRadius: '50%', background: '#F59E0B', flexShrink: 0, marginTop: '7px' }} />
                      <span style={{ fontWeight: 500 }}>{action}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  )
}

/* ── Dashboard ───────────────────────────────────────────────────────── */
export function Dashboard() {
  const navigate = useNavigate()

  const { data: risks, isLoading: loadingRisks } = useWeightedRiskAnalysis()
  const { data: disruptions, isLoading: loadingD } = useDisruptions()
  const { data: stockout } = useStockoutForecast()
  const { data: actionData } = useActionCards()
  const { data: procCards } = useProcurementCards()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const allCards = actionData?.action_cards ?? []

  const cardMap = useMemo(
    () => new Map(((procCards as IntelligentActionCard[] | undefined) ?? []).map(c => [c.supplier_id, c])),
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

  const criticalCount = activeRiskList.filter(r => r.risk_level === 'critical').length
  const highCount = activeRiskList.filter(r => r.risk_level === 'high').length
  const disruptions_active = (disruptions?.disruptions ?? []).filter((d: any) => d.is_active && d.severity !== 'low').length

  // Calculate totals for realized savings
  const totalSaved = useMemo(() => {
    return allCards
      .filter(card => card.is_resolved && card.resolved_at && card.estimated_impact_inr > 0)
      .reduce((sum, card) => sum + card.estimated_impact_inr, 0)
  }, [allCards])

  // Progress metrics for KPI cards
  const progressSuppliers = useMemo(() => {
    return riskList.length > 0 ? (activeRiskList.length / riskList.length) * 100 : 0
  }, [activeRiskList, riskList])

  const progressExposure = useMemo(() => {
    const totalRisk = activeExposure + totalSaved
    return totalRisk > 0 ? (totalSaved / totalRisk) * 100 : 0
  }, [activeExposure, totalSaved])

  const progressStockouts = useMemo(() => {
    const total = stockout?.total_skus ?? 100
    const crit = stockout?.critical_count ?? 0
    return total > 0 ? (crit / total) * 100 : 0
  }, [stockout])

  const progressDisruptions = useMemo(() => {
    const list = disruptions?.disruptions ?? []
    return list.length > 0 ? (disruptions_active / list.length) * 100 : 0
  }, [disruptions, disruptions_active])
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1600px', margin: '0 auto', width: '100%' }}>
      <style>{CSS}</style>

      <DashboardHeader exposure={activeExposure} riskCount={activeRiskList.length} totalSuppliers={riskList.length} loading={loadingRisks} />

      {!loadingD && <AlertBanner disruptions={disruptions?.disruptions ?? []} />}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px' }}>
        <KpiCard label="Suppliers at risk" value={loadingRisks ? '—' : activeRiskList.length}
          sub={criticalCount > 0 ? `${criticalCount} critical, ${highCount} high` : highCount > 0 ? `${highCount} high risk` : 'All stable'}
          progress={progressSuppliers} onClick={() => navigate('/risks')} loading={loadingRisks} delay={0} />
        <KpiCard label="Financial exposure" value={loadingRisks ? '—' : formatINR(activeExposure)}
          sub="Total at risk" progress={progressExposure} onClick={() => navigate('/risks')} loading={loadingRisks} delay={40} />
        <KpiCard label="Critical stockouts" value={(stockout?.critical_count ?? 0) > 0 ? stockout!.critical_count : '0'}
          sub="SKUs below safe stock" progress={progressStockouts} onClick={() => navigate('/risks')} delay={80} />
        <KpiCard label="Active disruptions" value={loadingD ? '—' : disruptions_active}
          sub="Medium+ severity" progress={progressDisruptions} onClick={() => navigate('/disruptions')} loading={loadingD} delay={120} />
      </div>

      <MitigationSavingsOverview actionCards={allCards} />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <SupplierRiskDistribution risks={riskList} loading={loadingRisks} />
        <ActivityTimeline />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <ExposureRanking risks={sortedActive} cardMap={cardMap} />
        <PendingActions risks={sortedActive} cardMap={cardMap} loading={loadingRisks} />
      </div>

      <AIInsights />
    </div>
  )
}
