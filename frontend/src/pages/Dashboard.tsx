import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import {
  useDisruptions, useStockoutForecast,
  useActionCards, useProcurementCards, useWeightedRiskAnalysis,
  useExecutiveBrief,
} from '../hooks/useQueries'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'
import {
  AlertTriangle, TrendingDown, Shield,
  Package, Activity, ChevronRight,
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
        background: '#FFFFFF',
        border: 'none',
        borderRadius: '16px',
        overflow: 'hidden',
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.04), 0 10px 20px rgba(0, 0, 0, 0.02)',
        transition: 'all 200ms cubic-bezier(0.16, 1, 0.3, 1)',
        ...style,
      }}
      onMouseEnter={e => {
        if (hover) {
          e.currentTarget.style.transform = 'translateY(-2px)'
          e.currentTarget.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.06)'
        }
      }}
      onMouseLeave={e => {
        if (hover) {
          e.currentTarget.style.transform = 'translateY(0)'
          e.currentTarget.style.boxShadow = '0 2px 8px rgba(0, 0, 0, 0.04), 0 10px 20px rgba(0, 0, 0, 0.02)'
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

/* ── Mitigation Graph ──────────────────────────────────────────────────── */
function MitigationGraph({ totalSaved, resolvedCards }: { totalSaved: number, resolvedCards: any[] }) {
  const [timeRange, setTimeRange] = useState<'1D' | '1W' | '1M' | '1Y'>('1M')

  // Generate Google Finance style stock data
  const chartData = useMemo(() => {
    const points = timeRange === '1D' ? 24 : timeRange === '1W' ? 7 : timeRange === '1M' ? 30 : 12
    const now = new Date()
    
    // Generate actual historical data from DB resolved cards
    const data = []
    
    for (let i = points - 1; i >= 0; i--) {
      let bucketEnd: number
      let label: string

      if (timeRange === '1D') {
        const d = new Date(now.getTime() - i * 3600000)
        label = `${d.getHours()}:00`
        bucketEnd = d.getTime()
      } else if (timeRange === '1W' || timeRange === '1M') {
        const d = new Date(now.getTime() - i * 86400000)
        label = d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
        bucketEnd = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59).getTime()
      } else {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
        label = d.toLocaleDateString('en-IN', { month: 'short' })
        bucketEnd = new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59).getTime()
      }

      // Calculate cumulative savings strictly up to bucketEnd
      const cumulativeSaved = resolvedCards
        .filter((card: any) => new Date(card.resolved_at!).getTime() <= bucketEnd)
        .reduce((sum, card: any) => sum + (card.estimated_impact_inr || 0), 0)

      data.push({ label, saved: cumulativeSaved })
    }
    
    return data
  }, [timeRange, resolvedCards])

  const formatValue = (v: number) => {
    if (v >= 10_000_000) return `₹${(v / 10_000_000).toFixed(2)}Cr`
    if (v >= 100_000) return `₹${(v / 100_000).toFixed(2)}L`
    if (v >= 1000) return `₹${(v / 1000).toFixed(0)}k`
    return `₹${v.toFixed(0)}`
  }

  return (
    <Card style={{ animation: 'dash-fade-in 0.3s ease-out', padding: '32px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '40px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '1.25rem', fontWeight: 600, color: '#334155', marginBottom: '8px' }}>Money Saved</div>
          <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#0F172A', display: 'flex', alignItems: 'center', gap: '8px' }}>
            {formatValue(totalSaved)}
          </div>
        </div>
        
        {/* View Selector */}
        <div style={{ display: 'flex', gap: '4px', border: '1px solid #E2E8F0', padding: '4px', borderRadius: '6px' }}>
          {(['1W', '1M', '1Y'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: '6px 16px',
                borderRadius: '4px',
                border: 'none',
                background: timeRange === range ? '#F1F5F9' : 'transparent',
                color: timeRange === range ? '#0F172A' : '#64748B',
                fontWeight: 600,
                fontSize: '0.8125rem',
                cursor: 'pointer',
                transition: 'all 0.2s ease'
              }}
            >
              {range === '1W' ? 'Weekly' : range === '1M' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
            <defs>
              <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="8 8" vertical={false} stroke="#E2E8F0" />
            <XAxis dataKey="label" axisLine={{ stroke: '#E2E8F0', strokeWidth: 1.5 }} tickLine={false} tick={{ fontSize: 12, fill: '#1E293B', fontWeight: 600 }} dy={15} 
                   minTickGap={20} />
            <YAxis domain={['auto', 'auto']} axisLine={{ stroke: '#E2E8F0', strokeWidth: 1.5 }} tickLine={false} tick={{ fontSize: 12, fill: '#1E293B', fontWeight: 600 }} 
                   tickFormatter={v => formatValue(v)} dx={-15} />
            <Tooltip 
               contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(15,23,42,0.1)' }} 
               itemStyle={{ color: '#0F172A', fontSize: '0.8125rem', fontWeight: 600 }}
               labelStyle={{ color: '#64748B', fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px' }}
               formatter={(value: number) => [formatValue(value), 'Saved']}
            />
            <Area type="monotone" dataKey="saved" stroke="#38BDF8" strokeWidth={2.5} fill="url(#colorSaved)" dot={false} activeDot={{ r: 6, fill: '#38BDF8', stroke: '#FFFFFF', strokeWidth: 2 }} />
          </AreaChart>
        </ResponsiveContainer>
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
function SupplierRiskDistribution({ risks, cardMap, activeExposure, loading }: { risks: SupplierRiskAnalysis[]; cardMap: Map<string, IntelligentActionCard>; activeExposure: number; loading: boolean }) {
  const distribution = useMemo(() => {
    const withExposure = risks.map(r => {
      const card = cardMap.get(r.supplier_id)
      return {
        supplier: r,
        exposure: card ? card.financial_exposure_inr : 0
      }
    }).filter(r => r.exposure > 0)
      .sort((a, b) => b.exposure - a.exposure)

    const SUPPLIER_PALETTE = ['#3B82F6', '#10B981', '#F59E0B', '#EF4444', '#8B5CF6']

    let items = withExposure.map((r, i) => ({
      name: r.supplier.supplier_name,
      value: r.exposure,
      color: SUPPLIER_PALETTE[i % SUPPLIER_PALETTE.length],
      supplier: r.supplier,
      isOthers: false
    }));

    if (items.length > 5) {
      const top4 = items.slice(0, 4)
      const others = items.slice(4)
      const othersValue = others.reduce((acc, curr) => acc + curr.value, 0)
      items = [...top4, {
        name: 'Others',
        value: othersValue,
        color: '#8B5CF6',
        supplier: null as any,
        isOthers: true
      }]
    }
    
    const totalExposure = items.reduce((acc, curr) => acc + curr.value, 0)
    return items.map(item => ({
      ...item,
      percentage: totalExposure > 0 ? (item.value / totalExposure) * 100 : 0
    }))
  }, [risks, cardMap])

  const topCategory = distribution.length > 0 && !distribution[0].isOthers ? (cardMap.get(distribution[0].supplier.supplier_id)?.category || 'FMCG') : 'None'
  const topCategoryValue = distribution.length > 0 ? distribution[0].value : 0

  return (
    <Card style={{ animation: 'dash-fade-in 0.35s ease-out', display: 'flex', flexDirection: 'column', height: '100%' }}>
      <CardHeader title="Suppliers Distribution" sub="Money at risk by supplier" />
      <div style={{ display: 'flex', flex: 1, padding: '32px 24px', gap: '40px', flexWrap: 'wrap', alignItems: 'center' }}>
        <div style={{ flex: 1, height: 200, position: 'relative', minWidth: 200, maxWidth: 240, margin: '0 auto' }}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', height: '100%', justifyContent: 'center' }}><Skeleton h={24} /><Skeleton h={24} /><Skeleton h={24} /></div>
          ) : (
            <>
              <div style={{ width: '100%', height: '100%', filter: 'drop-shadow(0px 8px 16px rgba(0,0,0,0.12))' }}>
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={distribution.filter(d => d.value > 0)}
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                    >
                      {distribution.filter(d => d.value > 0).map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }} 
                      formatter={(value: number) => [formatINR(value), 'Exposure']}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
                <div style={{ fontSize: '0.625rem', color: '#94A3B8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Total Risk</div>
                <Num size="1.75rem">{formatINR(activeExposure)}</Num>
              </div>
            </>
          )}
        </div>
        <div style={{ flex: 2, display: 'flex', flexDirection: 'column', overflowY: 'auto', minWidth: 250 }}>
          {distribution.length === 0 ? (
             <div style={{ fontSize: '0.8125rem', color: '#94A3B8' }}>No suppliers found.</div>
          ) : distribution.map((entry, index) => {
             return (
               <div key={entry.name} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: index < distribution.length - 1 ? '1px dashed #E2E8F0' : 'none' }}>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <div style={{ width: 16, height: 10, borderRadius: '4px', background: entry.color }} />
                   <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{entry.name}</div>
                 </div>
                 <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                   <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#64748B' }}>{formatINR(entry.value)}</div>
                   <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94A3B8', background: '#F8FAFC', padding: '2px 6px', borderRadius: '4px' }}>{entry.percentage.toFixed(0)}%</div>
                 </div>
               </div>
             )
          })}
        </div>
      </div>
      <div style={{ padding: '0 24px 24px' }}>
        <div style={{ background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', padding: '12px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.8125rem', color: '#64748B' }}>
            <AlertTriangle size={14} style={{ color: '#F59E0B' }} />
            <span>Highest exposure category: <strong style={{ color: '#0F172A' }}>{topCategory}</strong></span>
          </div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A' }}>{formatINR(topCategoryValue)}</div>
        </div>
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
        title="Pending Actions"
        right={
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            {risks.length > 0 && <span style={{ fontSize: '0.625rem', fontWeight: 600, color: '#64748B', background: '#F1F5F9', padding: '2px 6px', borderRadius: '3px' }}>{risks.length}</span>}
            <ViewAllBtn onClick={() => navigate('/actions')} />
          </div>
        }
      />
      <div style={{ padding: '8px 24px 24px', flex: 1, overflowX: 'auto' }}>
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', padding: '8px 0' }}><Skeleton h={40} /><Skeleton h={40} /><Skeleton h={40} /></div>
        ) : risks.length === 0 ? (
          <div style={{ padding: '28px 0', textAlign: 'center' }}>
            <Shield size={22} style={{ color: '#E2E8F0', marginBottom: '6px' }} />
            <div style={{ fontSize: '0.8125rem', color: '#0F172A', fontWeight: 600 }}>All clear</div>
            <div style={{ fontSize: '0.75rem', color: '#94A3B8', marginTop: '2px' }}>No pending actions</div>
          </div>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: '400px' }}>
            <thead>
              <tr>
                <th style={{ textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#94A3B8', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>Supplier</th>
                <th style={{ textAlign: 'left', fontSize: '0.75rem', fontWeight: 500, color: '#94A3B8', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>Action required</th>
                <th style={{ textAlign: 'right', fontSize: '0.75rem', fontWeight: 500, color: '#94A3B8', paddingBottom: '12px', borderBottom: '1px solid #F1F5F9' }}>Exposure</th>
              </tr>
            </thead>
            <tbody>
              {risks.slice(0, 5).map((r, i) => {
                const card = cardMap.get(r.supplier_id)
                if (!card) return null
                return (
                  <tr 
                    key={r.supplier_id} 
                    onClick={() => navigate(`/risks/${r.supplier_id}/mitigation`)}
                    style={{ cursor: 'pointer', borderBottom: i < 4 ? '1px solid #F8FAFC' : 'none' }}
                  >
                    <td style={{ padding: '12px 0', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>{r.supplier_name}</td>
                    <td style={{ padding: '12px 0', fontSize: '0.8125rem', color: '#64748B' }}>{getReason(r, card)}</td>
                    <td style={{ padding: '12px 0', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A', textAlign: 'right' }}>{formatINR(card.financial_exposure_inr)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
        <KpiCard label="Total Count" value={loadingRisks ? '—' : riskList.length}
          sub={criticalCount > 0 ? `${criticalCount} critical, ${highCount} high` : highCount > 0 ? `${highCount} high risk` : 'All stable'}
          progress={progressSuppliers} onClick={() => navigate('/risks')} loading={loadingRisks} delay={0} />
        <KpiCard label="Financial exposure" value={loadingRisks ? '—' : formatINR(activeExposure)}
          sub="Total at risk" progress={progressExposure} onClick={() => navigate('/risks')} loading={loadingRisks} delay={40} />
        <KpiCard label="Critical stockouts" value={(stockout?.critical_count ?? 0) > 0 ? stockout!.critical_count : '0'}
          sub="SKUs below safe stock" progress={progressStockouts} onClick={() => navigate('/risks')} delay={80} />
        <KpiCard label="Active disruptions" value={loadingD ? '—' : disruptions_active}
          sub="Medium+ severity" progress={progressDisruptions} onClick={() => navigate('/disruptions')} loading={loadingD} delay={120} />
      </div>

      <MitigationGraph 
        totalSaved={totalSaved} 
        resolvedCards={allCards.filter((c: any) => c.is_resolved && c.resolved_at && c.estimated_impact_inr > 0)} 
      />

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <SupplierRiskDistribution risks={riskList} cardMap={cardMap} activeExposure={activeExposure} loading={loadingRisks} />
        <PendingActions risks={sortedActive} cardMap={cardMap} loading={loadingRisks} />
      </div>

      <AIInsights />
    </div>
  )
}
