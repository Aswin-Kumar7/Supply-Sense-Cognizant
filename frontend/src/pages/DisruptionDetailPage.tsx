import { useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useDisruptions, useActionCards } from '../hooks/useQueries'
import {
  ArrowRight, MapPin, Package, Calendar,
  CheckCircle2, AlertTriangle, Wind, Info, Shield, Activity
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
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', padding: '24px' }}>
        <div className="skeleton" style={{ height: 40, width: 200, borderRadius: 6 }} />
        <div className="skeleton" style={{ height: 120, borderRadius: 10 }} />
        <div className="skeleton" style={{ height: 200, borderRadius: 10 }} />
      </div>
    )
  }

  if (!disruption) {
    return (
      <div style={{ padding: '48px', textAlign: 'center', color: '#64748B', fontFamily: "'Inter', sans-serif" }}>
        <div style={{ fontSize: '0.9375rem', fontWeight: 700, marginBottom: '8px', color: '#0F172A' }}>Disruption not found</div>
        <button onClick={() => navigate('/disruptions')} style={{ fontSize: '0.8125rem', color: '#4F46E5', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
          ← Back to alerts
        </button>
      </div>
    )
  }

  const color = SEVERITY_COLOR[disruption.severity] ?? '#2563EB'
  const typeKey = (disruption.disruption_type || '').toLowerCase().replace(/_/g, '_')
  const icon = TYPE_ICON[typeKey] ?? <Wind size={20} strokeWidth={1.5} />

  return (
    <div style={{ 
      display: 'flex', flexDirection: 'column', gap: '24px', 
      maxWidth: '1000px', margin: '0 auto', width: '100%',
      fontFamily: "'Inter', system-ui, -apple-system, sans-serif"
    }}>
      {/* Header */}
      <div style={{ borderBottom: '1px solid #E2E8F0', paddingBottom: '16px', display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
        <div>
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
            <span 
              onClick={() => navigate('/disruptions')} 
              style={{ cursor: 'pointer', transition: 'color 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Disruptions
            </span>
            <span>/</span>
            <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#0F172A', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: '300px' }}>
              {disruption.title}
            </span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
            Disruption Detail
          </h1>
        </div>
        <button 
          onClick={() => navigate('/disruptions')}
          style={{
            background: 'none', border: '1px solid #E2E8F0', borderRadius: '6px',
            padding: '6px 12px', fontSize: '0.75rem', fontWeight: 600, color: '#64748B',
            cursor: 'pointer', transition: 'all 150ms ease'
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#CBD5E1'; e.currentTarget.style.color = '#0F172A' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#E2E8F0'; e.currentTarget.style.color = '#64748B' }}
        >
          Back to Alerts
        </button>
      </div>

      {/* Main Page Layout Wrapper */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>

        {/* Header card */}
        <div style={{
          background: '#FFF',
          border: `1px solid #E2E8F0`,
          borderLeft: `4px solid ${color}`,
          borderRadius: '16px',
          padding: '20px',
          boxShadow: '0 1px 3px rgba(0,0,0,0.02)',
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', gap: '16px' }}>
            {/* Icon */}
            <div style={{
              width: 44, height: 44, borderRadius: 10, flexShrink: 0,
              background: `${color}10`, border: `1px solid ${color}30`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color,
            }}>
              {icon}
            </div>

            {/* Title block */}
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '6px' }}>
                <span style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#0F172A', lineHeight: 1.3, letterSpacing: '-0.02em' }}>
                  {disruption.title}
                </span>
                <span style={{
                  fontSize: '0.5625rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: disruption.is_active ? '#FEF2F2' : '#ECFDF5',
                  color: disruption.is_active ? '#DC2626' : '#059669',
                  border: `1px solid ${disruption.is_active ? '#FCA5A5' : '#A7F3D0'}`,
                  letterSpacing: '0.06em',
                }}>
                  {disruption.is_active ? 'ACTIVE' : 'RESOLVED'}
                </span>
                <span style={{
                  fontSize: '0.5625rem', fontWeight: 800, padding: '2px 6px', borderRadius: 4,
                  background: `${color}10`, color, border: `1px solid ${color}30`,
                  letterSpacing: '0.06em', textTransform: 'uppercase',
                }}>
                  {disruption.severity}
                </span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: '#64748B', fontWeight: 550 }}>
                <span style={{ textTransform: 'capitalize' }}>{disruption.disruption_type.replace(/_/g, ' ')}</span>
                {disruption.region && <><span>·</span><span>{disruption.region}</span></>}
                <span>·</span>
                <span>{formatDisruptionDate(disruption.created_at)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Two Column Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 340px', gap: '24px', alignItems: 'start' }}>
          
          {/* Left Column: Details & Parameters */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Main Details Card */}
            {disruption.description && (
              <div style={{
                background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px',
                padding: '24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '14px' }}>
                  <Info size={14} style={{ color: '#64748B' }} />
                  <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                    Event Overview
                  </span>
                </div>
                <p style={{ margin: 0, fontSize: '0.875rem', color: '#334155', lineHeight: 1.6, fontWeight: 500 }}>
                  {disruption.description}
                </p>
              </div>
            )}

            {/* Parameters Grid */}
            <div style={{
              display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '12px',
            }}>
              {[
                { icon: <Activity size={16} strokeWidth={2} style={{ color: '#4F46E5' }} />, label: 'Disruption Type', value: disruption.disruption_type.charAt(0).toUpperCase() + disruption.disruption_type.slice(1).replace(/_/g, ' ') },
                { icon: <MapPin size={16} strokeWidth={2} style={{ color: '#3B82F6' }} />, label: 'Region', value: disruption.region || 'All Regions' },
                { icon: <Package size={16} strokeWidth={2} style={{ color: '#10B981' }} />, label: 'SKUs Affected', value: disruption.affected_skus_count > 0 ? `${disruption.affected_skus_count} SKU${disruption.affected_skus_count !== 1 ? 's' : ''}` : 'No direct SKU exposure' },
                { icon: <Calendar size={16} strokeWidth={2} style={{ color: '#F59E0B' }} />, label: 'Reported On', value: formatDisruptionDate(disruption.created_at) },
              ].map(({ icon: metaIcon, label, value }) => (
                <div key={label} style={{
                  background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px',
                  padding: '16px',
                  display: 'flex', alignItems: 'flex-start', gap: '12px',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.01)'
                }}>
                  <div style={{ background: '#F8FAFC', border: '1px solid #F1F5F9', width: '32px', height: '32px', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {metaIcon}
                  </div>
                  <div>
                    <div style={{ fontSize: '0.625rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>{label}</div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{value}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Read confirmation */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.75rem', color: '#059669', fontWeight: 600 }}>
              <CheckCircle2 size={14} />
              Marked as read
            </div>

          </div>

          {/* Right Column: Command Portal / Supplier Mitigation Context */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            
            {/* Main Info Card */}
            <div style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px',
              padding: '24px', boxShadow: '0 2px 8px rgba(0, 0, 0, 0.03)',
              display: 'flex', flexDirection: 'column', gap: '16px'
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.6875rem', fontWeight: 800, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  Impact Assessment
                </span>
                <span style={{
                  fontSize: '0.625rem', fontWeight: 800, background: `${color}10`, color, padding: '2px 8px', borderRadius: '4px', border: `1px solid ${color}20`
                }}>
                  {disruption.severity}
                </span>
              </div>
              
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                <span style={{ fontSize: '2.5rem', fontWeight: 850, color, fontFamily: 'monospace', letterSpacing: '-0.03em', lineHeight: 1 }}>
                  {(disruption.impact_score * 100).toFixed(0)}%
                </span>
                <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 600 }}>Severity Score</span>
              </div>

              <div style={{ height: '4px', background: '#F1F5F9', borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ width: `${disruption.impact_score * 100}%`, height: '100%', background: color }} />
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.75rem', color: disruption.is_active ? '#EF4444' : '#10B981', fontWeight: 600 }}>
                {disruption.is_active ? <AlertTriangle size={14} /> : <CheckCircle2 size={14} />}
                <span>{disruption.is_active ? 'Active — ongoing supply chain disruption' : 'Resolved event'}</span>
              </div>
            </div>

            {/* Supplier Link Integration */}
            {(() => {
              if (!disruption.supplier_id) {
                return (
                  <div style={{
                    background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '16px', padding: '20px',
                    display: 'flex', flexDirection: 'column', gap: '10px', textAlign: 'center', alignItems: 'center'
                  }}>
                    <Shield size={20} style={{ color: '#94A3B8' }} />
                    <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#475569' }}>No Direct Supplier Exposure</div>
                    <p style={{ fontSize: '0.75rem', color: '#64748B', margin: 0, lineHeight: 1.4 }}>
                      This alert has been filed as a regional event and does not directly link to any of your registered Tier-1 suppliers.
                    </p>
                  </div>
                )
              }

              const supplierCards = (actionData?.action_cards ?? []).filter((c: any) => c.supplier_id === disruption.supplier_id)
              const isResolved = supplierCards.length > 0 && supplierCards.every((c: any) => c.is_resolved)
              const resolvedCard = supplierCards
                .filter((c: any) => c.is_resolved)
                .sort((a: any, b: any) => new Date(b.resolved_at ?? b.created_at).getTime() - new Date(a.resolved_at ?? a.created_at).getTime())[0]

              if (isResolved && resolvedCard) {
                return (
                  <div style={{
                    background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '16px', padding: '20px',
                    display: 'flex', flexDirection: 'column', gap: '12px'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <CheckCircle2 size={18} color="#16A34A" />
                      <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#166534' }}>Mitigation Complete</span>
                    </div>
                    <p style={{ fontSize: '0.75rem', color: '#15803D', margin: 0, lineHeight: 1.4 }}>
                      Active procurement response actions for this supplier have been completed and verified.
                    </p>
                    <button
                      onClick={() => navigate(`/activity/${resolvedCard.id}`)}
                      style={{
                        display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                        padding: '8px 12px', background: '#16A34A', color: '#FFF',
                        border: 'none', borderRadius: '8px', fontSize: '0.75rem',
                        fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                        transition: 'background 150ms ease', marginTop: '4px'
                      }}
                      onMouseEnter={e => e.currentTarget.style.background = '#15803D'}
                      onMouseLeave={e => e.currentTarget.style.background = '#16A34A'}
                    >
                      View Resolution Audit <ArrowRight size={12} />
                    </button>
                  </div>
                )
              }

              return (
                <div style={{
                  background: '#0F172A', border: '1px solid #1E293B', borderRadius: '16px', padding: '20px',
                  display: 'flex', flexDirection: 'column', gap: '12px', color: '#FFFFFF'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <Shield size={18} style={{ color: '#38BDF8' }} />
                    <span style={{ fontSize: '0.8125rem', fontWeight: 800, color: '#F8FAFC' }}>Supplier Exposure</span>
                  </div>
                  <p style={{ fontSize: '0.75rem', color: '#94A3B8', margin: 0, lineHeight: 1.4 }}>
                    This disruption is linked to a tracked supplier. Launch mitigation workflows now to neutralize the exposure.
                  </p>
                  <button
                    onClick={() => navigate(`/risks/${disruption.supplier_id}`)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
                      padding: '8px 12px', background: '#38BDF8', color: '#0F172A',
                      border: 'none', borderRadius: '8px', fontSize: '0.75rem',
                      fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                      transition: 'background 150ms ease', marginTop: '4px'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = '#7DD3FC'}
                    onMouseLeave={e => e.currentTarget.style.background = '#38BDF8'}
                  >
                    Launch Response Suite <ArrowRight size={12} />
                  </button>
                </div>
              )
            })()}

          </div>

        </div>

      </div>
    </div>
  )
}
