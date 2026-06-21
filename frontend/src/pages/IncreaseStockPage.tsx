import { useState, useCallback, useMemo, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ShoppingCart, Info, TrendingUp, AlertTriangle, ArrowLeft, List, Phone } from 'lucide-react'
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
  width: '100%', padding: '0.625rem 0.875rem', border: '1px solid #E2E8F0',
  borderRadius: 8, fontSize: '0.8125rem', fontFamily: 'inherit', outline: 'none',
  boxSizing: 'border-box', color: '#0F172A', background: '#FFFFFF',
  transition: 'border-color 150ms ease, box-shadow 150ms ease',
}

function Field({ label, required, hint, children, col }: {
  label: string; required?: boolean; hint?: string; children: React.ReactNode; col?: string
}) {
  return (
    <div style={col ? { gridColumn: col } : undefined}>
      <label style={{ fontSize: '0.75rem', fontWeight: 700, color: '#475569', display: 'block', marginBottom: 6 }}>
        {label}{required && <span style={{ color: '#EF4444', marginLeft: 2 }}>*</span>}
      </label>
      {hint && <div style={{ fontSize: '0.6875rem', color: '#64748B', marginBottom: 6, lineHeight: 1.4 }}>{hint}</div>}
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

          .buffer-pill {
            padding: 6px 14px;
            border-radius: 99px;
            font-size: 0.75rem;
            font-weight: 600;
            cursor: pointer;
            transition: all 120ms ease;
            font-family: inherit;
          }
          .buffer-pill-active {
            background: #0F172A;
            color: #ffffff;
            border: 1px solid #0F172A;
          }
          .buffer-pill-inactive {
            background: #ffffff;
            color: #475569;
            border: 1px solid #E2E8F0;
          }
          .buffer-pill-inactive:hover {
            background: #F8FAFC;
            border-color: #CBD5E1;
            color: #0F172A;
          }
          .buffer-pill:active {
            transform: scale(0.95);
          }
        `}</style>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <CheckCircle2 size={32} color="#16a34a" />
        </div>
        <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0F172A', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>Safety stock order logged</div>
        <div style={{ fontSize: '0.875rem', color: '#64748B', marginBottom: '2rem', lineHeight: 1.6, fontWeight: 500 }}>
          Purchase order details saved. The supplier has been removed from the active risk queue.
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

        .buffer-pill {
          padding: 6px 14px;
          border-radius: 99px;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 120ms ease;
          font-family: inherit;
        }
        .buffer-pill-active {
          background: #0F172A;
          color: #ffffff;
          border: 1px solid #0F172A;
        }
        .buffer-pill-inactive {
          background: #ffffff;
          color: #475569;
          border: 1px solid #E2E8F0;
        }
        .buffer-pill-inactive:hover {
          background: #F8FAFC;
          border-color: #CBD5E1;
          color: #0F172A;
        }
        .buffer-pill:active {
          transform: scale(0.95);
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
            <span style={{ color: '#0F172A', fontSize: '0.75rem', fontWeight: 700 }}>Pre-order Safety Stock</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
            Pre-order Safety Stock
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px', marginBottom: 0 }}>
            Order extra inventory now to build a buffer through the disruption period for <strong>{supplier?.name ?? '—'}</strong>
          </p>
        </div>
        <div style={{ 
          padding: '8px 16px', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)', textAlign: 'right'
        }}>
          <div style={{ fontSize: '0.625rem', color: '#64748B', fontWeight: 700, textTransform: 'uppercase', marginBottom: '0.25rem' }}>Est. Order Value</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#0F172A', fontFamily: 'monospace', lineHeight: 1 }}>{formatINR(totalOrderValue)}</div>
          <div style={{ fontSize: '0.6875rem', color: '#64748B', marginTop: '4px', fontWeight: 500 }}>{effectiveBuffer}-day buffer</div>
        </div>
      </div>

      {/* Info Block */}
      <div style={{ background: '#F0FDF4', border: '1px solid rgba(22, 101, 52, 0.12)', borderRadius: '12px', padding: '16px 20px', display: 'flex', gap: '0.875rem' }}>
        <Info size={16} color="#059669" style={{ flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#166534', marginBottom: 4 }}>What pre-ordering safety stock does</div>
          <p style={{ fontSize: '0.8125rem', color: '#14532D', lineHeight: 1.6, margin: 0, fontWeight: 500 }}>
            You place an urgent purchase order for more inventory than normal — enough to cover the disruption plus a buffer. Even if <strong>{supplier?.name}</strong> delays or stops supply, you'll have stock to keep selling. This buys time; it doesn't resolve the root supplier issue.
          </p>
        </div>
      </div>

      {/* Buffer selector + order quantity table */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TrendingUp size={16} color="#4F46E5" />
            <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>Products to stock up on</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '0.8125rem', color: '#475569', fontWeight: 600 }}>Buffer target:</span>
            <div style={{ display: 'flex', gap: 6 }}>
              {BUFFER_DAYS.map(d => {
                const isSelected = effectiveBuffer === d && customBuffer === ''
                return (
                  <button
                    key={d}
                    onClick={() => { setBufferDays(d); setCustomBuffer('') }}
                    className={isSelected ? "buffer-pill buffer-pill-active" : "buffer-pill buffer-pill-inactive"}
                  >
                    {d}d
                  </button>
                )
              })}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <input
                type="number"
                min={1}
                max={365}
                value={customBuffer}
                onChange={e => setCustomBuffer(e.target.value)}
                placeholder="Custom"
                style={{ width: 76, padding: '4px 8px', borderRadius: 6, border: `1px solid ${customBuffer ? '#0F172A' : '#E2E8F0'}`, fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box' }}
              />
              <span style={{ fontSize: '0.75rem', color: '#64748B', fontWeight: 500 }}>days</span>
            </div>
          </div>
        </div>

        {atRiskSKUs.length === 0 ? (
          <div style={{ padding: '3rem 2rem', textAlign: 'center', color: '#64748B', fontSize: '0.875rem', fontWeight: 500 }}>No products found in the stockout forecast for this supplier.</div>
        ) : (
          <>
            <div style={{ padding: '0.75rem 1rem 0.5rem', display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1.25fr 1.25fr 1.25fr', gap: '0 1rem', borderBottom: '1px solid #F1F5F9' }}>
              {['Product', 'In stock', 'Days left', `Order qty`, 'Unit cost (₹)', 'At risk'].map(h => (
                <div key={h} style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#64748B', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
              ))}
            </div>
            {atRiskSKUs.map(sku => {
              const qty = Math.ceil(sku.adjusted_demand * effectiveBuffer)
              return (
                <div key={sku.sku_id} style={{ padding: '0.875rem 1rem', display: 'grid', gridTemplateColumns: '2.5fr 1fr 1fr 1.25fr 1.25fr 1.25fr', gap: '0 1rem', alignItems: 'center', borderBottom: '1px solid #F1F5F9' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>{sku.sku_name}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748B', marginTop: 2, fontWeight: 500 }}>{sku.sku_code} · {Math.round(sku.adjusted_demand)}/day</div>
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#334155', fontWeight: 500 }}>{sku.current_stock.toLocaleString()}</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: sku.days_to_stockout <= 3 ? '#EF4444' : sku.days_to_stockout <= 7 ? '#F59E0B' : '#10B981' }}>{sku.days_to_stockout}d</div>
                  <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#4F46E5' }}>{qty.toLocaleString()} units</div>
                  {/* Unit cost override */}
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', fontSize: '0.75rem', color: '#64748B', fontWeight: 650 }}>₹</span>
                    <input
                      type="number"
                      min={0}
                      value={unitCosts[sku.sku_id] ?? ''}
                      onChange={e => setUnitCosts(prev => ({ ...prev, [sku.sku_id]: e.target.value }))}
                      placeholder="—"
                      title="Override unit cost for accurate order value"
                      style={{ width: '100%', padding: '5px 8px 5px 20px', borderRadius: 6, border: '1px solid #E2E8F0', fontSize: '0.75rem', fontFamily: 'inherit', outline: 'none', color: '#0F172A', background: '#FFFFFF', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div style={{ fontSize: '0.875rem', color: '#0F172A', fontWeight: 700, fontFamily: 'monospace' }}>{formatINR(sku.revenue_at_risk_inr)}</div>
                </div>
              )
            })}
            <div style={{ padding: '1rem', background: '#F8FAFC', display: 'flex', justifyContent: 'flex-end', gap: '2rem', borderTop: '1px solid #E2E8F0' }}>
              <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>Total units to order: <strong style={{ color: '#0F172A', fontWeight: 700 }}>{atRiskSKUs.reduce((s, sku) => s + Math.ceil(sku.adjusted_demand * effectiveBuffer), 0).toLocaleString()}</strong></span>
              <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>Est. order value: <strong style={{ color: '#10B981', fontWeight: 800 }}>{formatINR(totalOrderValue)}</strong></span>
            </div>
          </>
        )}
      </div>

      {/* Supplier contact */}
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={16} color="#475569" />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>Supplier Contact</span>
        </div>
        <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
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
      <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', overflow: 'hidden', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <div style={{ padding: '1rem', borderBottom: '1px solid #E2E8F0', background: '#F8FAFC', display: 'flex', alignItems: 'center', gap: 8 }}>
          <ShoppingCart size={16} color="#475569" />
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A' }}>Purchase Order Details</span>
        </div>
        <div style={{ padding: '1.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.25rem' }}>
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
              style={{ ...inputStyle, borderColor: deliveryError ? '#EF4444' : deliveryDate ? '#10B981' : '#E2E8F0' }}
            />
            {deliveryError && <div style={{ fontSize: '0.75rem', color: '#EF4444', marginTop: 4, fontWeight: 500 }}>{deliveryError}</div>}
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
