import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActionCards, useWeightedRiskAnalysis, useProcurementCards } from '../hooks/useQueries'
import {
  ShieldAlert, CheckCircle2, ArrowRight, TrendingDown, ShieldCheck,
  AlertOctagon, Clock, Banknote
} from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'
import { AiBadge } from '../components/ui/AiBadge'

/* ── Formatting ──────────────────────────────────────────────────────── */
function formatINR(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v}`
}

const LEVEL_CONFIG = {
  critical: { color: '#EF4444', bg: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.12)', label: 'CRITICAL', icon: AlertOctagon },
  high:     { color: '#F59E0B', bg: 'rgba(245, 158, 11, 0.05)', border: '1px solid rgba(245, 158, 11, 0.12)', label: 'HIGH', icon: ShieldAlert },
  medium:   { color: '#3B82F6', bg: 'rgba(59, 130, 246, 0.05)', border: '1px solid rgba(59, 130, 246, 0.12)', label: 'MEDIUM', icon: ShieldAlert },
  low:      { color: '#10B981', bg: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.12)', label: 'LOW', icon: ShieldCheck },
} as const

/* ── Intelligent Action Card (Pending) ───────────────────────────────── */
function ActionCard({ risk, card }: { risk: SupplierRiskAnalysis; card: IntelligentActionCard }) {
  const navigate = useNavigate()
  const cfg = LEVEL_CONFIG[risk.risk_level] ?? LEVEL_CONFIG.low
  const Icon = cfg.icon
  const urgent = card.days_to_stockout <= 7
  const likelihood = (risk.overall_score * 100).toFixed(0)

  return (
    <div className="action-card">
      {/* Card Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          <h3 style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#0F172A', margin: 0, letterSpacing: '-0.01em', lineHeight: 1.3 }}>
            {risk.supplier_name}
          </h3>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', background: cfg.bg, border: cfg.border, padding: '2px 8px', borderRadius: '4px', width: 'fit-content' }}>
            <Icon size={10} color={cfg.color} />
            <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: cfg.color, letterSpacing: '0.04em' }}>
              {cfg.label}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', flexShrink: 0 }}>
          <span style={{ fontSize: '0.5625rem', fontWeight: 500, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Exposure</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', fontFamily: 'monospace' }}>{formatINR(card.financial_exposure_inr)}</span>
        </div>
      </div>

      <div style={{ height: '1px', background: '#F1F5F9', margin: '4px 0' }} />

      {/* Card Body */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', flex: 1 }}>
        <div>
          <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '4px' }}>
            Recommended Action
            <AiBadge mode={card.generation_mode} />
          </span>
          {card.title ? (
            <p style={{ fontSize: '0.8125rem', color: '#334155', lineHeight: 1.5, margin: 0, fontWeight: 500 }}>
              {card.title}
            </p>
          ) : (
            <p style={{ fontSize: '0.8125rem', color: '#94A3B8', lineHeight: 1.5, margin: 0, fontStyle: 'italic' }}>
              {card.ai_error ? 'AI analysis unavailable — check AWS Bedrock connectivity' : 'Awaiting AI analysis'}
            </p>
          )}
        </div>

        {/* Threat Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: 'auto' }}>
          <div style={{ background: '#F8FAFC', padding: '10px', borderRadius: '6px', border: '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.5625rem', fontWeight: 600, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Risk Score</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{likelihood}%</div>
          </div>
          <div style={{ background: urgent ? 'rgba(239, 68, 68, 0.05)' : '#F8FAFC', padding: '10px', borderRadius: '6px', border: urgent ? '1px solid rgba(239, 68, 68, 0.12)' : '1px solid #E2E8F0' }}>
            <div style={{ fontSize: '0.5625rem', fontWeight: 600, color: urgent ? '#EF4444' : '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> Est. Stockout
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: urgent ? '#EF4444' : '#0F172A' }}>
              {card.days_to_stockout} Days
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <button
        onClick={() => navigate(`/risks/${risk.supplier_id}`)}
        className="execute-btn"
      >
        Review & Execute <ArrowRight size={12} />
      </button>
    </div>
  )
}

/* ── Audit Log Row (Resolved) ────────────────────────────────────────── */
function ResolvedRow({ risk, card, resolvedCardId }: {
  risk: SupplierRiskAnalysis
  card: IntelligentActionCard
  resolvedCardId: string | null
}) {
  const navigate = useNavigate()
  return (
    <div
      onClick={() => navigate(resolvedCardId ? `/activity/${resolvedCardId}` : `/risks/${risk.supplier_id}`)}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '16px 20px',
        background: '#FFF',
        border: '1px solid #E2E8F0',
        borderRadius: '12px',
        cursor: 'pointer',
        transition: 'all 200ms ease',
        boxShadow: '0 1px 3px rgba(0,0,0,0.02)'
      }}
      className="resolved-row-hover"
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
        <div style={{ width: '36px', height: '36px', borderRadius: '50%', background: '#ECFDF5', border: '1px solid #A7F3D0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={16} color="#059669" />
        </div>
        <div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A', marginBottom: '2px' }}>
            {risk.supplier_name}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>
            Mitigation successfully resolved
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', textAlign: 'right' }}>
        <div>
          <div style={{ fontSize: '0.625rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px' }}>Original Risk</div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#334155' }}>{(risk.overall_score * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div style={{ fontSize: '0.625rem', fontWeight: 800, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            <Banknote size={11} /> Exposure Mitigated
          </div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#059669', fontFamily: 'monospace' }}>
            {formatINR(card.financial_exposure_inr)}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ── Main Page ───────────────────────────────────────────────────────── */
type Filter = 'pending' | 'resolved'

export default function PendingActionsPage() {
  const navigate = useNavigate()
  const { data: actionData, isLoading: cardsLoading } = useActionCards()
  const { data: risks, isLoading: risksLoading } = useWeightedRiskAnalysis()
  const { data: procCards, isLoading: procLoading } = useProcurementCards()
  const [filter, setFilter] = useState<Filter>('pending')

  const isLoading = cardsLoading || risksLoading || procLoading

  const procCardMap = useMemo(
    () => new Map((procCards as IntelligentActionCard[] ?? []).map(c => [c.supplier_id, c])),
    [procCards]
  )

  const resolvedSupplierIds = useMemo(() => {
    const bySupplier = new Map<string, { resolved: number; total: number }>()
    for (const c of actionData?.action_cards ?? []) {
      if (!c.supplier_id) continue
      const entry = bySupplier.get(c.supplier_id) ?? { resolved: 0, total: 0 }
      entry.total++
      if (c.is_resolved) entry.resolved++
      bySupplier.set(c.supplier_id, entry)
    }
    return new Set(
      [...bySupplier.entries()]
        .filter(([, { resolved, total }]) => total > 0 && resolved === total)
        .map(([id]) => id)
    )
  }, [actionData])

  const resolvedCardIdMap = useMemo(() => {
    const m = new Map<string, string>()
    for (const c of actionData?.action_cards ?? []) {
      if (!c.supplier_id || !c.is_resolved) continue
      const existing = m.get(c.supplier_id)
      if (!existing || new Date(c.resolved_at ?? c.created_at) > new Date(
        (actionData!.action_cards.find(x => x.id === existing)?.resolved_at ?? '')
      )) {
        m.set(c.supplier_id, c.id)
      }
    }
    return m
  }, [actionData])

  const riskList = (risks as SupplierRiskAnalysis[] | undefined) ?? []

  const activeRisks = useMemo(() => riskList.filter(r => {
    if (resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = procCardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    return true
  }), [riskList, resolvedSupplierIds, procCardMap])

  const resolvedRisks = useMemo(() => riskList.filter(r => {
    if (!resolvedSupplierIds.has(r.supplier_id)) return false
    if (r.risk_level === 'low') return false
    const card = procCardMap.get(r.supplier_id)
    if (!card || card.financial_exposure_inr === 0) return false
    return true
  }), [riskList, resolvedSupplierIds, procCardMap])

  const sortedActive = useMemo(
    () => [...activeRisks].sort((a, b) =>
      (procCardMap.get(b.supplier_id)?.financial_exposure_inr ?? 0) -
      (procCardMap.get(a.supplier_id)?.financial_exposure_inr ?? 0)
    ),
    [activeRisks, procCardMap]
  )

  const totalExposure = useMemo(
    () => activeRisks.reduce((s, r) => s + (procCardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0), 0),
    [activeRisks, procCardMap]
  )
  const totalSaved = useMemo(
    () => resolvedRisks.reduce((s, r) => s + (procCardMap.get(r.supplier_id)?.financial_exposure_inr ?? 0), 0),
    [resolvedRisks, procCardMap]
  )

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .action-card {
          background: #FFFFFF;
          border: 1px solid #E2E8F0;
          border-radius: 12px;
          padding: 24px;
          display: flex;
          flex-direction: column;
          gap: 16px;
          transition: border-color 150ms ease, box-shadow 150ms ease, transform 150ms ease;
        }
        .action-card:hover {
          border-color: #CBD5E1;
          box-shadow: 0 4px 20px -2px rgba(15, 23, 42, 0.05);
          transform: translateY(-2px);
        }
        .execute-btn {
          width: 100%;
          padding: 10px 14px;
          background: #0F172A;
          color: #FFFFFF;
          border: none;
          border-radius: 6px;
          font-size: 0.8125rem;
          font-weight: 600;
          cursor: pointer;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          gap: 6px;
          transition: background 150ms ease, transform 100ms ease;
        }
        .execute-btn:hover {
          background: #334155 !important;
        }
        .execute-btn:active {
          transform: scale(0.98);
        }
        .resolved-row-hover {
          transition: all 150ms ease;
        }
        .resolved-row-hover:hover {
          border-color: #10B981 !important;
          box-shadow: 0 4px 12px rgba(16, 185, 129, 0.05) !important;
          transform: translateX(2px);
        }
        .tab-btn {
          transition: all 150ms ease;
        }
        .tab-btn:hover {
          color: #0F172A !important;
        }
      `}</style>

      {/* Header */}
      <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '16px' }}>
        <div style={{ 
          fontSize: '0.75rem', 
          color: '#64748B', 
          fontWeight: 500, 
          marginBottom: '8px',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <span 
            onClick={() => navigate('/')} 
            style={{ cursor: 'pointer', transition: 'color 150ms ease' }}
            onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
            onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
          >
            Dashboard
          </span>
          <span>/</span>
          <span style={{ color: '#0F172A', fontWeight: 700 }}>Pending Actions</span>
        </div>
        
        <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
          Action Center
        </h1>
        <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px', marginBottom: 0 }}>
          Review system-generated incident tickets and execute mitigation strategies.
        </p>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(239, 68, 68, 0.05)', border: '1px solid rgba(239, 68, 68, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingDown size={20} color="#EF4444" />
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: '2px' }}>Pending Exposure</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 750, color: '#0F172A', lineHeight: 1.1, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{formatINR(totalExposure)}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
              Across <span style={{ color: '#EF4444', fontWeight: 700 }}>{activeRisks.length}</span> active incidents
            </div>
          </div>
        </div>

        <div style={{ background: '#FFFFFF', borderRadius: '12px', border: '1px solid #E2E8F0', padding: '24px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '8px', background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={20} color="#10B981" />
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: '#64748B', marginBottom: '2px' }}>Capital Mitigated</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 750, color: '#0F172A', lineHeight: 1.1, fontFamily: 'monospace', letterSpacing: '-0.02em' }}>{formatINR(totalSaved)}</div>
            <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>
              Across <span style={{ color: '#10B981', fontWeight: 700 }}>{resolvedRisks.length}</span> resolved incidents
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E2E8F0', display: 'flex', gap: '24px' }}>
        {(['pending', 'resolved'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0 0 12px 0',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${filter === f ? '#0F172A' : 'transparent'}`,
              color: filter === f ? '#0F172A' : '#64748B',
              fontSize: '0.875rem',
              fontWeight: filter === f ? 800 : 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
            className="tab-btn"
          >
            {f === 'pending' ? 'Incident Tickets' : 'Mitigation Audit Log'}
            <span style={{ 
              background: filter === f ? '#0F172A' : '#F1F5F9', 
              color: filter === f ? '#FFF' : '#475569', 
              padding: '2px 8px', 
              borderRadius: '99px', 
              fontSize: '0.6875rem',
              fontWeight: 800
            }}>
              {f === 'pending' ? activeRisks.length : resolvedRisks.length}
            </span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#64748B', fontSize: '0.875rem', fontWeight: 500 }}>Loading Action Center...</div>
      ) : filter === 'pending' ? (
        sortedActive.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px dashed #E2E8F0' }}>
            <ShieldCheck size={40} color="#059669" style={{ margin: '0 auto 12px', opacity: 0.8 }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>All Clear</h3>
            <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: 0, fontWeight: 500 }}>No pending incidents require your attention at this time.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '20px' }}>
            {sortedActive.map(r => (
              <ActionCard key={r.supplier_id} risk={r} card={procCardMap.get(r.supplier_id)!} />
            ))}
          </div>
        )
      ) : (
        resolvedRisks.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', background: '#FFFFFF', borderRadius: '16px', border: '1px dashed #E2E8F0' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', margin: '0 0 6px 0' }}>No Audit History</h3>
            <p style={{ fontSize: '0.8125rem', color: '#64748B', margin: 0, fontWeight: 500 }}>There are no resolved mitigations on record yet.</p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {resolvedRisks.map(r => (
              <ResolvedRow
                key={r.supplier_id}
                risk={r}
                card={procCardMap.get(r.supplier_id)!}
                resolvedCardId={resolvedCardIdMap.get(r.supplier_id) ?? null}
              />
            ))}
          </div>
        )
      )}
    </div>
  )
}
