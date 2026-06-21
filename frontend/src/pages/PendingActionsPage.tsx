import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActionCards, useWeightedRiskAnalysis, useProcurementCards } from '../hooks/useQueries'
import {
  ShieldAlert, CheckCircle2, ArrowRight, TrendingDown, ShieldCheck,
  AlertOctagon, Zap, Clock, Banknote
} from 'lucide-react'
import type { SupplierRiskAnalysis, IntelligentActionCard } from '../types'

/* ── Formatting ──────────────────────────────────────────────────────── */
function formatINR(v: number) {
  if (v >= 1_00_00_000) return `₹${(v / 1_00_00_000).toFixed(1)}Cr`
  if (v >= 1_00_000) return `₹${(v / 1_00_000).toFixed(1)}L`
  if (v >= 1_000) return `₹${(v / 1_000).toFixed(0)}K`
  return `₹${v}`
}

const LEVEL_CONFIG = {
  critical: { color: '#DC2626', bg: '#FEF2F2', border: '#FECACA', label: 'CRITICAL', icon: AlertOctagon },
  high:     { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', label: 'HIGH', icon: ShieldAlert },
  medium:   { color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', label: 'MEDIUM', icon: ShieldAlert },
  low:      { color: '#059669', bg: '#F0FDF4', border: '#BBF7D0', label: 'LOW', icon: ShieldCheck },
} as const

/* ── Intelligent Action Card (Pending) ───────────────────────────────── */
function ActionCard({ risk, card }: { risk: SupplierRiskAnalysis; card: IntelligentActionCard }) {
  const navigate = useNavigate()
  const cfg = LEVEL_CONFIG[risk.risk_level] ?? LEVEL_CONFIG.low
  const Icon = cfg.icon
  const urgent = card.days_to_stockout <= 7
  const likelihood = (risk.overall_score * 100).toFixed(0)

  return (
    <div
      style={{
        background: '#FFF',
        border: '1px solid #E5E7EB',
        borderRadius: '12px',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05)',
        transition: 'transform 0.2s ease, box-shadow 0.2s ease',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.transform = 'translateY(-2px)'
        e.currentTarget.style.boxShadow = '0 8px 12px -3px rgba(0,0,0,0.08)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.transform = 'translateY(0)'
        e.currentTarget.style.boxShadow = '0 2px 4px -1px rgba(0,0,0,0.05)'
      }}
    >
      {/* Card Header */}
      <div style={{ background: cfg.bg, padding: '12px 16px', borderBottom: `1px solid ${cfg.border}`, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '2px' }}>
            <Icon size={14} color={cfg.color} />
            <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: cfg.color, letterSpacing: '0.05em' }}>
              {cfg.label} RISK
            </span>
          </div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, color: '#111827', margin: 0 }}>
            {risk.supplier_name}
          </h3>
        </div>
        <div style={{ background: '#FFF', padding: '4px 10px', borderRadius: '6px', border: '1px solid #E5E7EB', display: 'flex', flexDirection: 'column', alignItems: 'flex-end' }}>
          <span style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>Exposure</span>
          <span style={{ fontSize: '0.875rem', fontWeight: 800, color: '#111827', fontFamily: 'monospace' }}>{formatINR(card.financial_exposure_inr)}</span>
        </div>
      </div>

      {/* Card Body */}
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '16px', flex: 1 }}>
        <div>
          <h4 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#374151', margin: '0 0 4px 0', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <Zap size={12} color="#3B82F6" /> Recommended Action
          </h4>
          <p style={{ fontSize: '0.8125rem', color: '#4B5563', lineHeight: 1.4, margin: 0 }}>
            {card.title || "Review supplier risk profile and formulate mitigation strategy."}
          </p>
        </div>

        {/* Threat Metrics */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', background: '#F9FAFB', padding: '10px', borderRadius: '8px', border: '1px solid #F3F4F6', marginTop: 'auto' }}>
          <div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>Risk Score</div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#111827' }}>{likelihood}%</div>
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, color: urgent ? '#DC2626' : '#6B7280', textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Clock size={10} /> Time to Stockout
            </div>
            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: urgent ? '#DC2626' : '#111827' }}>
              {card.days_to_stockout} Days
            </div>
          </div>
        </div>
      </div>

      {/* Action Footer */}
      <div style={{ padding: '12px 16px', borderTop: '1px solid #E5E7EB', background: '#FAFAFA' }}>
        <button
          onClick={() => navigate(`/risks/${risk.supplier_id}`)}
          style={{
            width: '100%',
            padding: '8px',
            background: '#111827',
            color: '#F9FAFB',
            border: 'none',
            borderRadius: '6px',
            fontSize: '0.8125rem',
            fontWeight: 600,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            transition: 'background 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#374151'}
          onMouseLeave={e => e.currentTarget.style.background = '#111827'}
        >
          Review & Execute <ArrowRight size={14} />
        </button>
      </div>
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
        padding: '12px 16px',
        background: '#FFF',
        border: '1px solid #E5E7EB',
        borderRadius: '8px',
        cursor: 'pointer',
        transition: 'all 0.2s ease',
        boxShadow: '0 1px 2px rgba(0,0,0,0.02)'
      }}
      onMouseEnter={e => {
        e.currentTarget.style.borderColor = '#10B981'
        e.currentTarget.style.boxShadow = '0 2px 8px rgba(16, 185, 129, 0.1)'
      }}
      onMouseLeave={e => {
        e.currentTarget.style.borderColor = '#E5E7EB'
        e.currentTarget.style.boxShadow = '0 1px 2px rgba(0,0,0,0.02)'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <div style={{ width: '32px', height: '32px', borderRadius: '50%', background: '#D1FAE5', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <CheckCircle2 size={16} color="#10B981" />
        </div>
        <div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 600, color: '#111827', marginBottom: '2px' }}>
            {risk.supplier_name}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#6B7280' }}>
            Action successfully mitigated
          </div>
        </div>
      </div>
      
      <div style={{ display: 'flex', alignItems: 'center', gap: '24px', textAlign: 'right' }}>
        <div>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: '2px' }}>Original Risk</div>
          <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>{(risk.overall_score * 100).toFixed(0)}%</div>
        </div>
        <div>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#10B981', textTransform: 'uppercase', marginBottom: '2px', display: 'flex', alignItems: 'center', gap: '4px', justifyContent: 'flex-end' }}>
            <Banknote size={10} /> Exposure Mitigated
          </div>
          <div style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#10B981', fontFamily: 'monospace' }}>
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
  const { data: actionData, isLoading: cardsLoading } = useActionCards()
  const { data: risks, isLoading: risksLoading } = useWeightedRiskAnalysis()
  const { data: procCards, isLoading: procLoading } = useProcurementCards()
  const [filter, setFilter] = useState<Filter>('pending')

  const isLoading = cardsLoading || risksLoading || procLoading

  // syncRisks is handled centrally in DashboardLayout via useEffect

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
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', paddingBottom: '32px' }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#111827', margin: '0 0 4px 0' }}>Action Center</h1>
        <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0 }}>Review system-generated incident tickets and execute mitigation strategies.</p>
      </div>

      {/* Summary KPI Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
        <div style={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#FEF2F2', border: '1px solid #FECACA', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <TrendingDown size={24} color="#DC2626" />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '2px' }}>Pending Exposure</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#DC2626', lineHeight: 1, fontFamily: 'monospace' }}>{formatINR(totalExposure)}</div>
            <div style={{ fontSize: '0.75rem', color: '#DC2626', marginTop: '4px', fontWeight: 600 }}>
              Across {activeRisks.length} active incidents
            </div>
          </div>
        </div>

        <div style={{ background: '#FFF', borderRadius: '12px', border: '1px solid #E5E7EB', padding: '16px', display: 'flex', alignItems: 'center', gap: '16px', boxShadow: '0 2px 4px -1px rgba(0,0,0,0.05)' }}>
          <div style={{ width: '48px', height: '48px', borderRadius: '10px', background: '#F0FDF4', border: '1px solid #BBF7D0', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <ShieldCheck size={24} color="#10B981" />
          </div>
          <div>
            <div style={{ fontSize: '0.6875rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: '#6B7280', marginBottom: '2px' }}>Capital Mitigated</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#10B981', lineHeight: 1, fontFamily: 'monospace' }}>{formatINR(totalSaved)}</div>
            <div style={{ fontSize: '0.75rem', color: '#10B981', marginTop: '4px', fontWeight: 600 }}>
              Across {resolvedRisks.length} resolved incidents
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ borderBottom: '1px solid #E5E7EB', display: 'flex', gap: '24px' }}>
        {(['pending', 'resolved'] as Filter[]).map(f => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            style={{
              padding: '0 0 10px 0',
              background: 'none',
              border: 'none',
              borderBottom: `2px solid ${filter === f ? '#2563EB' : 'transparent'}`,
              color: filter === f ? '#111827' : '#6B7280',
              fontSize: '0.875rem',
              fontWeight: filter === f ? 700 : 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            {f === 'pending' ? 'Incident Tickets' : 'Mitigation Audit Log'}
            <span style={{ 
              background: filter === f ? '#2563EB' : '#F3F4F6', 
              color: filter === f ? '#FFF' : '#4B5563', 
              padding: '2px 8px', 
              borderRadius: '99px', 
              fontSize: '0.6875rem',
              fontWeight: 700
            }}>
              {f === 'pending' ? activeRisks.length : resolvedRisks.length}
            </span>
          </button>
        ))}
      </div>

      {/* Content Area */}
      {isLoading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: '#9CA3AF' }}>Loading Action Center...</div>
      ) : filter === 'pending' ? (
        sortedActive.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', background: '#F9FAFB', borderRadius: '12px', border: '1px dashed #D1D5DB' }}>
            <ShieldCheck size={40} color="#10B981" style={{ margin: '0 auto 12px' }} />
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>All Clear</h3>
            <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0 }}>No pending incidents require your attention at this time.</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '16px' }}>
            {sortedActive.map(r => (
              <ActionCard key={r.supplier_id} risk={r} card={procCardMap.get(r.supplier_id)!} />
            ))}
          </div>
        )
      ) : (
        resolvedRisks.length === 0 ? (
          <div style={{ padding: '60px', textAlign: 'center', background: '#F9FAFB', borderRadius: '12px', border: '1px dashed #D1D5DB' }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#111827', margin: '0 0 6px 0' }}>No Audit History</h3>
            <p style={{ fontSize: '0.8125rem', color: '#6B7280', margin: 0 }}>There are no resolved mitigations on record yet.</p>
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
