import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell
} from 'recharts'
import {
  useDisruptions, useStockoutForecast,
  useActionCards, useProcurementCards, useWeightedRiskAnalysis,
} from '../hooks/useQueries'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'
import {
  AlertTriangle, TrendingDown, Shield,
  Package, Activity, ChevronRight,
} from 'lucide-react'
import { AiBadge } from '../components/ui/AiBadge'

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function getTopFactor(factors: SupplierRiskAnalysis['factors']): string {
  if (!factors) return ''
  return Object.entries(factors).sort(([, a], [, b]) => b.weighted - a.weighted)[0]?.[0] ?? ''
}

const FACTOR_LABEL: Record<string, string> = {
  disruption_severity: 'Active disruption affecting supply',
  inventory_pressure: 'Stock levels critically low',
  delivery_reliability: 'Delivery delays reported',
  logistics_vulnerability: 'Logistics risk elevated',
  dependency_exposure: 'Heavy dependency on this supplier',
  festival_proximity: 'Demand spike — festival season',
}

function getReason(risk: SupplierRiskAnalysis, card: IntelligentActionCard): string {
  if (card.days_to_stockout <= 3) return `Stock runs out in ${card.days_to_stockout} days`
  if (card.days_to_stockout <= 7) return `Only ${card.days_to_stockout} days of stock left`
  return FACTOR_LABEL[getTopFactor(risk.factors)] ?? card.title ?? 'Elevated supply risk'
}


const CSS = `
  @keyframes dash-fade-in { from { opacity: 0; transform: translateY(6px) } to { opacity: 1; transform: translateY(0) } }
  @keyframes dash-pulse { 0%,100% { opacity: 1 } 50% { opacity: 0.3 } }
  @keyframes dash-shimmer { from { background-position: 200% 0 } to { background-position: -200% 0 } }
  @keyframes beacon-glow {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0.75); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(239, 68, 68, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(239, 68, 68, 0); }
  }
  .alert-beacon {
    display: inline-block;
    border-radius: 50%;
    animation: beacon-glow 2s cubic-bezier(0.16, 1, 0.3, 1) infinite;
  }
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
    animation: ticker-slide 54s linear infinite;
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
function DashboardHeader({
  exposure,
  riskCount,
  totalSuppliers,
  loading,
  criticalSuppliers,
  highSuppliers
}: {
  exposure: number;
  riskCount: number;
  totalSuppliers: number;
  loading: boolean;
  criticalSuppliers: number;
  highSuppliers: number;
}) {
  const navigate = useNavigate()
  const date = new Date().toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })

  const totalCritical = criticalSuppliers + highSuppliers

  let titleText = ""

  if (criticalSuppliers > 0 && highSuppliers > 0) {
    titleText = `${criticalSuppliers} critical · ${highSuppliers} high risk suppliers`
  } else if (criticalSuppliers > 0) {
    titleText = `${criticalSuppliers} critical supplier${criticalSuppliers > 1 ? 's' : ''} at risk`
  } else if (highSuppliers > 0) {
    titleText = `${highSuppliers} high risk supplier${highSuppliers > 1 ? 's' : ''} detected`
  }

  return (
    <div style={{
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderBottom: '1px solid #F1F5F9',
      paddingBottom: '24px',
      marginBottom: '12px',
      animation: 'dash-fade-in 0.25s ease-out',
      flexWrap: 'wrap',
      gap: '16px'
    }}>
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
          <span style={{
            fontSize: '0.625rem',
            fontWeight: 700,
            color: '#4F46E5',
            background: '#EEF2FF',
            padding: '4px 10px',
            borderRadius: '20px',
            textTransform: 'uppercase',
            letterSpacing: '0.08em'
          }}>
            Supply Chain Command
          </span>
          <span style={{ fontSize: '0.75rem', color: '#E2E8F0' }}>•</span>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>{date}</span>
        </div>
        <h1 style={{
          fontSize: '2rem',
          fontWeight: 800,
          color: '#0F172A',
          letterSpacing: '-0.04em',
          margin: 0,
          lineHeight: 1.15
        }}>
          Operational Overview
        </h1>
        <p style={{
          fontSize: '0.875rem',
          color: '#64748B',
          fontWeight: 400,
          marginTop: '8px',
          marginBottom: 0,
          lineHeight: 1.6
        }}>
          {loading ? 'Analyzing supply network pathways...' :
            riskCount === 0 ? `Monitoring ${totalSuppliers} active supply paths. All nodes stable.` :
              <span>Monitoring <strong style={{ color: '#0F172A', fontWeight: 600 }}>{totalSuppliers}</strong> active paths. <strong style={{ color: '#EF4444', fontWeight: 600 }}>{riskCount}</strong> supplier{riskCount > 1 ? 's require' : ' requires'} attention — <strong style={{ color: '#0F172A', fontWeight: 600 }}>{formatINR(exposure)}</strong> at risk.</span>
          }
        </p>
      </div>

      <div style={{ display: 'flex', gap: '16px', flexShrink: 0 }}>
        {(!loading && totalCritical > 0) ? (
          <div
            onClick={() => navigate('/risks')}
            style={{
              background: '#FFF5F5',
              border: '1px solid #FEE2E2',
              borderRadius: '10px',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              gap: '12px',
              cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.03)',
              transition: 'all 150ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.borderColor = '#FCA5A5'
              e.currentTarget.style.background = '#FFEAEA'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.borderColor = '#FEE2E2'
              e.currentTarget.style.background = '#FFF5F5'
            }}
          >
            {/* Pulsing indicator & label */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
              <span
                className="alert-beacon"
                style={{
                  width: 6,
                  height: 6,
                  background: '#EF4444',
                }}
              />
              <span style={{ fontSize: '0.7rem', fontWeight: 800, color: '#991B1B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
                Risk Alert
              </span>
            </div>

            <div style={{ width: '1px', height: '16px', background: '#FCA5A5', flexShrink: 0 }} />

            {/* Single line description */}
            <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#7F1D1D', lineHeight: 1.2, whiteSpace: 'nowrap' }}>
              {titleText}
            </div>
          </div>
        ) : null}
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
    <div style={{
      padding: '10px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      background: '#F8FAFC',
      border: '1px solid #E2E8F0',
      borderRadius: '12px',
      overflow: 'hidden'
    }}>
      {/* Pinned left title label */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        flexShrink: 0,
        paddingRight: '16px',
        borderRight: '1px solid #E2E8F0',
        zIndex: 5
      }}>
        <span style={{
          width: 6,
          height: 6,
          borderRadius: '50%',
          background: '#EF4444',
          animation: 'dash-pulse 2.5s ease-in-out infinite',
          boxShadow: '0 0 8px rgba(239, 68, 68, 0.6)'
        }} />
        <span style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          color: '#EF4444',
          textTransform: 'uppercase',
          letterSpacing: '0.1em'
        }}>
          Live Alerts
        </span>
      </div>

      {/* Scrolling ticker track */}
      <div className="ticker-container">
        <div className="ticker-track">
          {/* We repeat active items list 3 times for a perfect seamless CSS infinite loop */}
          {[...active, ...active, ...active].map((item, i) => {
            return (
              <span
                key={i}
                onClick={() => navigate('/disruptions')}
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '8px',
                  cursor: 'pointer',
                  flexShrink: 0,
                  transition: 'opacity 150ms ease',
                }}
                onMouseEnter={e => {
                  e.currentTarget.style.opacity = '0.7'
                }}
                onMouseLeave={e => {
                  e.currentTarget.style.opacity = '1'
                }}
              >
                <span style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#1E293B' }}>{item.title}</span>
                {item.region && (
                  <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 400 }}>
                    ({item.region})
                  </span>
                )}
                {/* Dot divider after each item */}
                <span style={{ margin: '0 20px', color: '#FCA5A5', fontWeight: 700 }}>•</span>
              </span>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Mitigation Graph ──────────────────────────────────────────────────── */
function MitigationGraph({ totalSaved, resolvedCards }: { totalSaved: number, resolvedCards: any[] }) {
  const [timeRange, setTimeRange] = useState<'1D' | '1W' | '1M' | '1Y'>('1M')

  const xAxisInterval = useMemo(() => {
    if (timeRange === '1W') return 0
    if (timeRange === '1D') return 3 // Show every 4th hour
    if (timeRange === '1M') return 5 // Show every 6th day
    return 1 // For 1Y, show every 2nd month
  }, [timeRange])

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
    <Card style={{ animation: 'dash-fade-in 0.3s ease-out', padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#0F172A', marginBottom: '4px' }}>Money Saved</div>
          <div style={{ fontSize: '1.625rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.02em', lineHeight: 1 }}>
            {formatValue(totalSaved)}
          </div>
        </div>

        {/* View Selector */}
        <div style={{ display: 'flex', gap: '2px', background: '#F1F5F9', padding: '2px', borderRadius: '6px' }}>
          {(['1W', '1M', '1Y'] as const).map(range => (
            <button
              key={range}
              onClick={() => setTimeRange(range)}
              style={{
                padding: '4px 10px',
                borderRadius: '5px',
                border: 'none',
                background: timeRange === range ? '#FFFFFF' : 'transparent',
                color: timeRange === range ? '#0F172A' : '#64748B',
                fontWeight: 500,
                fontSize: '0.75rem',
                cursor: 'pointer',
                boxShadow: timeRange === range ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                transition: 'all 150ms ease'
              }}
            >
              {range === '1W' ? 'Weekly' : range === '1M' ? 'Monthly' : 'Yearly'}
            </button>
          ))}
        </div>
      </div>
      <div style={{ height: 300 }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="colorSaved" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#38BDF8" stopOpacity={0.15} />
                <stop offset="95%" stopColor="#38BDF8" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
            <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }} dy={6}
              interval={xAxisInterval} />
            <YAxis domain={['auto', 'auto']} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: '#64748B', fontWeight: 500 }}
              tickFormatter={v => formatValue(v)} dx={-4} width={45} />
            <Tooltip
              contentStyle={{ backgroundColor: '#FFFFFF', borderRadius: '8px', border: '1px solid #E2E8F0', boxShadow: '0 4px 16px rgba(15,23,42,0.08)' }}
              itemStyle={{ color: '#0F172A', fontSize: '0.75rem', fontWeight: 600 }}
              labelStyle={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 600, marginBottom: '4px' }}
              formatter={(value: number) => [formatValue(value), 'Saved']}
            />
            <Area type="monotone" dataKey="saved" stroke="#38BDF8" strokeWidth={2.2} fill="url(#colorSaved)" dot={false} activeDot={{ r: 5, fill: '#38BDF8', stroke: '#FFFFFF', strokeWidth: 2 }} />
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
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

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

  const filteredData = useMemo(() => distribution.filter(d => d.value > 0), [distribution])
  const activeItem = activeIndex !== null ? filteredData[activeIndex] : null

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
                      data={filteredData}
                      innerRadius={65}
                      outerRadius={95}
                      paddingAngle={0}
                      dataKey="value"
                      stroke="none"
                      activeIndex={activeIndex !== null ? activeIndex : undefined}
                      activeShape={{ outerRadius: 99 } as any}
                      onMouseEnter={(_, index) => setActiveIndex(index)}
                      onMouseLeave={() => setActiveIndex(null)}
                    >
                      {filteredData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div style={{
                position: 'absolute',
                top: 0, left: 0, right: 0, bottom: 0,
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                pointerEvents: 'none',
                padding: '0 24px',
                textAlign: 'center'
              }}>
                <div style={{
                  fontSize: '0.625rem',
                  color: '#94A3B8',
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                  maxWidth: '120px'
                }}>
                  {activeItem ? activeItem.name : 'Total Risk'}
                </div>
                <Num size={activeItem ? "1.375rem" : "1.75rem"}>
                  {activeItem ? formatINR(activeItem.value) : formatINR(activeExposure)}
                </Num>
                {activeItem && (
                  <div style={{ fontSize: '0.625rem', color: activeItem.color, fontWeight: 700, marginTop: '2px' }}>
                    {activeItem.percentage.toFixed(0)}% share
                  </div>
                )}
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
                const actionText = card.ai_error
                  ? null
                  : getReason(r, card)
                return (
                  <tr
                    key={r.supplier_id}
                    onClick={() => navigate(`/risks/${r.supplier_id}/mitigation`)}
                    style={{ cursor: 'pointer', borderBottom: i < 4 ? '1px solid #F8FAFC' : 'none' }}
                  >
                    <td style={{ padding: '12px 0', fontSize: '0.8125rem', fontWeight: 600, color: '#0F172A' }}>{r.supplier_name}</td>
                    <td style={{ padding: '12px 0', fontSize: '0.8125rem', color: '#64748B' }}>
                      <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        {actionText ?? (
                          <span style={{ color: '#94A3B8', fontStyle: 'italic' }}>AI unavailable</span>
                        )}
                        <AiBadge mode={card.generation_mode} />
                      </span>
                    </td>
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

  // Primary: AI-enriched procurement cards with financial_exposure_inr + narratives.
  // Fallback: DB action cards (estimated_impact_inr) — always available after sync-risks,
  // even before procurement cards have been generated or while AI cache is warming up.
  const cardMap = useMemo(() => {
    const map = new Map<string, IntelligentActionCard>()
    // Seed fallback entries from DB action cards (DB rows only — no AI narratives yet)
    for (const c of allCards) {
      if (!c.supplier_id) continue
      map.set(c.supplier_id, {
        supplier_id: c.supplier_id,
        supplier_name: '',
        city: '', region: '', category: '',
        risk_score: 0, risk_level: c.priority as any,
        confidence: 0,
        financial_exposure_inr: c.estimated_impact_inr,
        days_to_stockout: 30,
        affected_skus: 0,
        action_type: c.action_type,
        priority: c.priority as any,
        title: c.title,
        // No AI narrative fields — will be overlaid by procCards once generated
        generation_mode: undefined,
        ai_generated: false,
        ai_error: false,
      })
    }
    // Overlay with richer procurement cards when available
    for (const c of ((procCards as IntelligentActionCard[] | undefined) ?? [])) {
      if (c.supplier_id) map.set(c.supplier_id, c)
    }
    return map
  }, [allCards, procCards])

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
    // Show supplier if it has any financial exposure — from proc card OR DB card fallback
    const card = cardMap.get(r.supplier_id)
    return card ? card.financial_exposure_inr > 0 : true
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

      <DashboardHeader
        exposure={activeExposure}
        riskCount={activeRiskList.length}
        totalSuppliers={riskList.length}
        loading={loadingRisks}
        criticalSuppliers={criticalCount}
        highSuppliers={highCount}
      />

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

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
        <SupplierRiskDistribution risks={riskList} cardMap={cardMap} activeExposure={activeExposure} loading={loadingRisks} />
        <PendingActions risks={sortedActive} cardMap={cardMap} loading={loadingRisks} />
      </div>

      <MitigationGraph
        totalSaved={totalSaved}
        resolvedCards={allCards.filter((c: any) => c.is_resolved && c.resolved_at && c.estimated_impact_inr > 0)}
      />
    </div>
  )
}
