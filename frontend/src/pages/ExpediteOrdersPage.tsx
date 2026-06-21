import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { Package, CheckCircle2, Phone, Clock, AlertTriangle, ArrowLeft, List } from 'lucide-react'
import { useStockoutForecast, useSuppliers } from '../hooks/useQueries'
import { queryKeys } from '../hooks/queryKeys'
import { api } from '../services/api'

function formatINR(n: number) {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

const CONTACT_METHODS = ['Phone call', 'Email', 'WhatsApp', 'In-person meeting', 'Video call']
const FREIGHT_METHODS = ['Air freight', 'Express courier', 'Priority truck lane', 'Same supplier — pushed to front of queue', 'Other']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #E2E8F0',
  borderRadius: 8, fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', color: '#0F172A', background: '#FFFFFF',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '0.6875rem', color: '#64748B', marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
      {children}
    </div>
  )
}

export default function ExpediteOrdersPage() {
  const { id: supplierId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: stockout } = useStockoutForecast()
  const { data: suppliersData } = useSuppliers()

  const [contactPerson, setContactPerson]     = useState('')
  const [contactPhone, setContactPhone]       = useState('')
  const [contactMethod, setContactMethod]     = useState('')
  const [originalETA, setOriginalETA]         = useState('')
  const [newETA, setNewETA]                   = useState('')
  const [freightMethod, setFreightMethod]     = useState('')
  const [rushCost, setRushCost]               = useState('')
  const [confirmationDate, setConfirmationDate] = useState('')
  const [followUpDate, setFollowUpDate]       = useState('')
  const [poReferences, setPoReferences]       = useState('')
  const [supplierRef, setSupplierRef]         = useState('')
  const [authorizedBy, setAuthorizedBy]       = useState('')
  const [note, setNote]                       = useState('')
  const [saving, setSaving]                   = useState(false)
  const [done, setDone]                       = useState(false)
  const [submitError, setSubmitError]         = useState('')

  const supplier = suppliersData?.suppliers.find(s => s.id === supplierId)
  const atRiskSKUs = (stockout?.forecasts ?? [])
    .filter(f => f.supplier_name === supplier?.name)
    .sort((a, b) => a.days_to_stockout - b.days_to_stockout)

  const mostUrgent = atRiskSKUs[0]

  // How many days are gained by the new ETA vs original
  const daysGained = newETA && originalETA
    ? Math.max(0, Math.round((new Date(originalETA).getTime() - new Date(newETA).getTime()) / 86_400_000))
    : null

  // ETA validation: new date should be before original
  const etaWarning = newETA && originalETA && new Date(newETA) >= new Date(originalETA)
    ? 'New delivery date is the same as or later than the original — this is not an expedite.'
    : null

  // Dirty-state warning when navigating away mid-form
  const isDirty = !!(contactPerson || contactMethod || newETA || freightMethod || rushCost || poReferences || note)
  useEffect(() => {
    if (!isDirty || done) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, done])

  const handleDone = useCallback(async () => {
    if (!supplierId) return
    // Required field guard
    if (!newETA) { setSubmitError('Please enter the new committed delivery date before saving.'); return }
    if (etaWarning) { setSubmitError(etaWarning); return }
    setSubmitError('')
    setSaving(true)

    const rushCostNum = parseFloat(rushCost) || 0
    const parts = [
      'Action taken: Expedite current orders',
      contactPerson.trim()   ? `Contact: ${contactPerson.trim()}`                         : null,
      contactPhone.trim()    ? `Contact phone: ${contactPhone.trim()}`                    : null,
      contactMethod          ? `Via: ${contactMethod}`                                    : null,
      originalETA            ? `Original ETA: ${originalETA}`                            : null,
      newETA                 ? `New ETA: ${newETA}`                                       : null,
      daysGained !== null && daysGained > 0 ? `Days gained: ${daysGained}`               : null,
      freightMethod          ? `Freight method: ${freightMethod}`                         : null,
      rushCostNum > 0        ? `Rush cost (₹): ${rushCostNum.toLocaleString('en-IN')}`   : null,
      poReferences.trim()    ? `PO references: ${poReferences.trim()}`                   : null,
      supplierRef.trim()     ? `Supplier ref: ${supplierRef.trim()}`                     : null,
      confirmationDate       ? `Confirmed on: ${confirmationDate}`                        : null,
      followUpDate           ? `Follow-up by: ${followUpDate}`                            : null,
      authorizedBy.trim()    ? `Authorized by: ${authorizedBy.trim()}`                   : null,
      note.trim()            || null,
    ].filter(Boolean)

    try {
      await api.resolveAllSupplierCards(supplierId, parts.join(' — '))
      // Invalidate every query that may reflect this resolution
      queryClient.invalidateQueries({ queryKey: queryKeys.actionCards })
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboard })
      queryClient.invalidateQueries({ queryKey: queryKeys.risk('all') })
      queryClient.invalidateQueries({ queryKey: queryKeys.procurement })
      queryClient.invalidateQueries({ queryKey: queryKeys.disruptions })
      queryClient.invalidateQueries({ queryKey: queryKeys.stockout })
      queryClient.invalidateQueries({ queryKey: queryKeys.executiveBrief })
      queryClient.invalidateQueries({ queryKey: queryKeys.financial })
      setDone(true)
    } catch {
      setSubmitError('Failed to save. Please try again.')
    } finally {
      setSaving(false)
    }
  }, [
    supplierId, contactPerson, contactPhone, contactMethod, originalETA, newETA,
    daysGained, freightMethod, rushCost, poReferences, supplierRef, confirmationDate,
    followUpDate, authorizedBy, note, etaWarning, queryClient,
  ])

  if (done) {
    return (
      <div style={{ maxWidth: 560, margin: '4rem auto', padding: '2.5rem', textAlign: 'center', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '16px', boxShadow: '0 4px 20px -2px rgba(15,23,42,0.05)', fontFamily: "'Inter', sans-serif" }}>
        <style>{`
          .btn-action-primary {
            background: #059669;
            color: #ffffff;
            border: none;
            padding: 0.75rem 1.5rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.875rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 8px;
            transition: all 120ms ease;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
          }
          .btn-action-primary:hover {
            background: #047857;
            box-shadow: 0 4px 12px rgba(4, 120, 87, 0.15);
          }
          .btn-action-primary:active {
            transform: scale(0.97);
          }
          .btn-action-primary:disabled {
            background: #A7F3D0;
            cursor: not-allowed;
          }

          .btn-secondary {
            background: #ffffff;
            color: #334155;
            border: 1px solid #E2E8F0;
            padding: 0.625rem 1.25rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.8125rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 120ms ease;
          }
          .btn-secondary:hover {
            background: #F8FAFC;
            border-color: #CBD5E1;
            color: #0F172A;
          }
          .btn-secondary:active {
            transform: scale(0.97);
          }

          .btn-dark {
            background: #0F172A;
            color: #ffffff;
            border: none;
            padding: 0.625rem 1.25rem;
            border-radius: 8px;
            font-weight: 600;
            font-size: 0.8125rem;
            cursor: pointer;
            display: flex;
            align-items: center;
            gap: 6px;
            transition: all 120ms ease;
            box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
          }
          .btn-dark:hover {
            background: #1E293B;
            box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
          }
          .btn-dark:active {
            transform: scale(0.97);
          }
        `}</style>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <CheckCircle2 size={32} color="#16a34a" />
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Expedite order logged</div>
        <div style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '2rem', lineHeight: 1.6, fontWeight: 500 }}>
          All details saved to the activity log. The supplier has been removed from the active risk queue.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/activity')} className="btn-dark">
            <List size={14} /> View Activity Log
          </button>
          <button onClick={() => navigate('/risks')} className="btn-secondary">
            <ArrowLeft size={14} /> Back to Risks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%', display: 'flex', flexDirection: 'column', gap: '24px', fontFamily: "'Inter', sans-serif" }}>
      <style>{`
        .btn-action-primary {
          background: #059669;
          color: #ffffff;
          border: none;
          padding: 0.75rem 1.5rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.875rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 8px;
          transition: all 120ms ease;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .btn-action-primary:hover {
          background: #047857;
          box-shadow: 0 4px 12px rgba(4, 120, 87, 0.15);
        }
        .btn-action-primary:active {
          transform: scale(0.97);
        }
        .btn-action-primary:disabled {
          background: #A7F3D0;
          cursor: not-allowed;
        }

        .btn-secondary {
          background: #ffffff;
          color: #334155;
          border: 1px solid #E2E8F0;
          padding: 0.625rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.8125rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 120ms ease;
        }
        .btn-secondary:hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
          color: #0F172A;
        }
        .btn-secondary:active {
          transform: scale(0.97);
        }

        .btn-dark {
          background: #0F172A;
          color: #ffffff;
          border: none;
          padding: 0.625rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.8125rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 120ms ease;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .btn-dark:hover {
          background: #1E293B;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
        }
        .btn-dark:active {
          transform: scale(0.97);
        }
      `}</style>

      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px', marginBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span 
              onClick={() => {
                if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
                navigate('/risks')
              }}
              style={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Risks
            </span>
            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>/</span>
            <span 
              onClick={() => {
                if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
                navigate(-1)
              }}
              style={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Recovery Options
            </span>
            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>/</span>
            <span style={{ color: '#0F172A', fontSize: '0.75rem', fontWeight: 700 }}>Expedite Orders</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
            Expedite Current Orders
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px', marginBottom: 0 }}>
            Rush existing in-progress orders to close the gap before stockout for <strong>{supplier?.name ?? '—'}</strong>
          </p>
        </div>
        {mostUrgent && (
          <div style={{ 
            padding: '8px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', textAlign: 'right'
          }}>
            <div style={{ fontSize: '0.625rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Most Urgent</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: mostUrgent.days_to_stockout <= 3 ? '#EF4444' : '#F59E0B', fontFamily: 'monospace', lineHeight: 1 }}>{mostUrgent.days_to_stockout}d</div>
            <div style={{ fontSize: '0.6875rem', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>until first stockout</div>
          </div>
        )}
      </div>

      {/* What this means */}
      <div style={{ background: '#FFFBEB', border: '1px solid rgba(217, 119, 6, 0.12)', borderRadius: '12px', padding: '16px 20px', display: 'flex', gap: '0.875rem' }}>
        <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#92400E', marginBottom: 4 }}>What expediting means</div>
          <p style={{ fontSize: '0.8125rem', color: '#78350F', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
            You already have open purchase orders with <strong>{supplier?.name}</strong>. This asks the supplier to deliver those orders faster than scheduled — typically by paying a rush fee or upgrading freight. This does <em>not</em> place a new order; it accelerates what is already in transit or production.
          </p>
        </div>
      </div>

      {/* At-risk SKUs */}
      {atRiskSKUs.length > 0 && (
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
          <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
            <Package size={16} color="#EF4444" />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>Products that need to arrive faster</span>
          </div>
          <div style={{ padding: '0.75rem 1rem 0.5rem', display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1.2fr 1.5fr', gap: '0 1rem', borderBottom: '1px solid #F1F5F9' }}>
            {['Product', 'Stock left', 'Daily use', 'Stockout in', 'Revenue at risk'].map(h => (
              <div key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
            ))}
          </div>
          {atRiskSKUs.map(sku => (
            <div key={sku.sku_id} style={{ padding: '0.875rem 1rem', display: 'grid', gridTemplateColumns: '2.5fr 1.2fr 1.2fr 1.2fr 1.5fr', gap: '0 1rem', alignItems: 'center', borderBottom: '1px solid #F1F5F9' }}>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{sku.sku_name}</div>
                <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2, fontWeight: 500 }}>{sku.sku_code}</div>
              </div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#334155' }}>{sku.current_stock.toLocaleString()}</div>
              <div style={{ fontSize: '0.875rem', color: '#334155' }}>{Math.round(sku.adjusted_demand)}/day</div>
              <div style={{ fontSize: '0.875rem', fontWeight: 700, color: sku.days_to_stockout <= 3 ? '#EF4444' : sku.days_to_stockout <= 7 ? '#F59E0B' : '#334155' }}>
                {sku.days_to_stockout}d
              </div>
              <div style={{ fontSize: '0.875rem', color: '#0F172A', fontWeight: 700, fontFamily: 'monospace' }}>{formatINR(sku.revenue_at_risk_inr)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coverage gained indicator */}
      {daysGained !== null && daysGained > 0 && (
        <div style={{ background: '#F0FDF4', border: '1px solid rgba(16, 185, 129, 0.15)', borderRadius: '8px', padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={16} color="#10B981" />
          <span style={{ fontSize: '0.8125rem', color: '#166534', fontWeight: 600 }}>
            By moving delivery from {originalETA} to {newETA}, you gain <strong>{daysGained} additional days</strong> of coverage.
          </span>
        </div>
      )}
      {etaWarning && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '0.625rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#EF4444" />
          <span style={{ fontSize: '0.75rem', color: '#EF4444', fontWeight: 600 }}>{etaWarning}</span>
        </div>
      )}

      {/* Log form */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={16} color="#475569" />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>Log the Action Taken</span>
          <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500, marginLeft: 4 }}>— saved to activity log for audit trail</span>
        </div>
        <div style={{ padding: '1.25rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>

          {/* Contact info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
            <Field label="Contact person at supplier">
              <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="e.g. Rajesh Kumar, Supply Head" style={inputStyle} />
            </Field>
            <Field label="Phone / Email of contact" hint="Direct line used to expedite">
              <input value={contactPhone} onChange={e => setContactPhone(e.target.value)} placeholder="e.g. +91 98765 43210" style={inputStyle} />
            </Field>
            <Field label="Contact method">
              <select value={contactMethod} onChange={e => setContactMethod(e.target.value)} style={inputStyle}>
                <option value="">Select method…</option>
                {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
          </div>

          {/* Delivery dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <Field label="Original scheduled delivery date">
              <input type="date" value={originalETA} onChange={e => setOriginalETA(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="New committed delivery date" required hint="Must be earlier than the original date">
              <input
                type="date"
                value={newETA}
                onChange={e => setNewETA(e.target.value)}
                style={{ ...inputStyle, borderColor: etaWarning ? '#EF4444' : newETA ? '#10B981' : '#E2E8F0' }}
              />
            </Field>
          </div>

          {/* Freight + cost */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <Field label="Freight/delivery method upgraded to">
              <select value={freightMethod} onChange={e => setFreightMethod(e.target.value)} style={inputStyle}>
                <option value="">Select method…</option>
                {FREIGHT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Rush / priority fee paid (₹)" hint="Enter the amount in Rupees">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: '#64748B', fontWeight: 600 }}>₹</span>
                <input
                  type="number"
                  min={0}
                  value={rushCost}
                  onChange={e => setRushCost(e.target.value)}
                  placeholder="0"
                  style={{ ...inputStyle, paddingLeft: '1.75rem' }}
                />
              </div>
            </Field>
          </div>

          {/* PO + Supplier ref */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
            <Field label="PO / order reference numbers" hint="Comma-separated if multiple">
              <input value={poReferences} onChange={e => setPoReferences(e.target.value)} placeholder="e.g. PO-2024-8812, PO-2024-8813" style={inputStyle} />
            </Field>
            <Field label="Supplier confirmation reference" hint="Email ref, ticket #, WhatsApp message ID">
              <input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="e.g. Email ref #84921 from supplier" style={inputStyle} />
            </Field>
          </div>

          {/* Confirmation date + Follow-up */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1.25rem' }}>
            <Field label="Confirmation date" hint="When did the supplier confirm?">
              <input type="date" value={confirmationDate} onChange={e => setConfirmationDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Follow-up due by" hint="If goods not received by this date, escalate">
              <input type="date" value={followUpDate} onChange={e => setFollowUpDate(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="Authorized / approved by">
              <input value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} placeholder="e.g. Priya Sharma, Procurement Manager" style={inputStyle} />
            </Field>
          </div>

          <Field label="Additional notes / follow-up actions">
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Warehouse team notified to keep receiving dock clear on Thursday. Follow up if goods not received by 6pm." rows={3} style={{ ...inputStyle, resize: 'none' }} />
          </Field>
        </div>
      </div>

      {/* Submit */}
      {submitError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FCA5A5', borderRadius: 8, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color="#EF4444" />
          <span style={{ fontSize: '0.8125rem', color: '#EF4444', fontWeight: 600 }}>{submitError}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginTop: '8px' }}>
        <button onClick={handleDone} disabled={saving} className="btn-action-primary">
          <CheckCircle2 size={18} />
          {saving ? 'Saving…' : 'Confirm & Mark as Done'}
        </button>
        <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>This will remove the supplier from the active risk queue</span>
      </div>
    </div>
  )
}
