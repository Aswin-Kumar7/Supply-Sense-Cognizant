import { useState, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Zap, Package, CheckCircle2, Phone, Clock, AlertTriangle, ArrowLeft, List } from 'lucide-react'
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
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #D1D5DB',
  borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', color: '#111827', background: '#fff',
}

function Field({ label, required, hint, children }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode
}) {
  return (
    <div>
      <label style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '0.5625rem', color: '#6B7280', marginBottom: 4, lineHeight: 1.4 }}>{hint}</div>}
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
      <div style={{ maxWidth: 520, margin: '3rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <CheckCircle2 size={32} color="#16a34a" />
        </div>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', marginBottom: '0.5rem' }}>Expedite order logged</div>
        <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
          All details saved to the activity log. The supplier has been removed from the active risk queue.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => navigate('/activity')}
            style={{ padding: '0.625rem 1.25rem', background: '#000', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <List size={14} /> View Activity Log
          </button>
          <button
            onClick={() => navigate('/risks')}
            style={{ padding: '0.625rem 1.25rem', background: '#fff', color: '#000', border: '1px solid #D1D5DB', borderRadius: 8, fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <ArrowLeft size={14} /> Back to Risks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 720, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <button onClick={() => {
        if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
        navigate(-1)
      }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '0.8125rem', fontFamily: 'inherit', padding: '4px 0', width: 'fit-content' }}>
        <ChevronLeft size={14} /> Back to Recovery Options
      </button>

      {/* Header */}
      <div style={{ background: '#000', borderRadius: 12, padding: '1.25rem 1.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <Zap size={22} color="#D97706" />
            </div>
            <div>
              <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Expedite Current Orders</div>
              <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff' }}>{supplier?.name ?? '—'}</div>
              <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
                Rush existing in-progress orders to close the gap before stockout
              </div>
            </div>
          </div>
          {mostUrgent && (
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.45rem', fontWeight: 700, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Most Urgent</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: mostUrgent.days_to_stockout <= 3 ? '#FCA5A5' : '#FDE68A', fontFamily: 'monospace', lineHeight: 1 }}>{mostUrgent.days_to_stockout}d</div>
              <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>until first stockout</div>
            </div>
          )}
        </div>
      </div>

      {/* What this means */}
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem' }}>
        <AlertTriangle size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E', marginBottom: 4 }}>What expediting means</div>
          <p style={{ fontSize: '0.8125rem', color: '#78350F', lineHeight: 1.6, margin: 0 }}>
            You already have open purchase orders with <strong>{supplier?.name}</strong>. This asks the supplier to deliver those orders faster than scheduled — typically by paying a rush fee or upgrading freight. This does <em>not</em> place a new order; it accelerates what is already in transit or production.
          </p>
        </div>
      </div>

      {/* At-risk SKUs */}
      {atRiskSKUs.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
          <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Package size={14} color="#DC2626" />
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>Products that need to arrive faster</span>
          </div>
          <div style={{ padding: '0.375rem 1rem 0.25rem', display: 'grid', gridTemplateColumns: '2fr 80px 90px 90px 90px', gap: '0 0.75rem' }}>
            {['Product', 'Stock left', 'Daily use', 'Stockout in', 'Revenue at risk'].map(h => (
              <div key={h} style={{ fontSize: '0.4375rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: '0.375rem', borderBottom: '1px solid #F3F4F6' }}>{h}</div>
            ))}
          </div>
          {atRiskSKUs.map(sku => (
            <div key={sku.sku_id} style={{ padding: '0.5rem 1rem', display: 'grid', gridTemplateColumns: '2fr 80px 90px 90px 90px', gap: '0 0.75rem', alignItems: 'center', borderBottom: '1px solid #F9FAFB' }}>
              <div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>{sku.sku_name}</div>
                <div style={{ fontSize: '0.5rem', color: '#9CA3AF', marginTop: 1 }}>{sku.sku_code}</div>
              </div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#374151' }}>{sku.current_stock.toLocaleString()}</div>
              <div style={{ fontSize: '0.8125rem', color: '#374151' }}>{Math.round(sku.adjusted_demand)}/day</div>
              <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: sku.days_to_stockout <= 3 ? '#DC2626' : sku.days_to_stockout <= 7 ? '#D97706' : '#374151' }}>
                {sku.days_to_stockout}d
              </div>
              <div style={{ fontSize: '0.8125rem', color: '#374151' }}>{formatINR(sku.revenue_at_risk_inr)}</div>
            </div>
          ))}
        </div>
      )}

      {/* Coverage gained indicator */}
      {daysGained !== null && daysGained > 0 && (
        <div style={{ background: '#F0FDF4', border: '1px solid #86EFAC', borderRadius: 8, padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Clock size={16} color="#059669" />
          <span style={{ fontSize: '0.8125rem', color: '#14532D', fontWeight: 600 }}>
            By moving delivery from {originalETA} to {newETA}, you gain <strong>{daysGained} additional days</strong> of coverage.
          </span>
        </div>
      )}
      {etaWarning && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '0.625rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>{etaWarning}</span>
        </div>
      )}

      {/* Log form */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Phone size={14} color="#374151" />
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>Log the action you took</span>
          <span style={{ fontSize: '0.5625rem', color: '#9CA3AF', marginLeft: 4 }}>— saved to activity log for audit trail</span>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>

          {/* Contact info */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Original scheduled delivery date">
              <input type="date" value={originalETA} onChange={e => setOriginalETA(e.target.value)} style={inputStyle} />
            </Field>
            <Field label="New committed delivery date" required hint="Must be earlier than the original date">
              <input
                type="date"
                value={newETA}
                onChange={e => setNewETA(e.target.value)}
                style={{ ...inputStyle, borderColor: etaWarning ? '#DC2626' : newETA ? '#059669' : '#D1D5DB' }}
              />
            </Field>
          </div>

          {/* Freight + cost */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="Freight/delivery method upgraded to">
              <select value={freightMethod} onChange={e => setFreightMethod(e.target.value)} style={inputStyle}>
                <option value="">Select method…</option>
                {FREIGHT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            </Field>
            <Field label="Rush / priority fee paid (₹)" hint="Enter the amount in Rupees">
              <div style={{ position: 'relative' }}>
                <span style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', fontSize: '0.875rem', color: '#6B7280', fontWeight: 600 }}>₹</span>
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
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
            <Field label="PO / order reference numbers" hint="Comma-separated if multiple">
              <input value={poReferences} onChange={e => setPoReferences(e.target.value)} placeholder="e.g. PO-2024-8812, PO-2024-8813" style={inputStyle} />
            </Field>
            <Field label="Supplier confirmation reference" hint="Email ref, ticket #, WhatsApp message ID">
              <input value={supplierRef} onChange={e => setSupplierRef(e.target.value)} placeholder="e.g. Email ref #84921 from supplier" style={inputStyle} />
            </Field>
          </div>

          {/* Confirmation date + Follow-up */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem' }}>
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
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '0.625rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>{submitError}</span>
        </div>
      )}
      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button
          onClick={handleDone}
          disabled={saving}
          style={{ padding: '0.75rem 1.5rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9375rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}
        >
          <CheckCircle2 size={18} />
          {saving ? 'Saving…' : 'Confirm & Mark as Done'}
        </button>
        <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>This will remove the supplier from the active risk queue</span>
      </div>
    </div>
  )
}
