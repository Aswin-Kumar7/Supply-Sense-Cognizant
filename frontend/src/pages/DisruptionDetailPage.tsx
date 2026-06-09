import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDisruptions, useActionCards } from '../hooks/useQueries'
import {
  ArrowLeft, ArrowRight, MapPin, Package, Calendar, BarChart2,
  CheckCircle2, AlertTriangle,
} from 'lucide-react'
import {
  getReadIds, persistReadIds,
  SEVERITY_COLOR, TYPE_ICON, formatDisruptionDate,
} from './DisruptionsPage'

export default function DisruptionDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data, isLoading } = useDisruptions()
  const { data: actionData } = useActionCards()

  const disruption = (data?.disruptions ?? []).find(d => d.id === id)

  // Mark as read on mount
  useEffect(() => {
    if (!id) return
    const ids = getReadIds()
    if (!ids.has(id)) {
      ids.add(id)
      persistReadIds(ids)
    }
  }, [id])

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
        <div className="skeleton" style={{ height: 40, width: 200, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />
      </div>
    )
  }

  if (!disruption) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)' }}>
        <div style={{ fontSize: '0.9375rem', fontWeight: 600, marginBottom: '0.5rem' }}>Disruption not found</div>
        <button onClick={() => navigate('/disruptions')} style={{ fontSize: '0.8125rem', color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer' }}>
          ← Back to alerts
        </button>
      </div>
    )
  }

  const color = SEVERITY_COLOR[disruption.severity] ?? '#2563EB'
  const icon = TYPE_ICON[disruption.disruption_type]

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: 760 }}>

      {/* Breadcrumb / back */}
      <button
        onClick={() => navigate('/disruptions')}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: '0.375rem',
          background: 'none', border: 'none', cursor: 'pointer',
          fontSize: '0.8125rem', fontWeight: 500, color: 'var(--ink-3)',
          fontFamily: 'inherit', padding: 0,
        }}
      >
        <ArrowLeft size={15} />
        Back to Disruption Alerts
      </button>

      {/* Header card */}
      <div style={{
        background: '#fff',
        border: `1px solid var(--border)`,
        borderLeft: `4px solid ${color}`,
        borderRadius: '0.75rem',
        padding: '1.25rem 1.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '1rem' }}>
          {/* Icon */}
          <div style={{
            width: 44, height: 44, borderRadius: 10, flexShrink: 0,
            background: `${color}15`, border: `1px solid ${color}40`,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            color,
          }}>
            {icon}
          </div>

          {/* Title block */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', flexWrap: 'wrap', marginBottom: '0.375rem' }}>
              <span style={{ fontSize: '1.0625rem', fontWeight: 700, color: '#000', lineHeight: 1.3 }}>
                {disruption.title}
              </span>
              <span style={{
                fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: disruption.is_active ? '#FEF2F2' : '#F0FDF4',
                color: disruption.is_active ? '#DC2626' : '#16a34a',
                border: `1px solid ${disruption.is_active ? '#FECACA' : '#BBF7D0'}`,
                letterSpacing: '0.06em',
              }}>
                {disruption.is_active ? 'ACTIVE' : 'RESOLVED'}
              </span>
              <span style={{
                fontSize: '0.5rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                background: `${color}15`, color, border: `1px solid ${color}40`,
                letterSpacing: '0.06em', textTransform: 'uppercase',
              }}>
                {disruption.severity}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', fontSize: '0.6875rem', color: 'var(--ink-4)' }}>
              <span style={{ textTransform: 'capitalize' }}>{disruption.disruption_type}</span>
              {disruption.region && <><span>·</span><span>{disruption.region}</span></>}
              <span>·</span>
              <span>{formatDisruptionDate(disruption.created_at)}</span>
            </div>
          </div>

          {/* Impact score */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <div style={{ fontSize: '0.45rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Impact</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color, fontFamily: 'monospace', lineHeight: 1 }}>
              {(disruption.impact_score * 100).toFixed(0)}%
            </div>
          </div>
        </div>
      </div>

      {/* Description */}
      {disruption.description && (
        <div style={{
          background: '#fff', border: '1px solid var(--border)', borderRadius: '0.75rem',
          padding: '1.25rem 1.5rem',
        }}>
          <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.625rem' }}>
            Event Details
          </div>
          <p style={{ margin: 0, fontSize: '0.9375rem', color: 'var(--ink-1)', lineHeight: 1.75 }}>
            {disruption.description}
          </p>
        </div>
      )}

      {/* Metadata grid */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem',
      }}>
        {[
          { icon: <BarChart2 size={15} />, label: 'Disruption Type', value: disruption.disruption_type.charAt(0).toUpperCase() + disruption.disruption_type.slice(1) },
          { icon: <MapPin size={15} />, label: 'Region', value: disruption.region || 'Not specified' },
          { icon: <Package size={15} />, label: 'SKUs Affected', value: disruption.affected_skus_count > 0 ? `${disruption.affected_skus_count} SKU${disruption.affected_skus_count !== 1 ? 's' : ''}` : 'Unknown' },
          { icon: <Calendar size={15} />, label: 'Reported On', value: formatDisruptionDate(disruption.created_at) },
          { icon: <BarChart2 size={15} />, label: 'Impact Score', value: `${(disruption.impact_score * 100).toFixed(0)}%` },
          {
            icon: disruption.is_active ? <AlertTriangle size={15} /> : <CheckCircle2 size={15} />,
            label: 'Status',
            value: disruption.is_active ? 'Active — ongoing event' : 'Resolved',
          },
        ].map(({ icon: metaIcon, label, value }) => (
          <div key={label} style={{
            background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem',
            padding: '0.875rem 1rem',
            display: 'flex', alignItems: 'flex-start', gap: '0.625rem',
          }}>
            <div style={{ color: 'var(--ink-4)', marginTop: 1, flexShrink: 0 }}>{metaIcon}</div>
            <div>
              <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>{label}</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{value}</div>
            </div>
          </div>
        ))}
      </div>

      {/* CTA — only for disruptions with a linked supplier */}
      {disruption.supplier_id && (() => {
        const supplierCards = (actionData?.action_cards ?? []).filter((c: any) => c.supplier_id === disruption.supplier_id)
        const isResolved = supplierCards.length > 0 && supplierCards.every((c: any) => c.is_resolved)
        const resolvedCard = supplierCards
          .filter((c: any) => c.is_resolved)
          .sort((a: any, b: any) => new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime())[0]

        if (isResolved && resolvedCard) {
          return (
            <div style={{
              background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.75rem', padding: '1.25rem 1.5rem',
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <CheckCircle2 size={20} color="#16a34a" />
                <div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#166534', marginBottom: '0.25rem' }}>
                    Supplier risk has been resolved
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#16a34a' }}>
                    Action was taken and the issue is closed
                  </div>
                </div>
              </div>
              <button
                onClick={() => navigate(`/activity/${resolvedCard.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: '0.5rem',
                  padding: '0.625rem 1.125rem',
                  background: '#000', color: '#fff',
                  border: 'none', borderRadius: '8px',
                  fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                  fontFamily: 'inherit', flexShrink: 0,
                }}
              >
                View Resolution Summary
                <ArrowRight size={14} />
              </button>
            </div>
          )
        }

        return (
          <div style={{
            background: '#000', borderRadius: '0.75rem', padding: '1.25rem 1.5rem',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#fff', marginBottom: '0.25rem' }}>
                This disruption affects a tracked supplier
              </div>
              <div style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.6)' }}>
                View risk analysis and run mitigation simulations
              </div>
            </div>
            <button
              onClick={() => navigate(`/risks/${disruption.supplier_id}`)}
              style={{
                display: 'flex', alignItems: 'center', gap: '0.5rem',
                padding: '0.625rem 1.125rem',
                background: '#fff', color: '#000',
                border: 'none', borderRadius: '8px',
                fontSize: '0.8125rem', fontWeight: 700, cursor: 'pointer',
                fontFamily: 'inherit', flexShrink: 0,
              }}
            >
              View Supplier Risk
              <ArrowRight size={14} />
            </button>
          </div>
        )
      })()}

      {/* Read confirmation */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: '#16a34a', fontWeight: 500 }}>
        <CheckCircle2 size={14} />
        Marked as read
      </div>
    </div>
  )
}
