import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { ChevronLeft, Package, CheckCircle2, ShoppingCart, Info, TrendingUp, AlertTriangle, ArrowLeft, List, Phone } from 'lucide-react'
import { useStockoutForecast, useSuppliers } from '../hooks/useQueries'
import { queryKeys } from '../hooks/queryKeys'
import { api } from '../services/api'

function formatINR(n: number) {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

const PAYMENT_TERMS = ['Advance payment', 'Net 15', 'Net 30', 'Net 60', 'Letter of Credit', 'COD']
const ORDER_FROM    = ['Same supplier (current)', 'Alternate supplier', 'Multiple suppliers']
const CONTACT_METHODS = ['Phone call', 'Email', 'WhatsApp', 'In-person meeting']
const BUFFER_DAYS   = [14, 21, 30, 45, 60]
const FREIGHT_MODES = ['Standard road', 'Express courier', 'Air freight', 'Rail', 'Supplier-arranged']

const inputStyle: React.CSSProperties = {
  width: '100%', padding: '0.5rem 0.75rem', border: '1px solid #D1D5DB',
  borderRadius: 6, fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', color: '#111827', background: '#fff',
}

function Field({ label, required, hint, children, col }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode; col?: string
}) {
  return (
    <div style={col ? { gridColumn: col } : undefined}>
      <label style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
        {label}{required && <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '0.5625rem', color: '#6B7280', marginBottom: 4, lineHeight: 1.4 }}>{hint}</div>}
      {children}
    </div>
  )
}

export default function IncreaseStockPage() {
  const { id: supplierId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: stockout } = useStockoutForecast()
  const { data: suppliersData } = useSuppliers()

  const [bufferDays, setBufferDays]           = useState(30)
  const [customBuffer, setCustomBuffer]       = useState('')
  const [unitCosts, setUnitCosts]             = useState<Record<string, string>>({})  // skuId → unit cost override
  const [orderFrom, setOrderFrom]             = useState('')
  const [alternateName, setAlternateName]     = useState('')  // shown when orderFrom === 'Alternate supplier'
  const [contactPerson, setContactPerson]     = useState('')
  const [contactMethod, setContactMethod]     = useState('')
  const [vendorName, setVendorName]           = useState('')
  const [poNumber, setPoNumber]               = useState('')
  const [orderDate, setOrderDate]             = useState(new Date().toISOString().split('T')[0])
  const [deliveryDate, setDeliveryDate]       = useState('')
  const [leadTimeConfirmed, setLeadTimeConfirmed] = useState('')
  const [financeApproval, setFinanceApproval] = useState('')
  const [freightMode, setFreightMode]         = useState('')
  const [paymentTerms, setPaymentTerms]       = useState('')
  const [warehouseLocation, setWarehouseLocation] = useState('')
  const [authorizedBy, setAuthorizedBy]       = useState('')
  const [note, setNote]                       = useState('')
  const [saving, setSaving]                   = useState(false)
  const [done, setDone]                       = useState(false)
  const [submitError, setSubmitError]         = useState('')

  const supplier = suppliersData?.suppliers.find(s => s.id === supplierId)
  const atRiskSKUs = (stockout?.forecasts ?? [])
    .filter(f => f.supplier_name === supplier?.name)
    .sort((a, b) => a.days_to_stockout - b.days_to_stockout)

  // Effective buffer days: custom input wins over pill selection
  const effectiveBuffer = customBuffer !== '' && Number(customBuffer) > 0
    ? Math.round(Number(customBuffer))
    : bufferDays

  // Calculate total order value using overridden unit costs when provided,
  // otherwise fall back to a reasonable estimate: revenue_at_risk_inr / (days_to_stockout * adjusted_demand)
  const totalOrderValue = useMemo(() => {
    return atRiskSKUs.reduce((sum, sku) => {
      const qty = Math.ceil(sku.adjusted_demand * effectiveBuffer)
      // Use overridden cost if entered; else derive from revenue-at-risk / remaining units
      const override = parseFloat(unitCosts[sku.sku_id] ?? '')
      const unitCost = !isNaN(override) && override > 0
        ? override
        : sku.revenue_at_risk_inr / Math.max(1, sku.days_to_stockout * sku.adjusted_demand)
      return sum + qty * unitCost
    }, 0)
  }, [atRiskSKUs, effectiveBuffer, unitCosts])

  // Dirty-state warning
  const isDirty = !!(orderFrom || vendorName || poNumber || deliveryDate || note)
  useEffect(() => {
    if (!isDirty || done) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, done])

  // Validation
  const deliveryError = deliveryDate && orderDate && new Date(deliveryDate) <= new Date(orderDate)
    ? 'Expected delivery date must be after the order date.'
    : null

  const handleDone = useCallback(async () => {
    if (!supplierId) return
    if (!deliveryDate) { setSubmitError('Please enter the expected delivery date before saving.'); return }
    if (deliveryError) { setSubmitError(deliveryError); return }
    setSubmitError('')
    setSaving(true)

    const skuSummary = atRiskSKUs.map(sku => {
      const qty = Math.ceil(sku.adjusted_demand * effectiveBuffer)
      const override = parseFloat(unitCosts[sku.sku_id] ?? '')
      const costStr = !isNaN(override) && override > 0 ? ` @ ₹${override}/unit` : ''
      return `${sku.sku_name} (${qty.toLocaleString()} units${costStr})`
    }).join(', ')

    const orderSource = orderFrom === 'Alternate supplier' && alternateName.trim()
      ? `Alternate supplier — ${alternateName.trim()}`
      : orderFrom

    const parts = [
      'Action taken: Pre-order additional safety stock',
      `Buffer target: ${effectiveBuffer} days`,
      skuSummary          ? `SKUs ordered: ${skuSummary}`                              : null,
      orderSource         ? `Order source: ${orderSource}`                             : null,
      contactPerson.trim()? `Contact: ${contactPerson.trim()}`                        : null,
      contactMethod       ? `Contact method: ${contactMethod}`                        : null,
      vendorName.trim()   ? `Vendor: ${vendorName.trim()}`                            : null,
      poNumber.trim()     ? `PO number: ${poNumber.trim()}`                           : null,
      orderDate           ? `Order date: ${orderDate}`                                : null,
      deliveryDate        ? `Expected delivery: ${deliveryDate}`                      : null,
      leadTimeConfirmed   ? `Lead time confirmed: ${leadTimeConfirmed}`               : null,
      financeApproval.trim() ? `Finance approval: ${financeApproval.trim()}`         : null,
      freightMode         ? `Freight mode: ${freightMode}`                            : null,
      paymentTerms        ? `Payment terms: ${paymentTerms}`                         : null,
      warehouseLocation.trim() ? `Receiving warehouse: ${warehouseLocation.trim()}`  : null,
      authorizedBy.trim() ? `Authorized by: ${authorizedBy.trim()}`                  : null,
      note.trim()         || null,
    ].filter(Boolean)

    try {
      await api.resolveAllSupplierCards(supplierId, parts.join(' — '))
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
    supplierId, effectiveBuffer, atRiskSKUs, unitCosts, orderFrom, alternateName,
    contactPerson, contactMethod, vendorName, poNumber, orderDate, deliveryDate,
    leadTimeConfirmed, financeApproval, freightMode, paymentTerms, warehouseLocation,
    authorizedBy, note, deliveryError, queryClient,
  ])

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: '3rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <CheckCircle2 size={32} color="#16a34a" />
        </div>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', marginBottom: '0.5rem' }}>Safety stock order logged</div>
        <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
          Purchase order details saved. The supplier has been removed from the active risk queue.
        </div>
        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <button onClick={() => navigate('/activity')} style={{ padding: '0.625rem 1.25rem', background: '#000', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <List size={14} /> View Activity Log
          </button>
          <button onClick={() => navigate('/risks')} style={{ padding: '0.625rem 1.25rem', background: '#fff', color: '#000', border: '1px solid #D1D5DB', borderRadius: 8, fontWeight: 600, fontSize: '0.8125rem', cursor: 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 6 }}>
            <ArrowLeft size={14} /> Back to Risks
          </button>
        </div>
      </div>
    )
  }

  return (
    <div style={{ maxWidth: 760, display: 'flex', flexDirection: 'column', gap: '1rem' }}>

      <button onClick={() => {
        if (isDirty && !window.confirm('You have unsaved changes. Leave anyway?')) return
        navigate(-1)
      }} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: '#6B7280', fontSize: '0.8125rem', fontFamily: 'inherit', padding: '4px 0', width: 'fit-content' }}>
        <ChevronLeft size={14} /> Back to Recovery Options
      </button>

      {/* Header */}
      <div style={{ background: '#000', borderRadius: 12, padding: '1.25rem 1.5rem', display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <Package size={22} color="#059669" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Pre-order Safety Stock</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff' }}>{supplier?.name ?? '—'}</div>
          <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
            Order extra inventory now to build a buffer through the disruption period
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>Est. order value</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#86EFAC', fontFamily: 'monospace', lineHeight: 1 }}>{formatINR(totalOrderValue)}</div>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>{effectiveBuffer}-day buffer</div>
        </div>
      </div>

      {/* What this means */}
      <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem' }}>
        <Info size={16} color="#059669" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#166534', marginBottom: 4 }}>What pre-ordering safety stock does</div>
          <p style={{ fontSize: '0.8125rem', color: '#14532D', lineHeight: 1.6, margin: 0 }}>
            You place an urgent purchase order for more inventory than normal — enough to cover the disruption plus a buffer. Even if <strong>{supplier?.name}</strong> delays or stops supply, you'll have stock to keep selling. This buys time; it doesn't resolve the root supplier issue.
          </p>
        </div>
      </div>

      {/* Buffer selector + order quantity table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <TrendingUp size={14} color="#2563EB" />
            <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>Products to stock up on</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.6875rem', color: '#374151', fontWeight: 500 }}>Buffer target:</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {BUFFER_DAYS.map(d => (
                <button
                  key={d}
                  onClick={() => { setBufferDays(d); setCustomBuffer('') }}
                  style={{ padding: '3px 10px', borderRadius: 99, border: `1px solid ${effectiveBuffer === d && customBuffer === '' ? '#2563EB' : '#D1D5DB'}`, background: effectiveBuffer === d && customBuffer === '' ? '#2563EB' : '#fff', color: effectiveBuffer === d && customBuffer === '' ? '#fff' : '#374151', fontSize: '0.6875rem', fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit' }}
                >
                  {d}d
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <input
                type="number"
                min={1}
                max={365}
                value={customBuffer}
                onChange={e => setCustomBuffer(e.target.value)}
                placeholder="Custom"
                style={{ width: 72, padding: '3px 8px', borderRadius: 6, border: `1px solid ${customBuffer ? '#2563EB' : '#D1D5DB'}`, fontSize: '0.6875rem', fontFamily: 'inherit', outline: 'none', color: '#111827', background: '#fff', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '0.625rem', color: '#6B7280' }}>days</span>
            </div>
          </div>
        </div>

        {atRiskSKUs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '0.8125rem' }}>No specific products found in the stockout forecast for this supplier.</div>
        ) : (
          <>
            <div style={{ padding: '0.375rem 1rem 0.25rem', display: 'grid', gridTemplateColumns: '2fr 70px 70px 90px 90px 90px', gap: '0 0.5rem' }}>
              {['Product', 'In stock', 'Days left', `Order qty`, 'Unit cost (₹)', 'At risk'].map(h => (
                <div key={h} style={{ fontSize: '0.4375rem', fontWeight: 700, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.04em', paddingBottom: '0.375rem', borderBottom: '1px solid #F3F4F6' }}>{h}</div>
              ))}
            </div>
            {atRiskSKUs.map(sku => {
              const qty = Math.ceil(sku.adjusted_demand * effectiveBuffer)
              return (
                <div key={sku.sku_id} style={{ padding: '0.5rem 1rem', display: 'grid', gridTemplateColumns: '2fr 70px 70px 90px 90px 90px', gap: '0 0.5rem', alignItems: 'center', borderBottom: '1px solid #F9FAFB' }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#111827' }}>{sku.sku_name}</div>
                    <div style={{ fontSize: '0.5rem', color: '#9CA3AF', marginTop: 1 }}>{sku.sku_code} · {Math.round(sku.adjusted_demand)}/day</div>
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#374151' }}>{sku.current_stock.toLocaleString()}</div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: sku.days_to_stockout <= 3 ? '#DC2626' : sku.days_to_stockout <= 7 ? '#D97706' : '#059669' }}>{sku.days_to_stockout}d</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#2563EB' }}>{qty.toLocaleString()} units</div>
                  {/* Unit cost override */}
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 6, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#6B7280' }}>₹</span>
                    <input
                      type="number"
                      min={0}
                      value={unitCosts[sku.sku_id] ?? ''}
                      onChange={e => setUnitCosts(prev => ({ ...prev, [sku.sku_id]: e.target.value }))}
                      placeholder="—"
                      title="Override unit cost for accurate order value"
                      style={{ width: '100%', padding: '3px 6px 3px 18px', borderRadius: 5, border: '1px solid #D1D5DB', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', color: '#111827', background: '#fff', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.8125rem', color: '#374151' }}>{formatINR(sku.revenue_at_risk_inr)}</div>
                </div>
              )
            })}
            <div style={{ padding: '0.625rem 1rem', background: '#F9FAFB', display: 'flex', justifyContent: 'flex-end', gap: '1.5rem' }}>
              <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>Total units to order: <strong style={{ color: '#000' }}>{atRiskSKUs.reduce((s, sku) => s + Math.ceil(sku.adjusted_demand * effectiveBuffer), 0).toLocaleString()}</strong></span>
              <span style={{ fontSize: '0.6875rem', color: '#6B7280' }}>Est. order value: <strong style={{ color: '#059669' }}>{formatINR(totalOrderValue)}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* Supplier contact */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 6 }}>
          <Phone size={14} color="#374151" />
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>Supplier contact</span>
        </div>
        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Contact person at supplier">
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="e.g. Anita Sharma, Key Account Manager" style={inputStyle} />
          </Field>
          <Field label="Contact method">
            <select value={contactMethod} onChange={e => setContactMethod(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {CONTACT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
        </div>
      </div>

      {/* PO Form */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB', display: 'flex', alignItems: 'center', gap: 6 }}>
          <ShoppingCart size={14} color="#374151" />
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>Purchase Order Details</span>
        </div>
        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Order from">
            <select value={orderFrom} onChange={e => setOrderFrom(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {ORDER_FROM.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          {/* Contextual alternate supplier name field */}
          {orderFrom === 'Alternate supplier' ? (
            <Field label="Alternate supplier name" hint="Name of the alternate you're ordering from">
              <input value={alternateName} onChange={e => setAlternateName(e.target.value)} placeholder="e.g. Sunrise Distributors Pvt Ltd" style={inputStyle} />
            </Field>
          ) : (
            <Field label="Vendor / supplier name">
              <input value={vendorName} onChange={e => setVendorName(e.target.value)} placeholder={supplier?.name ?? 'Supplier name'} style={inputStyle} />
            </Field>
          )}
          <Field label="PO / order reference number">
            <input value={poNumber} onChange={e => setPoNumber(e.target.value)} placeholder="e.g. PO-2024-9021" style={inputStyle} />
          </Field>
          <Field label="Finance approval reference" hint="Emergency PO approval code (if required)">
            <input value={financeApproval} onChange={e => setFinanceApproval(e.target.value)} placeholder="e.g. FIN-EMER-2024-041" style={inputStyle} />
          </Field>
          <Field label="Order date">
            <input type="date" value={orderDate} onChange={e => setOrderDate(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Expected delivery date" required hint="When will the stock physically arrive?">
            <input
              type="date"
              value={deliveryDate}
              onChange={e => setDeliveryDate(e.target.value)}
              style={{ ...inputStyle, borderColor: deliveryError ? '#DC2626' : deliveryDate ? '#059669' : '#D1D5DB' }}
            />
            {deliveryError && <div style={{ fontSize: '0.5625rem', color: '#DC2626', marginTop: 3 }}>{deliveryError}</div>}
          </Field>
          <Field label="Lead time confirmed with supplier" hint="Supplier's confirmed days to dispatch">
            <input value={leadTimeConfirmed} onChange={e => setLeadTimeConfirmed(e.target.value)} placeholder="e.g. 7 days from order date" style={inputStyle} />
          </Field>
          <Field label="Freight mode">
            <select value={freightMode} onChange={e => setFreightMode(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {FREIGHT_MODES.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Payment terms">
            <select value={paymentTerms} onChange={e => setPaymentTerms(e.target.value)} style={inputStyle}>
              <option value="">Select…</option>
              {PAYMENT_TERMS.map(m => <option key={m} value={m}>{m}</option>)}
            </select>
          </Field>
          <Field label="Receiving warehouse / location">
            <input value={warehouseLocation} onChange={e => setWarehouseLocation(e.target.value)} placeholder="e.g. Pune Distribution Centre, Bay 4" style={inputStyle} />
          </Field>
          <Field label="Authorized / approved by">
            <input value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} placeholder="e.g. Anita Desai, Head of Supply Chain" style={inputStyle} />
          </Field>
          <Field label="Additional notes" col="1 / -1">
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. Expedited shipping requested. Warehouse team on standby. Finance notified of emergency PO." rows={3} style={{ ...inputStyle, resize: 'none' }} />
          </Field>
        </div>
      </div>

      {submitError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '0.625rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>{submitError}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
        <button onClick={handleDone} disabled={saving} style={{ padding: '0.75rem 1.5rem', background: '#059669', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9375rem', cursor: saving ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8 }}>
          <CheckCircle2 size={18} />
          {saving ? 'Saving…' : 'Confirm & Mark as Done'}
        </button>
        <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>This will remove the supplier from the active risk queue</span>
      </div>
    </div>
  )
}
