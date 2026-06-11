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
import { api } from '../services/api'
import type { SupplierRiskAnalysis, Disruption, ActionCard, IntelligentActionCard, ExecutiveBrief } from '../types'

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
      background: '#FEF2F2',
      border: '1px solid #FCA5A5',
      borderRadius: '0.75rem',
      padding: '0.875rem 1.25rem',
      display: 'flex',
      alignItems: 'center',
      gap: '1rem',
      boxShadow: 'var(--shadow-sm)',
      animation: 'slideDown 300ms cubic-bezier(0.16,1,0.3,1)',
    }}>
      {/* Pulse dot */}
      <div style={{ position: 'relative', flexShrink: 0 }}>
        <div style={{ width: '10px', height: '10px', borderRadius: '50%', background: '#EF4444' }} />
        <div style={{
          position: 'absolute', inset: '-4px',
          borderRadius: '50%', border: '2px solid #EF4444',
          animation: 'pulse 1.5s ease-in-out infinite',
          opacity: 0.4,
        }} />
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#991B1B' }}>
          🚨 {count} Critical Supply Chain Issue{count !== 1 ? 's' : ''} Require Immediate Attention
        </div>
        {topRisk && (
          <div style={{ fontSize: '0.75rem', color: '#B91C1C', marginTop: '2px' }}>
            Highest risk: <strong style={{ color: '#DC2626' }}>{topRisk.supplier_name}</strong> —{' '}
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
            color: '#DC2626',
            borderRadius: '0.5rem',
            border: '1px solid #FCA5A5',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#FEF2F2'}
          onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
        >
          View Critical Issues
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            padding: '0.5rem',
            background: 'transparent',
            color: '#F87171',
            borderRadius: '0.5rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '1rem',
            fontFamily: 'inherit',
            lineHeight: 1,
            transition: 'color 150ms',
          }}
          onMouseEnter={e => e.currentTarget.style.color = '#DC2626'}
          onMouseLeave={e => e.currentTarget.style.color = '#F87171'}
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
        borderRadius: '1rem',
        width: '100%',
        maxWidth: '640px',
        maxHeight: '80vh',
        overflow: 'auto',
        boxShadow: '0 25px 60px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '1.25rem 1.5rem',
          borderBottom: '1px solid #E2E8F0',
          position: 'sticky', top: 0, background: '#fff', zIndex: 1,
        }}>
          <div>
            <h2 style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--ink-1)' }}>Board Brief</h2>
            <p style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px' }}>
              AI-generated executive summary · AWS Strands Agents
            </p>
          </div>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              onClick={() => window.print()}
              style={{
                padding: '0.5rem 0.875rem',
                background: 'var(--border-strong)', color: 'var(--ink-2)',
                borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                fontSize: '0.75rem', fontWeight: 600, fontFamily: 'inherit',
              }}
            >
              🖨️ Print
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '0.5rem 0.75rem',
                background: 'var(--border-strong)', color: 'var(--ink-3)',
                borderRadius: '0.5rem', border: 'none', cursor: 'pointer',
                fontSize: '0.875rem', fontFamily: 'inherit',
              }}
            >
              ×
            </button>
          </div>
        </div>

        {/* Body */}
        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {loading && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              <Skeleton h={20} w="70%" />
              <Skeleton h={80} />
              <Skeleton h={20} w="60%" />
              <Skeleton h={60} />
              <Skeleton h={20} w="65%" />
              <Skeleton h={60} />
            </div>
          )}
          {error && (
            <div style={{
              padding: '1rem', background: '#FEF2F2', border: '1px solid #FECACA',
              borderRadius: '0.625rem', fontSize: '0.875rem', color: '#DC2626',
            }}>
              {error}
              <button onClick={fetchBrief} style={{ marginLeft: '0.75rem', fontSize: '0.8125rem', color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
                Retry →
              </button>
            </div>
          )}
          {brief && (
            <>
              {/* KPI overview */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                {[
                  { label: 'Suppliers at Risk', value: String(brief.at_risk_suppliers), color: '#DC2626' },
                  { label: 'Total Exposure', value: formatINR(brief.total_exposure_inr), color: '#D97706' },
                  { label: 'Critical Stockouts', value: String(brief.critical_stockouts), color: '#7C3AED' },
                ].map(kpi => (
                  <div key={kpi.label} style={{
                    padding: '0.875rem',
                    background: 'var(--bg-hover)', border: '1px solid #E2E8F0',
                    borderRadius: '0.625rem', textAlign: 'center',
                  }}>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: kpi.color }}>{kpi.value}</div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--ink-3)', marginTop: '2px' }}>{kpi.label}</div>
                  </div>
                ))}
              </div>

              {/* Summary */}
              <div>
                <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                  Executive Summary
                </div>
                <p style={{ fontSize: '0.875rem', color: 'var(--ink-2)', lineHeight: 1.7, background: 'var(--bg-hover)', padding: '0.875rem', borderRadius: '0.625rem', border: '1px solid #E2E8F0' }}>
                  {brief.summary}
                </p>
              </div>

              {/* Top risks */}
              {brief.top_risks.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    Key Risk Areas
                  </div>
                  <ul style={{ margin: 0, paddingLeft: '1.25rem', display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {brief.top_risks.map((r, i) => (
                      <li key={i} style={{ fontSize: '0.8125rem', color: 'var(--ink-2)', lineHeight: 1.5 }}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Immediate actions */}
              {brief.immediate_actions.length > 0 && (
                <div>
                  <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: 'var(--ink-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.5rem' }}>
                    Immediate Actions Required
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
                    {brief.immediate_actions.map((action, i) => (
                      <div key={i} style={{
                        display: 'flex', gap: '0.625rem', alignItems: 'flex-start',
                        padding: '0.5rem 0.75rem',
                        background: '#FFF7ED', border: '1px solid #FED7AA',
                        borderRadius: '0.5rem',
                      }}>
                        <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#EA580C', flexShrink: 0, paddingTop: '2px' }}>
                          {String(i + 1).padStart(2, '0')}
                        </span>
                        <span style={{ fontSize: '0.8125rem', color: '#7C2D12', lineHeight: 1.5 }}>{action}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', textAlign: 'right' }}>
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

  const COLOR: Record<string, string> = { critical: '#DC2626', high: '#D97706', medium: '#2563EB', low: '#059669' }
  const accent = COLOR[risk.risk_level] ?? '#2563EB'

  return (
    <div
      onClick={() => navigate(`/risks/${risk.supplier_id}`)}
      style={{
        background: `linear-gradient(135deg, var(--ink-1) 0%, #1E3A5F 100%)`,
        borderRadius: '0.875rem',
        padding: '1.25rem 1.5rem',
        cursor: 'pointer',
        boxShadow: '0 4px 16px rgba(15,23,42,0.25)',
        transition: 'box-shadow 150ms',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => (e.currentTarget.style.boxShadow = '0 6px 24px rgba(15,23,42,0.35)')}
      onMouseLeave={e => (e.currentTarget.style.boxShadow = '0 4px 16px rgba(15,23,42,0.25)')}
    >
      {/* Background accent */}
      <div style={{
        position: 'absolute', top: '-20px', right: '-20px',
        width: '120px', height: '120px',
        borderRadius: '50%',
        background: `${accent}20`,
        border: `2px solid ${accent}30`,
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', position: 'relative' }}>
        <div>
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: '0.5rem' }}>
            🔥 Top Risk — Immediate Action
          </div>
          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: 'var(--bg-card)', letterSpacing: '-0.01em' }}>
            {risk.supplier_name}
          </div>
          {card && (
            <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.55)', marginTop: '0.375rem', lineHeight: 1.5, maxWidth: '380px' }}>
              {card.recommended_action}
            </div>
          )}
          <div style={{ display: 'flex', gap: '0.75rem', marginTop: '0.75rem', flexWrap: 'wrap' }}>
            <Badge level={risk.risk_level} />
            {card && (
              <>
                <span style={{ fontSize: '0.6875rem', color: '#FCA5A5', fontWeight: 600 }}>
                  {formatINR(card.financial_exposure_inr)} exposure
                </span>
                <span style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)' }}>·</span>
                <span style={{ fontSize: '0.6875rem', color: card.days_to_stockout <= 7 ? '#FCA5A5' : 'rgba(255,255,255,0.55)' }}>
                  {card.days_to_stockout}d to stockout
                </span>
              </>
            )}
          </div>
        </div>

        <div style={{ textAlign: 'center', flexShrink: 0, position: 'relative' }}>
          <div style={{
            fontSize: '2.5rem', fontWeight: 900,
            color: accent, letterSpacing: '-0.04em', lineHeight: 1,
            textShadow: `0 0 20px ${accent}60`,
          }}>
            {(risk.overall_score * 100).toFixed(0)}<span style={{ fontSize: '1rem', color: 'rgba(255,255,255,0.4)' }}>%</span>
          </div>
          <div style={{ fontSize: '0.625rem', color: 'rgba(255,255,255,0.35)', marginTop: '0.25rem' }}>risk score</div>
          <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.5)', marginTop: '0.5rem', fontWeight: 600 }}>
            View Details →
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Trend arrow ─────────────────────────────────────────────────────── */
function TrendPill({ delta, invertColor = false }: { delta: number; invertColor?: boolean }) {
  // invertColor=true: increase is bad (risk, exposure)
  const isUp = delta >= 0
  const isGood = invertColor ? !isUp : isUp
  const color = delta === 0 ? 'var(--ink-4)' : isGood ? '#059669' : '#DC2626'
  const bg = delta === 0 ? 'var(--border-strong)' : isGood ? '#F0FDF4' : '#FEF2F2'

  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: '2px',
      padding: '2px 6px',
      background: bg, borderRadius: '999px',
      fontSize: '0.625rem', fontWeight: 700,
      color,
    }}>
      {delta === 0 ? '→' : isUp ? '↑' : '↓'} {Math.abs(delta)}%
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
}
function KPICard({ label, value, sub, accent = '#2563EB', icon, loading, onClick, trend, invertTrend }: KPIProps) {
  return (
    <div
      onClick={onClick}
      style={{
        background: 'var(--bg-card)',
        border: '1px solid var(--border)',
        borderRadius: '0.875rem',
        padding: '1.25rem 1.375rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.75rem',
        boxShadow: 'var(--shadow-xs)',
        cursor: onClick ? 'pointer' : 'default',
        transition: 'box-shadow 150ms, border-color 150ms',
        position: 'relative',
        overflow: 'hidden',
      }}
      onMouseEnter={e => { if (onClick) { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-md)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-strong)' } }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'var(--shadow-xs)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '28px', height: '28px', borderRadius: '0.375rem', background: `${accent}15`, flexShrink: 0 }}>
          <span style={{ color: accent }}>{icon}</span>
        </div>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-1)' }}>{label}</div>
      </div>

      <div>
        {loading ? (
          <><Skeleton w="60%" h={32} /><Skeleton w="80%" h={14} /></>
        ) : (
          <>
            <div style={{ display: 'flex', alignItems: 'flex-end', gap: '0.5rem', marginTop: '0.25rem' }}>
              <div style={{ fontSize: '1.75rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.03em', lineHeight: 1 }}>
                {value}
              </div>
              {trend !== undefined && (
                <div style={{ marginBottom: '0.25rem' }}>
                  <TrendPill delta={trend} invertColor={invertTrend} />
                </div>
              )}
            </div>
            {sub && <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '0.5rem' }}>{sub}</div>}
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
      <h2 style={{ fontSize: '0.9375rem', fontWeight: 700, color: 'var(--ink-1)' }}>{title}</h2>
      {action && (
        <button onClick={onAction} style={{ fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}>
          {action} →
        </button>
      )}
    </div>
  )
}

const FACTOR_ICON: Record<string, string> = {
  disruption_severity: '🌀',
  inventory_pressure: '📦',
  delivery_reliability: '🚚',
  logistics_vulnerability: '🛣️',
  dependency_exposure: '🔗',
  festival_proximity: '🎆',
}

function primarySignal(factors: SupplierRiskAnalysis['factors']): { name: string; icon: string; explanation: string } {
  const entries = Object.entries(factors ?? {}).sort(([, a], [, b]) => b.weighted - a.weighted)
  if (!entries.length) return { name: '', icon: '⚠️', explanation: 'Risk score elevated' }
  const [name, f] = entries[0]
  return { name, icon: FACTOR_ICON[name] ?? '⚠️', explanation: f.explanation }
}

/* ── Critical Issues table ───────────────────────────────────────────── */
function CriticalIssuesTable({ risks, cardMap }: { risks: SupplierRiskAnalysis[]; cardMap: Map<string, IntelligentActionCard> }) {
  const navigate = useNavigate()
  const topIssues = risks
    .filter(r => r.risk_level === 'critical' || r.risk_level === 'high')
    .sort((a, b) => b.overall_score - a.overall_score)
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
                <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem' }}>
                  <span style={{ fontSize: '1rem', flexShrink: 0, lineHeight: 1.4 }}>{signal.icon}</span>
                  <div>
                    <div style={{ fontWeight: 600, color: 'var(--ink-1)', fontSize: '0.8125rem', lineHeight: 1.4 }}>
                      {card?.title ?? signal.explanation}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', marginTop: '2px' }}>
                      {card ? signal.explanation : signal.name.replace(/_/g, ' ')}
                    </div>
                  </div>
                </div>
              </td>
              <td>
                <div style={{ fontWeight: 600, color: 'var(--ink-1)', fontSize: '0.8125rem' }}>{r.supplier_name}</div>
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
                    <div style={{ fontSize: '0.6875rem', color: card.days_to_stockout <= 7 ? '#DC2626' : 'var(--ink-4)', marginTop: '2px' }}>
                      {card.days_to_stockout}d to stockout
                    </div>
                  </div>
                ) : <span style={{ color: 'var(--ink-5)', fontSize: '0.75rem' }}>—</span>}
              </td>
              <td>
                {card ? (
                  <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#DC2626', fontFamily: 'JetBrains Mono, monospace' }}>
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
                      background: r.risk_level === 'critical' ? '#DC2626' : r.risk_level === 'high' ? '#D97706' : '#2563EB',
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
  const TYPE_ICON: Record<string, string> = { cyclone: '🌀', strike: '🚛', logistics: '📦', inventory: '🏭', quality: '🔍', regulatory: '📋' }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {disruptions.slice(0, 5).map(d => (
        <div
          key={d.id}
          onClick={() => navigate(`/risks/${d.supplier_id}`)}
          style={{
            display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            padding: '0.75rem',
            background: d.is_active ? 'rgba(220,38,38,0.03)' : 'var(--bg-app)',
            border: `1px solid ${d.is_active ? 'rgba(220,38,38,0.12)' : 'var(--border)'}`,
            borderRadius: '0.625rem',
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = d.is_active ? 'rgba(220,38,38,0.06)' : '#F0F4F8')}
          onMouseLeave={e => (e.currentTarget.style.background = d.is_active ? 'rgba(220,38,38,0.03)' : 'var(--bg-app)')}
        >
          <span style={{ fontSize: '1.125rem', flexShrink: 0, marginTop: '1px' }}>{TYPE_ICON[d.disruption_type] || '⚠️'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {d.title}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginTop: '0.25rem' }}>
              <Badge level={d.severity} />
              {d.region && <span style={{ fontSize: '0.6875rem', color: 'var(--ink-3)' }}>{d.region}</span>}
              {d.is_active && (
                <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#DC2626', textTransform: 'uppercase', letterSpacing: '0.05em' }}>ACTIVE</span>
              )}
            </div>
          </div>
          <div style={{ fontSize: '0.6875rem', color: 'var(--ink-4)', flexShrink: 0, textAlign: 'right' }}>
            {d.affected_skus_count} SKUs
          </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {top.map((e: any) => (
        <div
          key={e.supplier_id}
          onClick={() => navigate(`/companies/${e.supplier_id}`)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.75rem',
            padding: '0.625rem 0.75rem',
            background: 'var(--bg-app)',
            border: '1px solid #E2E8F0',
            borderRadius: '0.625rem',
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e2 => (e2.currentTarget.style.background = '#F0F4F8')}
          onMouseLeave={e2 => (e2.currentTarget.style.background = 'var(--bg-app)')}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {e.supplier_name}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <Badge level={e.exposure_level} />
            <span style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#DC2626', fontFamily: 'JetBrains Mono, monospace' }}>
              {formatINR(e.total_exposure_inr)}
            </span>
          </div>
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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      {top.map(card => (
        <div
          key={card.id}
          onClick={() => navigate('/risks')}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.625rem',
            padding: '0.625rem 0.75rem',
            background: card.priority === 'critical' ? 'rgba(220,38,38,0.03)' : 'var(--bg-app)',
            border: `1px solid ${card.priority === 'critical' ? 'rgba(220,38,38,0.12)' : 'var(--border)'}`,
            borderLeft: `3px solid ${card.priority === 'critical' ? '#DC2626' : card.priority === 'high' ? '#D97706' : card.priority === 'medium' ? '#2563EB' : '#059669'}`,
            borderRadius: '0.625rem',
            cursor: 'pointer',
            transition: 'background 150ms',
          }}
          onMouseEnter={e => (e.currentTarget.style.background = '#F0F4F8')}
          onMouseLeave={e => (e.currentTarget.style.background = card.priority === 'critical' ? 'rgba(220,38,38,0.03)' : 'var(--bg-app)')}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink-1)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {card.title}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexShrink: 0 }}>
            <Badge level={card.priority} />
            <span style={{ fontSize: '0.75rem', fontFamily: 'JetBrains Mono, monospace', color: 'var(--ink-3)' }}>
              {formatINR(card.estimated_impact_inr)}
            </span>
          </div>
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
    critical: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <path d="M10 2L17.5 15.5H2.5L10 2Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
        <path d="M10 8v3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <circle cx="10" cy="13.5" r="0.75" fill="currentColor" />
      </svg>
    ),
    financial: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="10" cy="10" r="8" stroke="currentColor" strokeWidth="1.5" />
        <path d="M10 6v8M7.5 8.5C7.5 7.4 8.6 7 10 7s2.5.6 2.5 1.5c0 2-5 2-5 4 0 1.1 1.1 1.5 2.5 1.5s2.5-.4 2.5-1.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
    suppliers: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <circle cx="8" cy="7" r="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M2 17c0-3.3 2.7-6 6-6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M14 11l2 2 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    ),
    stockout: (
      <svg width="18" height="18" viewBox="0 0 20 20" fill="none">
        <rect x="2" y="5" width="16" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5" />
        <path d="M6 5V4a2 2 0 0 1 4 0v1M10 5V4a2 2 0 0 1 4 0v1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        <path d="M7 11h6M7 14h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
    ),
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
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
            Sales Dashboard
          </h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)' }}>
            Welcome back, <strong style={{ color: 'var(--primary)' }}>Naveen</strong> — {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}
          </p>
        </div>

        {/* Board Brief button */}
        <button
          onClick={() => setShowBoardBrief(true)}
          style={{
            display: 'flex', alignItems: 'center', gap: '0.5rem',
            padding: '0.625rem 1.125rem',
            background: 'var(--ink-1)',
            color: 'var(--bg-card)',
            borderRadius: '0.625rem',
            border: 'none',
            cursor: 'pointer',
            fontSize: '0.8125rem',
            fontWeight: 700,
            fontFamily: 'inherit',
            boxShadow: '0 2px 8px rgba(15,23,42,0.2)',
            transition: 'transform 100ms, box-shadow 100ms',
          }}
          onMouseEnter={e => {
            e.currentTarget.style.transform = 'translateY(-1px)'
            e.currentTarget.style.boxShadow = '0 4px 12px rgba(15,23,42,0.3)'
          }}
          onMouseLeave={e => {
            e.currentTarget.style.transform = 'translateY(0)'
            e.currentTarget.style.boxShadow = '0 2px 8px rgba(15,23,42,0.2)'
          }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <rect x="1" y="2" width="14" height="12" rx="2" stroke="currentColor" strokeWidth="1.5" />
            <path d="M4 6h8M4 9h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          Generate Board Brief
        </button>
      </div>

      {/* ── View selector ────────────────────────────────────────────── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1.5rem', borderBottom: '1px solid var(--border)', paddingBottom: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: 'var(--ink-1)' }}>
          Select Views &rsaquo;
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', fontSize: '0.8125rem', fontWeight: 500 }}>
          <span style={{ color: 'var(--ink-4)', cursor: 'pointer' }}>Last 24 Hours</span>
          <span style={{ color: 'var(--primary)', cursor: 'pointer', borderBottom: '2px solid var(--primary)', paddingBottom: '0.5rem', marginBottom: '-0.5rem' }}>Weekly View</span>
          <span style={{ color: 'var(--ink-4)', cursor: 'pointer' }}>Monthly View</span>
          <span style={{ color: 'var(--ink-4)', cursor: 'pointer' }}>Yearly View</span>
        </div>
      </div>

      {/* ── Custom weights notice ───────────────────────────────────── */}
      {customWeightsActive && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '0.625rem',
          padding: '0.5rem 0.875rem',
          background: '#EFF6FF', border: '1px solid #BFDBFE',
          borderRadius: '0.625rem',
          fontSize: '0.75rem', color: '#1D4ED8',
        }}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
            <circle cx="8" cy="8" r="7" stroke="currentColor" strokeWidth="1.5" />
            <path d="M8 5v4M8 11v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          </svg>
          <span><strong>Custom risk weights active</strong> — scores are recomputed using your Settings configuration.</span>
          <button
            onClick={() => navigate('/settings')}
            style={{ marginLeft: 'auto', fontSize: '0.75rem', color: '#2563EB', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
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
          accent="#DC2626"
          icon={KPI_ICONS.critical}
          loading={loadingRisks}
          onClick={() => navigate('/risks?filter=critical')}
          trend={criticalCount > 0 ? 12 : 0}
          invertTrend
        />
        <KPICard
          label="Financial Exposure"
          value={loadingSummary ? '—' : formatINR(financial?.total_financial_exposure_inr ?? 0)}
          sub={`Revenue at risk: ${formatINR(financial?.total_revenue_at_risk_inr ?? 0)}`}
          accent="#D97706"
          icon={KPI_ICONS.financial}
          loading={loadingSummary}
          onClick={() => navigate('/risks')}
          trend={8}
          invertTrend
        />
        <KPICard
          label="Suppliers at Risk"
          value={loadingSummary ? '—' : `${summary?.supplier_health?.high_risk_count ?? 0}`}
          sub={`of ${summary?.supplier_health?.total_suppliers ?? 0} total · ${((summary?.supplier_health?.avg_reliability ?? 0) * 100).toFixed(0)}% avg reliability`}
          accent="#7C3AED"
          icon={KPI_ICONS.suppliers}
          loading={loadingSummary}
          onClick={() => navigate('/companies')}
          trend={-3}
          invertTrend
        />
        <KPICard
          label="Stockout Alerts"
          value={loadingSummary ? '—' : (stockout?.critical_count ?? 0)}
          sub={`${formatINR(stockout?.total_revenue_at_risk_inr ?? 0)} revenue at risk`}
          accent="#2563EB"
          icon={KPI_ICONS.stockout}
          loading={loadingSummary}
          onClick={() => navigate('/risks')}
          trend={5}
          invertTrend
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
            border: '1px solid #E2E8F0',
            borderRadius: '0.875rem',
            padding: '1rem',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
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
          <div style={{
            background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem',
            padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            {loadingDisruptions
              ? <><Skeleton h={64} /><Skeleton h={64} /><Skeleton h={64} /></>
              : <DisruptionFeed disruptions={disruptions?.disruptions ?? []} />
            }
          </div>
        </div>

        {/* Financial Exposure */}
        <div>
          <SectionHeader
            title="Top Exposures"
            action="View all"
            onAction={() => navigate('/risks')}
          />
          <div style={{
            background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem',
            padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            {!financial
              ? <><Skeleton h={52} /><Skeleton h={52} /><Skeleton h={52} /></>
              : <TopExposures financial={financial} />
            }
          </div>
        </div>

        {/* Pending Actions */}
        <div>
          <SectionHeader
            title="Pending Actions"
            action="View all"
            onAction={() => navigate('/risks')}
          />
          <div style={{
            background: 'var(--bg-card)', border: '1px solid #E2E8F0', borderRadius: '0.875rem',
            padding: '1rem', boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}>
            {!actionData
              ? <><Skeleton h={52} /><Skeleton h={52} /><Skeleton h={52} /></>
              : <PendingActions cards={actionData.action_cards} />
            }
          </div>
        </div>

      </div>

      {/* ── Board Brief Modal ────────────────────────────────────────── */}
      {showBoardBrief && <BoardBriefModal onClose={() => setShowBoardBrief(false)} />}

    </div>
  )
}
