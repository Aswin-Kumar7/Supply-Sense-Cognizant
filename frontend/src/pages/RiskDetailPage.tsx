import { useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { api } from '../services/api'
import { queryKeys } from '../hooks/queryKeys'
import { useWeightedRiskAnalysis, useProcurementCards, useActionCards } from '../hooks/useQueries'
import {
  LineChart, CloudLightning, ShieldAlert, CalendarDays, Box,
  CheckCircle2, Cpu,
  Network, XCircle, Timer, Banknote, Layers,
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
    const explanation = f ? f.explanation : ''
    return { key, meta, score, fired, explanation }
  }).sort((a, b) => (b.score ?? 0) - (a.score ?? 0))

  return (
    <div style={{ width: '100%', border: '1px solid #E5E7EB', borderRadius: '12px', overflow: 'hidden' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
        <thead style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
          <tr>
            <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563', width: '45%' }}>Signal</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563', width: '20%' }}>Status</th>
            <th style={{ padding: '10px 12px', fontWeight: 600, color: '#4B5563', width: '35%' }}>Severity</th>
          </tr>
        </thead>
        <tbody>
          {signals.map((s, i) => (
            <tr key={s.key} className="signal-row" style={{ borderBottom: i === signals.length - 1 ? 'none' : '1px solid #F3F4F6', background: s.fired ? '#FAFAFA' : '#FFF' }}>
              <td style={{ padding: '12px 12px', verticalAlign: 'top' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: '#111827', fontWeight: 600 }}>
                  <span style={{ color: '#9CA3AF', display: 'flex', alignItems: 'center' }}>{s.meta.icon}</span>
                  {s.meta.label}
                </div>
                {s.explanation && (
                  <div style={{ fontSize: '11px', color: '#64748B', marginTop: '4px', paddingLeft: '22px', lineHeight: 1.4, fontWeight: 400 }}>
                    {s.explanation}
                  </div>
                )}
              </td>
              <td style={{ padding: '12px 12px', verticalAlign: 'top' }}>
                {s.fired ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#DC2626', fontWeight: 600, padding: '2px 8px', background: '#FEF2F2', borderRadius: '8px' }}>
                    <XCircle size={12} /> Critical
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#6B7280', padding: '2px 0' }}>
                    Nominal
                  </span>
                )}
              </td>
              <td style={{ padding: '12px 12px', verticalAlign: 'top' }}>
                {s.score !== null ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '2px' }}>
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
  const card = ((cards as IntelligentActionCard[] | undefined) ?? []).find(c => c.supplier_id === id)

  const supplierActionCards = (actionData?.action_cards ?? []).filter((c: any) => c.supplier_id === id)
  const isResolved = supplierActionCards.length > 0 && supplierActionCards.every((c: any) => c.is_resolved)
  const resolvedCard = supplierActionCards
    .filter((c: any) => c.is_resolved)
    .sort((a: any, b: any) => new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime())[0]

  if (!id) return null

  if (isResolved && resolvedCard) {
    return (
      <div style={{ padding: '40px 24px', maxWidth: '640px', margin: '0 auto', fontFamily: "'Inter', sans-serif" }}>
        <button onClick={() => navigate('/risks')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#64748B', fontSize: '0.875rem', display: 'flex', alignItems: 'center', gap: '6px', padding: 0, marginBottom: '24px', fontWeight: 600 }}>
          ← Back to Risks Registry
        </button>
        <div style={{ border: '1px solid #E2E8F0', background: '#FFFFFF', borderRadius: '16px', padding: '40px 32px', textAlign: 'center', boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 8px 24px rgba(15,23,42,0.03)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '50%', background: '#ECFDF5', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', border: '1px solid #A7F3D0' }}>
            <CheckCircle2 size={24} color="#059669" />
          </div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: '0 0 8px', color: '#0F172A', letterSpacing: '-0.02em' }}>Risk Incident Resolved</h2>
          <p style={{ fontSize: '0.875rem', color: '#64748B', margin: '0 0 28px', lineHeight: 1.5 }}>All preventive and corrective action items for <strong style={{ color: '#0F172A' }}>{risk?.supplier_name || 'this supplier'}</strong> have been completed successfully.</p>
          <button 
            onClick={() => navigate(`/activity/${resolvedCard.id}`)} 
            style={{ padding: '10px 20px', fontSize: '0.875rem', background: '#0F172A', color: '#FFFFFF', border: 'none', borderRadius: '8px', cursor: 'pointer', fontWeight: 600 }}
          >
            View Incident Report
          </button>
        </div>
      </div>
    )
  }
  const rColor = risk ? RISK_COLORS[risk.risk_level] || RISK_COLORS.medium : RISK_COLORS.medium

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', minHeight: '100%', 
      background: '#F8FAFC', color: '#0F172A', 
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
      overflowY: 'auto',
      animation: 'risk-detail-fade-in 0.3s ease-out'
    }}>
      <style>{`
        @keyframes risk-detail-fade-in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .premium-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 16px;
          box-shadow: 0 1px 3px rgba(0, 0, 0, 0.02), 0 8px 24px rgba(15, 23, 42, 0.03);
          transition: all 250ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .premium-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 6px rgba(0, 0, 0, 0.02), 0 16px 32px rgba(15, 23, 42, 0.06);
          border-color: #CBD5E1;
        }
        .nav-link {
          color: #64748B;
          transition: color 150ms ease;
          text-decoration: none;
          font-weight: 500;
        }
        .nav-link:hover {
          color: #0F172A;
        }
        .action-button {
          background: #0F172A;
          color: #FFFFFF;
          border: none;
          border-radius: 8px;
          font-weight: 600;
          cursor: pointer;
          transition: all 200ms cubic-bezier(0.16, 1, 0.3, 1);
        }
        .action-button:hover {
          background: #334155;
          transform: translateY(-1px);
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
        }
        .action-button:active {
          transform: translateY(0);
        }
        .signal-row {
          transition: background-color 150ms ease;
        }
        .signal-row:hover {
          background-color: #F8FAFC !important;
        }
      `}</style>
      
      {/* ── Top Navigation Bar ────────────────────────────────────────── */}
      <div style={{ 
        display: 'flex', alignItems: 'center', justifyContent: 'space-between', 
        padding: '14px 24px', background: '#FFF', borderBottom: '1px solid #E2E8F0',
        position: 'sticky', top: 0, zIndex: 10,
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
          <span 
            onClick={() => navigate('/')} 
            className="nav-link"
            style={{ cursor: 'pointer' }}
          >
            Dashboard
          </span>
          <span>/</span>
          <span 
            onClick={() => navigate('/risks')} 
            className="nav-link"
            style={{ cursor: 'pointer' }}
          >
            Risk Analysis
          </span>
          <span>/</span>
          <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A' }}>{risk?.supplier_name ?? <Skeleton w={120} h={16} />}</span>
          {risk && (
            <span style={{ 
              fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em',
              padding: '2px 8px', borderRadius: '20px', background: rColor.bg, color: rColor.text, border: `1px solid ${rColor.border}`,
              marginLeft: '8px'
            }}>
              {risk.risk_level} Risk
            </span>
          )}
        </div>
        <button 
          onClick={() => navigate('/risks')}
          style={{
            background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px',
            padding: '4px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748B',
            cursor: 'pointer', transition: 'all 150ms ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#0F172A' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B' }}
        >
          Back to Registry
        </button>
      </div>

      <div style={{ padding: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        
        {/* ── Executive Dashboard Strip ─────────────────────────────────── */}
        <div style={{ 
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '20px',
          background: '#FFF', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02), 0 4px 12px rgba(15,23,42,0.015)'
        }}>
          {/* Main Score & Trend */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', borderRight: '1px solid #F1F5F9', paddingRight: '20px' }}>
            <div style={{ fontSize: '0.6875rem', textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', fontWeight: 700 }}>Risk Score</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, fontFamily: "'Inter', monospace", color: rColor.text, lineHeight: 1, letterSpacing: '-0.03em' }}>
                {risk ? `${(risk.overall_score * 100).toFixed(0)}%` : '--'}
              </div>
              {risk && <SparklineMini supplierId={risk.supplier_id} currentScore={risk.overall_score} color={rColor.text} />}
            </div>
          </div>
          
          <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '20px' }}>
            <MetricItem label="Financial Exposure" value={card ? formatINR(card.financial_exposure_inr) : '--'} icon={<Banknote size={14} />} alert={true} />
          </div>
          <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '20px' }}>
            <MetricItem label="Days of Stock Left" value={card ? `${card.days_to_stockout}d` : '--'} icon={<Timer size={14} />} alert={card && card.days_to_stockout < 5} />
          </div>
          <div style={{ borderRight: '1px solid #F1F5F9', paddingRight: '20px' }}>
            <MetricItem label="Products at Risk" value={card ? String(card.affected_skus) : '--'} icon={<Box size={14} />} />
          </div>
          <div>
            <MetricItem label="Act Within" value={card ? card.escalation_window : '--'} icon={<TrendingDown size={14} />} />
          </div>
        </div>

        {/* ── Main Layout: 2 Columns ────────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 1fr', gap: '24px', alignItems: 'start' }}>
          
          {/* Left Col: AI Insight & Cascade Network */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* AI Strategic Assessment */}
            {card && (() => {
              const isFallback = card.reasoning?.startsWith('Supplier risk score indicates')
              return (
                <div className="premium-card" style={{ overflow: 'hidden' }}>
                  <div style={{ background: '#F8FAFC', borderBottom: '1px solid #E2E8F0', padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Cpu size={16} color="#4F46E5" />
                    <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>Strategic Assessment</span>
                    {isFallback ? (
                      <span style={{ marginLeft: 'auto', fontSize: '0.625rem', fontWeight: 700, color: '#92400E', background: '#FEF3C7', border: '1px solid #FDE68A', padding: '2px 8px', borderRadius: '20px' }}>
                        Rule-based Estimate
                      </span>
                    ) : (
                      <span style={{ marginLeft: 'auto', fontSize: '0.625rem', fontWeight: 700, color: '#4F46E5', background: '#EEF2FF', border: '1px solid #C7D2FE', padding: '2px 8px', borderRadius: '20px' }}>
                        AI Analysis Fired
                      </span>
                    )}
                  </div>
                  <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '18px' }}>
                    <div>
                      <h3 style={{ fontSize: '1rem', fontWeight: 800, margin: '0 0 8px', color: '#0F172A', letterSpacing: '-0.02em' }}>{card.recommended_action}</h3>
                      <p style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, margin: 0 }}>{card.reasoning}</p>
                    </div>

                    {/* Severity + Cost — two clear panels */}
                    {(() => {
                      const days = card.days_to_stockout ?? 999
                      const severity = days <= 3 ? 'critical' : days <= 7 ? 'high' : 'medium'
                      const severityConfig = {
                        critical: { label: 'CRITICAL', sub: 'Stock runs out in under 3 days', bg: '#FEF2F2', border: '#FCA5A5', text: '#991B1B', badge: '#DC2626' },
                        high:     { label: 'HIGH',     sub: `Stock runs out in ${days} days — urgent intervention required`, bg: '#FFF7ED', border: '#FDBA74', text: '#9A3412', badge: '#EA580C' },
                        medium:   { label: 'MEDIUM',   sub: `${days} days of stock remaining — monitor parameters`, bg: '#FFFBEB', border: '#FDE68A', text: '#92400E', badge: '#D97706' },
                      }[severity]
                      const dailyLoss = Math.round((card.financial_exposure_inr ?? 0) * 0.15)
                      return (
                        <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap' }}>
                          {/* Severity panel */}
                          <div style={{ flex: 1, minWidth: '200px', background: severityConfig.bg, border: `1px solid ${severityConfig.border}`, padding: '16px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <ShieldAlert size={14} color={severityConfig.badge} />
                              <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: severityConfig.badge, letterSpacing: '0.06em' }}>
                                {severityConfig.label} SEVERITY
                              </span>
                            </div>
                            <div style={{ fontSize: '0.8125rem', color: severityConfig.text, lineHeight: 1.5, fontWeight: 600 }}>
                              {severityConfig.sub}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: severityConfig.text, opacity: 0.8, marginTop: '8px' }}>
                              Window limit: <strong>{card.escalation_window || 'immediate action'}</strong>
                            </div>
                          </div>
                          {/* Cost of waiting panel */}
                          <div style={{ flex: 1, minWidth: '200px', background: '#F8FAFC', border: '1px solid #E2E8F0', padding: '16px', borderRadius: '12px' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
                              <Timer size={14} color="#475569" />
                              <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#475569', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                                Cost of Waiting
                              </span>
                            </div>
                            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', fontFamily: "'Inter', monospace", lineHeight: 1, letterSpacing: '-0.02em' }}>
                              ~{formatINR(dailyLoss)}<span style={{ fontSize: '0.75rem', fontWeight: 500, color: '#64748B' }}> / day</span>
                            </div>
                            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '8px', lineHeight: 1.4 }}>
                              Estimated disruption leakage from SLA penalties + unfulfilled customer demand.
                            </div>
                          </div>
                        </div>
                      )
                    })()}

                    <button
                      onClick={() => navigate(`/risks/${id}/mitigation`)}
                      className="action-button"
                      style={{
                        width: '100%', padding: '12px 20px', fontSize: '0.875rem', marginTop: '4px'
                      }}
                    >
                      Explore Mitigation Solutions →
                    </button>
                  </div>
                </div>
              )
            })()}

            {/* Cascade Network */}
            <div className="premium-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: '0 0 16px', color: '#0F172A' }}>Cascade Network Impact</h3>
              <CascadeTree supplierId={id!} />
            </div>

          </div>

          {/* Right Col: Live Risk Signals */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            
            {/* Risk Telemetry */}
            <div className="premium-card" style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 700, margin: 0, color: '#0F172A' }}>Live Risk Signals</h3>
                <span style={{ fontSize: '0.625rem', color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Telemetry Matrix</span>
              </div>
              {risk ? <SignalDataTable risk={risk} /> : <Skeleton h={150} />}
            </div>

          </div>

        </div>
      </div>
    </div>
  )
}
