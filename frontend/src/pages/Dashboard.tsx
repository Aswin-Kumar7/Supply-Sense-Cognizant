import { useMemo, useState, useCallback, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  useDashboardSummary,
  useSuppliers,
  useDisruptions,
  useFinancialSummary,
  useStockoutForecast,
  useActionCards,
  useProcurementCards,
  useWeightedRiskAnalysis,
} from '../hooks/useQueries'
import { IndiaMap } from '../components/ui/IndiaMap'
import { Badge } from '../components/ui/Badge'
import { ProvenanceTag } from '../components/ui/ProvenanceTag'
import { api } from '../services/api'
import type { SupplierRiskAnalysis, Disruption, ActionCard, IntelligentActionCard, ExecutiveBrief } from '../types'
import { AlertTriangle, AlertCircle, DollarSign, Package, Users, Activity, Wind, Truck, Search, ClipboardList, Link as LinkIcon, Calendar, ChevronRight } from 'lucide-react'

/* ── Helpers ─────────────────────────────────────────────────────────── */
function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000) return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function Skeleton({ w = '100%', h = 20 }: { w?: string | number; h?: number }) {
  return <div className="skeleton" style={{ width: w, height: h, borderRadius: 6 }} />
}

/* ── Critical Alert Banner ───────────────────────────────────────────── */
function CriticalAlertBanner({ count, topRisk, onView }: {
  count: number
  topRisk: SupplierRiskAnalysis | null
  onView: () => void
}) {
  const [dismissed, setDismissed] = useState(false)
  if (count === 0 || dismissed) return null

  return (
    <div style={{
      background: '#FFFFFF',
      border: '1px solid var(--border)',
      borderRadius: '1rem',
      padding: '1rem 1.5rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      boxShadow: 'var(--shadow-sm)',
      animation: 'slideDown 300ms cubic-bezier(0.16,1,0.3,1)',
    }}>
      {/* Pulse dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#c55b55' }} />
        <div style={{
          position: 'absolute', inset: '-4px',
          borderRadius: '50%', border: '2px solid #c55b55',
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 0.4,
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 500, color: '#c55b55', display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
          <AlertTriangle size={16} />
          {count} Critical Supply Chain Issue{count !== 1 ? 's' : ''} Require Immediate Attention
        </div>
        {topRisk && (
          <div style={{ fontSize: '0.75rem', color: '#c55b55', marginTop: '2px' }}>
            Highest risk: <strong style={{ color: '#c55b55' }}>{topRisk.supplier_name}</strong> —{' '}
            {(topRisk.overall_score * 100).toFixed(0)}% risk score
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', flexShrink: 0 }}>
        <button
          onClick={onView}
          style={{
            padding: '0.5rem 1rem',
            background: '#FFFFFF',
            color: '#c55b55',
            borderRadius: '0.5rem',
            border: '1px solid #c55b55',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 500,
            fontFamily: 'inherit',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-card)'}
          onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
        >
          View Critical Issues
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: '0.5rem',
            background: 'transparent',
            color: '#c55b55',
            borderRadius: '0.5rem',
            border: '1px solid var(--border)',
            cursor: 'pointer',
            fontSize: '1rem',
            fontFamily: 'inherit',
            lineHeight: 1,
            transition: 'color 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#c55b55'}
          onMouseLeave={e => e.currentTarget.style.color = '#c55b55'}
          title="Dismiss"
        >
          ×
        </button>
      </div>
    </div>
  )
}

/* ── Board Brief Modal ───────────────────────────────────────────────── */
function BoardBriefModal({ onClose }: { onClose: () => void }) {
  const [brief, setBrief] = useState<ExecutiveBrief | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchBrief = useCallback(async () => {
    try {
      setLoading(true)
      setError(null)
      const result = await api.getExecutiveBrief()
      setBrief(result)
    } catch {
      setError('Unable to generate board brief. Please check backend connectivity.')
    } finally {
      setLoading(false)
    }
  }, [])

  // Fetch on mount
  useEffect(() => { fetchBrief() }, [])

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.5)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '1.5rem',
    }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{
        background: 'var(--bg-card)',
        borderRadius: '1.5rem',
        width: '100%',
        maxWidth: '680px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: 'var(--shadow-modal)',
        border: '1px solid var(--border)',
      }}>
        {/* Header - Fixed */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1rem 1.5rem',
          borderBottom: '1px solid var(--border)',
          background: '#fff',
          zIndex: 10,
          flexShrink: 0,
        }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 600, color: '#000000', letterSpacing: '-0.02em' }}>Board Brief</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '2px' }}>
              Strategic Analysis · <span style={{ color: '#000', fontWeight: 600 }}>Supply Engine v2.4</span>
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
            <button
              onClick={() => window.print()}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.4rem 0.875rem', background: 'var(--bg-hover)', border: '1px solid var(--border)',
                borderRadius: '0.5rem', color: 'var(--ink-2)', fontSize: '0.75rem', fontWeight: 600, cursor: 'pointer',
              }}
            >
              <ClipboardList size={14} /> Print
            </button>
            <button
              onClick={onClose}
              style={{
                width: '32px', height: '32px', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: 'none', border: 'none', borderRadius: '50%', color: 'var(--ink-4)',
                cursor: 'pointer',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--bg-hover)'}
              onMouseLeave={e => e.currentTarget.style.background = 'none'}
            >
              <Activity size={18} />
            </button>
          </div>
        </div>

        {/* Body - Scrollable */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', overflowY: 'auto' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
              <Skeleton h={80} />
              <Skeleton h={100} />
              <Skeleton h={60} />
            </div>
          )}
          {error && (
            <div style={{
              padding: '1.25rem', background: '#fef2f2', border: '1px solid #fecaca',
              borderRadius: '0.75rem', fontSize: '0.875rem', color: '#c55b55',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between'
            }}>
              <span>{error}</span>
              <button onClick={fetchBrief} style={{ fontSize: '0.75rem', color: '#c55b55', fontWeight: 600, background: '#fff', border: '1px solid #fecaca', borderRadius: '4px', padding: '4px 8px', cursor: 'pointer' }}>
                Retry
              </button>
            </div>
          )}
          {brief && (
            <>
              {/* KPI overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '1rem' }}>
                <KPICard 
                  label="Risks" 
                  value={brief.at_risk_suppliers} 
                  accent="#c55b55" 
                  icon={<Users size={18} />} 
                />
                <KPICard 
                  label="Exposure" 
                  value={formatINR(brief.total_exposure_inr)} 
                  accent="#D29729" 
                  icon={<DollarSign size={18} />} 
                />
                <KPICard 
                  label="Stockouts" 
                  value={brief.critical_stockouts} 
                  accent="#000" 
                  icon={<Package size={18} />} 
                />
              </div>

              {/* Summary */}
              <div>
                <SectionHeader title="Strategic Overview" />
                <div style={{ 
                  fontSize: '0.9375rem', color: 'var(--ink-2)', lineHeight: 1.6, 
                  background: 'var(--bg-hover)', padding: '1.25rem', 
                  borderRadius: '1rem', border: '1px solid var(--border)' 
                }}>
                  {brief.summary}
                </div>
              </div>

              {/* Risk factors */}
              {brief.top_risks.length > 0 && (
                <div>
                  <SectionHeader title="Key Risk Factors" />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '0.75rem' }}>
                    {brief.top_risks.map((r, i) => (
                      <div key={i} style={{ 
                        fontSize: '0.8125rem', color: 'var(--ink-2)', padding: '0.75rem 1rem', 
                        background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '0.75rem',
                        display: 'flex', alignItems: 'center', gap: '0.625rem', boxShadow: 'var(--shadow-card)'
                      }}>
                        <AlertCircle size={14} style={{ color: '#c55b55' }} />
                        {r}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Action items */}
              {brief.immediate_actions.length > 0 && (
                <div>
                  <SectionHeader title="Critical Action Protocol" />
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {brief.immediate_actions.map((action, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: '1rem', alignItems: 'center',
                        padding: '1rem 1.25rem',
                        background: 'var(--bg-card)', border: '1px solid var(--border)',
                        borderRadius: '1rem', boxShadow: 'var(--shadow-card)'
                      }}>
                        <span style={{ 
                          width: '24px', height: '24px', borderRadius: '0.5rem', background: 'var(--bg-hover)', color: 'var(--ink-1)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.75rem', fontWeight: 700, flexShrink: 0 
                        }}>
                          {i + 1}
                        </span>
                        <span style={{ fontSize: '0.875rem', fontWeight: 500, color: '#000000', lineHeight: 1.4 }}>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', textAlign: 'right', marginTop: '0.5rem' }}>
                Generated: {new Date(brief.generated_at).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })} IST
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ── Top Risk Spotlight ──────────────────────────────────────────────── */
function TopRiskSpotlight({ risk, card }: {
  risk: SupplierRiskAnalysis
  card: IntelligentActionCard | undefined
}) {
  const navigate = useNavigate()



  return (
    <div
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.5rem 1.75rem',
        cursor: 'pointer',
        boxShadow: 'var(--shadow-card)',
        transition: 'all 200ms ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-hover)'
        e.currentTarget.style.borderColor = 'var(--brand-200)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.boxShadow = 'var(--shadow-card)'
        e.currentTarget.style.borderColor = 'var(--border)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '32px', height: '32px', borderRadius: '0.5rem', background: 'var(--bg-hover)', color: 'var(--ink-3)' }}>
              <AlertCircle size={18} />
            </div>
            <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>
              Top Risk Spotlight
            </span>
          </div>

          {/* Body */}
          <div style={{ fontSize: '1.5rem', fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.02em', marginBottom: '0.375rem' }}>
            {risk.supplier_name}
          </div>
          
          {card && (
            <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: '1.25rem', maxWidth: '600px' }}>
              {card.recommended_action}
            </p>
          )}

          {/* Footer Metadata */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem', flexWrap: 'wrap' }}>
            <Badge level={risk.risk_level} />
            
            {card && (
              <div style={{ display: 'flex', alignItems: 'center', gap: '1.25rem' }}>
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '2px' }}>Exposure</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>{formatINR(card.financial_exposure_inr)}</span>
                </div>
                
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <span style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600, marginBottom: '2px' }}>Stockout</span>
                  <span style={{ fontSize: '0.875rem', fontWeight: 600, color: card.days_to_stockout <= 7 ? '#c55b55' : 'var(--ink-1)' }}>{card.days_to_stockout} days</span>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Score Ring / Pill */}
        <div style={{ textAlign: 'center', flexShrink: 0, padding: '0.5rem' }}>
          <div style={{ 
            width: '92px', height: '92px', borderRadius: '50%', 
            background: 'var(--bg-hover)', border: '1px solid var(--border)',
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            position: 'relative',
            boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.02)'
          }}>
            <div style={{ 
              fontSize: '1.75rem', fontWeight: 600, color: '#000', lineHeight: 1, 
              fontFamily: 'JetBrains Mono, monospace', letterSpacing: '-0.05em' 
            }}>
              {(risk.overall_score * 100).toFixed(0)}<span style={{ fontSize: '0.875rem', fontWeight: 500, marginLeft: '1px' }}>%</span>
            </div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: '4px' }}>Risk Index</div>
            
            {/* Subtle progress track */}
            <svg style={{ position: 'absolute', inset: -1, width: '94px', height: '94px', transform: 'rotate(-90deg)', pointerEvents: 'none' }}>
              <circle 
                cx="47" cy="47" r="46" 
                fill="none" stroke="#000" strokeWidth="2" 
                strokeDasharray={`${risk.overall_score * 289} 289`}
                strokeLinecap="round"
                style={{ opacity: 0.15 }}
              />
            </svg>
          </div>
          <div 
            style={{ 
              marginTop: '1.25rem', fontSize: '0.8125rem', fontWeight: 600, color: '#000', 
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem',
              opacity: 0.8
            }}
          >
            View Analysis <ChevronRight size={14} />
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Trend arrow ─────────────────────────────────────────────────────── */
function TrendPill({ delta, invertColor = false }: { delta: number; invertColor?: boolean }) {
  const isUp = delta > 0
  const isZero = delta === 0
  const isGood = invertColor ? !isUp : isUp

  let bg = '#fae1a6'
  let color = '#7A4D0A'

  if (isZero) {
    bg = '#F1F5F9'
    color = '#475569'
  } else if (isGood) {
    bg = '#dbeeda'
    color = '#1A6641'
  } else {
    bg = '#fed2c0'
    color = '#c55b55'
  }

  const sign = isZero ? '' : isUp ? '+' : '-'

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      padding: '4px 8px',
      background: bg, borderRadius: '6px',
      fontSize: '0.75rem', fontWeight: 600,
      color,
      lineHeight: 1,
    }}>
      {sign}{Math.abs(delta)}%
    </span>
  )
}

/* ── KPI Card ────────────────────────────────────────────────────────── */
interface KPIProps {
  label: string
  value: string | number
  sub?: string
  accent?: string
  icon: React.ReactNode
  loading?: boolean
  onClick?: () => void
  trend?: number
  invertTrend?: boolean
  provenance?: 'rule' | 'ai'
}
function KPICard({ label, value, sub, accent = '#52bde0', icon, loading, onClick, trend, invertTrend, provenance }: KPIProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '1rem',
        padding: '1.5rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-card)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'all 300ms cubic-bezier(0.16,1,0.3,1)',
        position: 'relative',
        overflow: 'hidden',
        transform: 'translateY(0)',
      }}
      onMouseEnter={e => { 
        if (onClick) { 
          (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-hover)'; 
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--brand-200)';
          (e.currentTarget as HTMLElement).style.transform = 'translateY(-3px)';
        } 
      }}
      onMouseLeave={e => { 
        (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-card)'; 
        (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)';
        (e.currentTarget as HTMLElement).style.transform = 'translateY(0)';
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '0.375rem', background: 'var(--bg-hover)', flexShrink: 0 }}>
          <span style={{ color: 'var(--ink-3)' }}>{icon}</span>
        </div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink-1)' }}>{label}</div>
      </div>

      <div>
        {loading ? (
          <><Skeleton w="60%" h={32} /><Skeleton w="80%" h={14} /></>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 500, color: 'var(--ink-1)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {value}
              </div>
              {trend !== undefined && (
                <div style={{ marginBottom: '0.25rem' }}>
                  <TrendPill delta={trend} invertColor={invertTrend} />
                </div>
              )}
            </div>
            {provenance && (
              <div style={{ marginTop: '0.375rem' }}>
                <ProvenanceTag type={provenance} size="xs" />
              </div>
            )}
            {sub && <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '0.375rem' }}>{sub}</div>}
          </>
        )}
      </div>
    </div>
  )
}

/* ── Section header ──────────────────────────────────────────────────── */
function SectionHeader({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 500, color: 'var(--ink-1)' }}>{title}</h2>
      {action && (
        <button onClick={onAction} style={{ fontSize: '0.75rem', color: '#000', fontWeight: 600, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}>
          {action} →
        </button>
      )}
    </div>
  )
}

const FACTOR_ICON: Record<string, React.ReactNode> = {
  disruption_severity: <Wind size={16} />,
  inventory_pressure: <Package size={16} />,
  delivery_reliability: <Truck size={16} />,
  logistics_vulnerability: <Activity size={16} />,
  dependency_exposure: <LinkIcon size={16} />,
  festival_proximity: <Calendar size={16} />,
}

function primarySignal(factors: SupplierRiskAnalysis['factors']): { name: string; icon: React.ReactNode; explanation: string } {
  const entries = Object.entries(factors ?? {}).sort(([, a], [, b]) => b.weighted - a.weighted)
  if (!entries.length) return { name: '', icon: <AlertTriangle size={16} />, explanation: 'Risk score elevated' }
  const [name, f] = entries[0]
  return { name, icon: FACTOR_ICON[name] ?? <AlertTriangle size={16} />, explanation: f.explanation }
}

/* ── Critical Issues table ───────────────────────────────────────────── */
function CriticalIssuesTable({ risks, cardMap }: { risks: SupplierRiskAnalysis[]; cardMap: Map<string, IntelligentActionCard> }) {
  const navigate = useNavigate()
  const topIssues = risks
    .filter(r => r.risk_level === 'critical' || r.risk_level === 'high')
    .sort((a, b) => {
      const expA = cardMap.get(a.supplier_id)?.financial_exposure_inr ?? 0
      const expB = cardMap.get(b.supplier_id)?.financial_exposure_inr ?? 0
      return expB - expA
    })
    .slice(0, 8)

  if (topIssues.length === 0) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
        No critical or high risk suppliers detected.
      </div>
    )
  }

  return (
    <table className="data-table">
      <thead>
        <tr>
          <th>Signal</th>
          <th>Supplier</th>
          <th>Products</th>
          <th>Exposure</th>
          <th>Score</th>
          <th>Severity</th>
        </tr>
      </thead>
      <tbody>
        {topIssues.map(r => {
          const signal = primarySignal(r.factors)
          const card = cardMap.get(r.supplier_id)
          return (
            <tr key={r.supplier_id} onClick={() => navigate(`/risks/${r.supplier_id}`)}>
              <td style={{ maxWidth: '280px' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
                  <span style={{ flexShrink: 0, marginTop: '2px', color: 'var(--ink-3)' }}>{signal.icon}</span>
                  <div>
                    <div style={{ fontWeight: 500, color: 'var(--ink-1)', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                      {card?.title ?? signal.explanation}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '2px' }}>
                      <span style={{ fontSize: '0.6875rem', color: 'var(--ink-4)' }}>
                        {card ? signal.explanation : signal.name.replace(/_/g, ' ')}
                      </span>
                      <ProvenanceTag type={card ? 'ai' : 'rule'} size="xs" />
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div style={{ fontWeight: 500, color: 'var(--ink-1)', fontSize: '0.8125rem' }}>{r.supplier_name}</div>
                {card && (
                  <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', marginTop: '2px' }}>
                    {card.city} · {card.region}
                  </div>
                )}
              </td>
              <td>
                {card ? (
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink-2)' }}>
                      {card.affected_skus} SKU{card.affected_skus !== 1 ? 's' : ''}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: card.days_to_stockout <= 7 ? '#c55b55' : 'var(--ink-4)', marginTop: '2px' }}>
                      {card.days_to_stockout}d to stockout
                    </div>
                  </div>
                ) : <span style={{ color: 'var(--ink-5)', fontSize: '0.75rem' }}>—</span>}
              </td>
              <td>
                {card ? (
                  <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: '#c55b55', fontFamily: 'JetBrains Mono, monospace' }}>
                    {formatINR(card.financial_exposure_inr)}
                  </div>
                ) : <span style={{ color: 'var(--ink-5)', fontSize: '0.75rem' }}>—</span>}
              </td>
              <td>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <div style={{ width: '52px', height: '5px', borderRadius: '999px', background: 'var(--border-strong)', overflow: 'hidden' }}>
                    <div style={{
                      width: `${(r.overall_score * 100).toFixed(0)}%`,
                      height: '100%',
                      background: r.risk_level === 'critical' ? '#c55b55' : r.risk_level === 'high' ? '#D29729' : '#52bde0',
                      borderRadius: '999px',
                      transition: 'width 0.6s cubic-bezier(0.34,1.56,0.64,1)',
                    }} />
                  </div>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-2)', fontVariantNumeric: 'tabular-nums' }}>
                    {(r.overall_score * 100).toFixed(0)}%
                  </span>
                </div>
              </td>
              <td><Badge level={r.risk_level} /></td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}

/* ── Recent disruptions feed ─────────────────────────────────────────── */
function DisruptionFeed({ disruptions }: { disruptions: Disruption[] }) {
  const navigate = useNavigate()
  const TYPE_ICON: Record<string, React.ReactNode> = { cyclone: <Wind size={18} />, strike: <Truck size={18} />, logistics: <Package size={18} />, inventory: <Activity size={18} />, quality: <Search size={18} />, regulatory: <ClipboardList size={18} /> }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      {disruptions.slice(0, 5).map((d, i, arr) => (
        <div key={d.id}>
          <div
            onClick={() => navigate(`/risks/${d.supplier_id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1rem 1.25rem',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background 200ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent';
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '0.5rem', background: d.is_active ? '#fed2c040' : 'var(--bg-hover)', color: d.is_active ? '#c55b55' : '#000', flexShrink: 0 }}>
              {TYPE_ICON[d.disruption_type] || <AlertTriangle size={18} />}
            </div>
            
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink-1)', lineHeight: 1.4, marginBottom: '0.25rem' }}>
                {d.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
                <Badge level={d.severity} />
                {d.region && <span style={{ fontSize: '0.6875rem', color: 'var(--ink-2)', fontWeight: 500 }}>{d.region}</span>}
                {d.is_active && (
                  <span style={{ fontSize: '0.6875rem', fontWeight: 600, color: '#c55b55', letterSpacing: '0.01em' }}>ACTIVE</span>
                )}
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink-1)' }}>{d.affected_skus_count}</div>
              <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', marginTop: '1px', fontWeight: 500 }}>SKUs</div>
            </div>
          </div>
          {i < arr.length - 1 && (
            <div style={{ height: '1px', background: 'var(--border)', margin: '0 1.25rem' }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Top exposures list ───────────────────────────────────────────────── */
function TopExposures({ financial }: { financial: any }) {
  const navigate = useNavigate()
  const top = financial?.top_exposures?.slice(0, 5) ?? []

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      {top.map((e: any, i: number, arr: any[]) => (
        <div key={e.supplier_id}>
          <div
            onClick={() => navigate(`/companies/${e.supplier_id}`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1rem 1.25rem',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background 200ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '0.5rem', background: 'var(--bg-hover)', color: '#000', flexShrink: 0 }}>
              <Users size={18} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink-1)', marginBottom: '0.25rem' }}>
                {e.supplier_name}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Badge level={e.exposure_level} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-2)', fontWeight: 500 }}>Active Supplier</span>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: e.exposure_level === 'critical' ? '#c55b55' : '#000', fontFamily: 'Outfit, sans-serif' }}>
                {formatINR(e.total_exposure_inr)}
              </div>
              <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', marginTop: '1px', fontWeight: 500 }}>Exposure</div>
            </div>
          </div>
          {i < arr.length - 1 && (
            <div style={{ height: '1px', background: 'var(--border)', margin: '0 1.25rem' }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Pending actions list ────────────────────────────────────────────── */
function PendingActions({ cards }: { cards: ActionCard[] }) {
  const navigate = useNavigate()
  const top = cards.filter(c => !c.is_resolved).slice(0, 5)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: '1rem', overflow: 'hidden' }}>
      {top.map((card, i, arr) => (
        <div key={card.id}>
          <div
            onClick={() => navigate(`/risks/${card.supplier_id}/mitigation`)}
            style={{
              display: 'flex', alignItems: 'center', gap: '1rem',
              padding: '1rem 1.25rem',
              background: 'transparent',
              cursor: 'pointer',
              transition: 'background 200ms ease',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background = 'var(--bg-hover)'
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background = 'transparent'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '36px', height: '36px', borderRadius: '0.5rem', background: 'var(--bg-hover)', color: '#000', flexShrink: 0 }}>
              <ClipboardList size={18} />
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: 'var(--ink-1)', marginBottom: '0.25rem', lineHeight: 1.4 }}>
                {card.title}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                <Badge level={card.priority} />
                <span style={{ fontSize: '0.6875rem', color: 'var(--ink-2)', fontWeight: 500 }}>Requires Action</span>
              </div>
            </div>

            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.875rem', fontWeight: 500, color: card.priority === 'critical' ? '#c55b55' : '#000' }}>
                {formatINR(card.estimated_impact_inr)}
              </div>
              <div style={{ fontSize: '0.625rem', color: 'var(--ink-4)', textTransform: 'uppercase', marginTop: '1px', fontWeight: 500 }}>Impact</div>
            </div>
          </div>
          {i < arr.length - 1 && (
            <div style={{ height: '1px', background: 'var(--border)', margin: '0 1.25rem' }} />
          )}
        </div>
      ))}
    </div>
  )
}

/* ── Dashboard ───────────────────────────────────────────────────────── */
export function Dashboard() {
  const navigate = useNavigate()
  const [showBoardBrief, setShowBoardBrief] = useState(false)

  const { data: summary, isLoading: loadingSummary } = useDashboardSummary()
  const { data: risks, isLoading: loadingRisks, isCustom: customWeightsActive } = useWeightedRiskAnalysis()
  const { data: supplierData, isLoading: loadingSuppliers } = useSuppliers()
  const { data: disruptions, isLoading: loadingDisruptions } = useDisruptions()
  const { data: financial } = useFinancialSummary()
  const { data: stockout } = useStockoutForecast()
  const { data: actionData } = useActionCards()
  const { data: procCards } = useProcurementCards()

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []
  const cardMap = useMemo(
    () => new Map((procCards as IntelligentActionCard[] | undefined ?? []).map(c => [c.supplier_id, c])),
    [procCards]
  )

  const criticalCount = riskList.filter(r => r.risk_level === 'critical').length
  const highRiskCount = riskList.filter(r => r.risk_level === 'critical' || r.risk_level === 'high').length

  // Top risk for spotlight
  const topRisk = useMemo(() =>
    riskList.slice().sort((a, b) => b.overall_score - a.overall_score)[0] ?? null,
    [riskList]
  )
  const topRiskCard = topRisk ? cardMap.get(topRisk.supplier_id) : undefined

  const KPI_ICONS = {
    critical: <AlertTriangle size={20} />,
    financial: <DollarSign size={20} />,
    suppliers: <Users size={20} />,
    stockout: <Package size={20} />,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

      {/* ── Critical Alert Banner ────────────────────────────────── */}
      {!loadingRisks && (
        <CriticalAlertBanner
          count={criticalCount}
          topRisk={riskList.filter(r => r.risk_level === 'critical').sort((a, b) => b.overall_score - a.overall_score)[0] ?? null}
          onView={() => navigate('/risks?filter=critical')}
        />
      )}

      {/* ── Page header ─────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1.25rem' }}>
        <div>
          <h1 style={{ fontSize: '1.625rem', fontWeight: 600, color: 'var(--ink-1)', letterSpacing: '-0.025em', marginBottom: '0.25rem' }}>
            Supply Dashboard
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', fontWeight: 400 }}>
            Welcome back, Cipher!
          </p>
        </div>

        {/* Board Brief button */}
        <button
          onClick={() => setShowBoardBrief(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.625rem 1.25rem',
            background: '#1e293b',
            color: '#fff',
            borderRadius: '2rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 600,
            fontFamily: 'inherit',
            boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
            transition: 'all 200ms ease',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.background = '#0f172a'
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.15)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.background = '#1e293b'
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(0,0,0,0.1)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 6h8M4 9h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Generate Board Brief
        </button>
      </div>



      {/* ── Custom weights notice ───────────────────────────────────── */}
      {customWeightsActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          padding: '0.5rem 0.875rem',
          background: '#a8def0', border: '1px solid #a8def0',
          borderRadius: '0.625rem',
          fontSize: '0.75rem', color: '#52bde0',
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span><strong>Custom risk weights active</strong> — scores are recomputed using your Settings configuration.</span>
          <button
            onClick={() => navigate('/settings')}
            style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#52bde0', fontWeight: 500, background: 'none', border: '1px solid var(--border)', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            Edit weights →
          </button>
        </div>
      )}

      {/* ── Top Risk Spotlight ───────────────────────────────────────── */}
      {!loadingRisks && topRisk && (
        <TopRiskSpotlight risk={topRisk} card={topRiskCard} />
      )}

      {/* ── KPI row ─────────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
        <KPICard
          label="Critical Issues"
          value={loadingRisks ? '—' : criticalCount}
          sub={`${highRiskCount} total high/critical`}
          accent="#c55b55"
          icon={KPI_ICONS.critical}
          loading={loadingRisks}
          onClick={() => navigate('/risks?filter=critical')}
          trend={criticalCount > 0 ? 12 : 0}
          invertTrend
          provenance="rule"
        />
        <KPICard
          label="Financial Exposure"
          value={loadingSummary ? '—' : formatINR(financial?.total_financial_exposure_inr ?? 0)}
          sub={`Revenue at risk: ${formatINR(financial?.total_revenue_at_risk_inr ?? 0)}`}
          accent="#D29729"
          icon={KPI_ICONS.financial}
          loading={loadingSummary}
          onClick={() => navigate('/risks')}
          trend={8}
          invertTrend
          provenance="rule"
        />
        <KPICard
          label="Suppliers at Risk"
          value={loadingSummary ? '—' : `${summary?.supplier_health?.high_risk_count ?? 0}`}
          sub={`of ${summary?.supplier_health?.total_suppliers ?? 0} total · ${((summary?.supplier_health?.avg_reliability ?? 0) * 100).toFixed(0)}% avg reliability`}
          accent="#6D28D9"
          icon={KPI_ICONS.suppliers}
          loading={loadingSummary}
          onClick={() => navigate('/companies')}
          trend={-3}
          invertTrend
          provenance="rule"
        />
        <KPICard
          label="Stockout Alerts"
          value={loadingSummary ? '—' : (stockout?.critical_count ?? 0)}
          sub={`${formatINR(stockout?.total_revenue_at_risk_inr ?? 0)} revenue at risk`}
          accent="#52bde0"
          icon={KPI_ICONS.stockout}
          loading={loadingSummary}
          onClick={() => navigate('/risks')}
          trend={5}
          invertTrend
          provenance="rule"
        />
      </div>

      {/* ── Main content grid ────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '1.25rem', alignItems: 'start' }}>

        {/* Left: Critical issues table */}
        <div>
          <SectionHeader
            title="Critical Issues"
            action="View all risks"
            onAction={() => navigate('/risks')}
          />
          <div className="card-flush">
            {loadingRisks
              ? <div style={{ padding: '1rem' }}><Skeleton h={40} /><Skeleton h={40} /><Skeleton h={40} /></div>
              : <CriticalIssuesTable risks={riskList} cardMap={cardMap} />
            }
          </div>
        </div>

        {/* Right: India map */}
        <div>
          <SectionHeader title="Supplier Geography" />
          <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '1rem',
            padding: '1.25rem',
            boxShadow: 'var(--shadow-card)',
            height: '420px',
          }}>
            {(loadingSuppliers || loadingRisks)
              ? <div className="skeleton" style={{ width: '100%', height: '100%', borderRadius: '0.5rem' }} />
              : (
                <IndiaMap
                  suppliers={supplierData?.suppliers ?? []}
                  risks={riskList}
                  onCityClick={(city) => navigate(`/companies?city=${encodeURIComponent(city)}`)}
                />
              )
            }
          </div>
        </div>
      </div>

      {/* ── Bottom row ───────────────────────────────────────────────── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>

        {/* Active Disruptions */}
        <div>
          <SectionHeader
            title="Active Disruptions"
            action="View all"
            onAction={() => navigate('/risks')}
          />
            {loadingDisruptions
              ? <><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></>
              : <DisruptionFeed disruptions={disruptions?.disruptions ?? []} />
            }
        </div>

        {/* Financial Exposure */}
        <div>
          <SectionHeader
            title="Top Exposures"
            action="View all"
            onAction={() => navigate('/risks')}
          />
            {!financial
              ? <><Skeleton h={52} /><Skeleton h={52} /><Skeleton h={52} /></>
              : <TopExposures financial={financial} />
            }
        </div>

        {/* Pending Actions */}
        <div>
          <SectionHeader
            title="Pending Actions"
            action="View all"
            onAction={() => navigate('/risks')}
          />
            {!actionData
              ? <><Skeleton h={52} /><Skeleton h={52} /><Skeleton h={52} /></>
              : <PendingActions cards={actionData.action_cards} />
            }
        </div>

      </div>

      {/* ── Board Brief Modal ────────────────────────────────────────── */}
      {showBoardBrief && <BoardBriefModal onClose={() => setShowBoardBrief(false)} />}

    </div>
  )
}
