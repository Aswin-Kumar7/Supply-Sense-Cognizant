import { useLocation, useNavigate } from 'react-router-dom'
import { Printer, ChevronLeft, CheckCircle2, Package, MapPin, Clock, CreditCard, Mail } from 'lucide-react'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

export default function OrderSummaryPage() {
  const location = useLocation()
  const navigate = useNavigate()
  const state = (location.state as any) ?? {}

  const {
    poNumber,
    supplierName,
    supplierCity,
    supplierState,
    costPremiumPct,
    leadTimeDays,
    skus = [],
    grandTotal = 0,
    paymentTerms,
    email,
    phone,
    primarySupplierId,
    actionCardId,
    orderedAt,
  } = state

  if (!poNumber) {
    return (
      <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
        No order found. Please place an order from a supplier page.
      </div>
    )
  }

  // Fix 1: when actionCardId is missing (e.g. arrived from CompanyDetailPage without one),
  // still navigate back but don't trigger the auto-resolve flow
  const canAutoResolve = !!(primarySupplierId && actionCardId)
  const handleReturnToMitigation = () => {
    navigate(`/risks/${primarySupplierId}/mitigation`, {
      state: canAutoResolve
        ? { orderPlaced: true, actionCardId, poNumber, supplierName }
        : { poNumber, supplierName },
    })
  }

  return (
    <>
      {/* CSS Styles */}
      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: #fff !important; }
          .print-page { box-shadow: none !important; border: none !important; }
        }

        .btn-back {
          background: none;
          border: none;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 4px;
          color: #64748B;
          font-size: 0.8125rem;
          font-family: inherit;
          padding: 6px 12px;
          border-radius: 6px;
          transition: all 120ms ease;
        }
        .btn-back:hover {
          color: #0F172A;
          background: #F1F5F9;
        }
        .btn-back:active {
          transform: scale(0.97);
        }

        .btn-action-primary {
          background: #0F172A;
          color: #ffffff;
          border: none;
          padding: 0.625rem 1.25rem;
          border-radius: 8px;
          font-weight: 700;
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          gap: 6px;
          transition: all 120ms ease;
          box-shadow: 0 1px 2px rgba(15, 23, 42, 0.05);
        }
        .btn-action-primary:hover {
          background: #1E293B;
          box-shadow: 0 4px 12px rgba(15, 23, 42, 0.12);
        }
        .btn-action-primary:active {
          transform: scale(0.97);
        }

        .btn-secondary {
          background: #ffffff;
          color: #334155;
          border: 1px solid #E2E8F0;
          padding: 0.625rem 1.25rem;
          border-radius: 8px;
          font-weight: 600;
          font-size: 0.75rem;
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
      `}</style>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '760px', margin: '2rem auto', width: '100%', fontFamily: "'Inter', sans-serif" }}>

        {/* Header actions — hidden on print */}
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <button onClick={() => navigate(-1)} className="btn-back">
            <ChevronLeft size={14} /> Back
          </button>
          <div style={{ display: 'flex', gap: '0.625rem' }}>
            <button onClick={() => window.print()} className="btn-secondary">
              <Printer size={13} /> Download PDF
            </button>
            {primarySupplierId && (
              <button onClick={handleReturnToMitigation} className="btn-action-primary">
                <CheckCircle2 size={13} />
                {canAutoResolve ? 'Return & Mark as Done' : 'Return to Mitigation Plan'}
              </button>
            )}
          </div>
        </div>

        {/* Order summary card */}
        <div className="print-page" style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.75rem', overflow: 'hidden', boxShadow: '0 4px 20px -2px rgba(15,23,42,0.05)' }}>

          {/* PO Header */}
          <div style={{ padding: '1.5rem 2rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.375rem' }}>
                Purchase Order
              </div>
              <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#000', letterSpacing: '-0.02em', fontFamily: 'monospace' }}>
                {poNumber}
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem' }}>
                Issued {orderedAt ?? new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
              </div>
            </div>
            <div style={{
              display: 'flex', alignItems: 'center', gap: '0.5rem',
              padding: '0.5rem 1rem', background: '#F0FDF4', border: '1px solid #BBF7D0',
              borderRadius: '99px', fontSize: '0.75rem', fontWeight: 700, color: '#16a34a',
            }}>
              <CheckCircle2 size={14} color="#16a34a" />
              Order Submitted
            </div>
          </div>

          {/* Supplier + Order meta */}
          <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <div>
              <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Supplier</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#000' }}>{supplierName}</div>
                {[
                  { icon: MapPin, text: `${supplierCity}, ${supplierState}` },
                  { icon: Mail, text: email },
                  { icon: Clock, text: `${phone}` },
                ].map(({ icon: Icon, text }) => (
                  <div key={text} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                    <Icon size={12} color="var(--ink-4)" /> {text}
                  </div>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Order Details</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {[
                  { icon: CreditCard, label: 'Payment terms', value: paymentTerms },
                  { icon: Clock, label: 'Expected delivery', value: `${leadTimeDays} days from confirmation` },
                  { icon: Package, label: 'Cost premium', value: `+${costPremiumPct?.toFixed(0)}% vs primary supplier` },
                ].map(({ icon: Icon, label, value }) => (
                  <div key={label} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.375rem', fontSize: '0.75rem' }}>
                    <Icon size={12} color="var(--ink-4)" style={{ marginTop: '1px', flexShrink: 0 }} />
                    <span style={{ color: 'var(--ink-4)' }}>{label}:</span>
                    <span style={{ color: '#000', fontWeight: 600 }}>{value}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* SKU line items */}
          <div style={{ padding: '1.25rem 2rem', borderBottom: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>Line Items</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 100px', gap: '0.75rem', paddingBottom: '0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
              {['Item', 'Qty', 'Unit Price', 'Total'].map((h, i) => (
                <div key={h} style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i > 1 ? 'right' : 'left' }}>{h}</div>
              ))}
            </div>

            {skus.map((sku: any) => (
              <div key={sku.sku_id} style={{ display: 'grid', gridTemplateColumns: '1fr 90px 100px 100px', gap: '0.75rem', padding: '0.625rem 0', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{sku.sku_name}</div>
                  <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>{sku.sku_code}</div>
                </div>
                <div style={{ fontSize: '0.8125rem', color: '#000', fontWeight: 500, fontFamily: 'monospace' }}>{sku.quantity?.toLocaleString()}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', textAlign: 'right' }}>{formatINR(sku.adjusted_unit_cost_inr)}</div>
                <div style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#000', textAlign: 'right', fontFamily: 'monospace' }}>{formatINR(sku.lineTotal)}</div>
              </div>
            ))}
          </div>

          {/* Grand total */}
          <div style={{ padding: '1.25rem 2rem', background: '#000', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(255,255,255,0.6)' }}>Grand Total (incl. cost premium)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fff', fontFamily: 'monospace', letterSpacing: '-0.02em' }}>
              {formatINR(grandTotal)}
            </div>
          </div>
        </div>

        {/* Return CTA — visible below card, hidden on print */}
        {primarySupplierId && (
          <div className="no-print" style={{
            padding: '1rem 1.25rem', background: '#F0FDF4', border: '1px solid #BBF7D0',
            borderRadius: '0.625rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem',
          }}>
            <div>
              <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000' }}>Order placed successfully</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px' }}>
                {canAutoResolve
                  ? 'Return to the mitigation plan to mark this risk as resolved.'
                  : 'Return to the mitigation plan to review next steps.'}
              </div>
            </div>
            <button onClick={handleReturnToMitigation} className="btn-action-primary" style={{ fontSize: '0.8125rem' }}>
              <CheckCircle2 size={14} />
              {canAutoResolve ? 'Return & Mark as Done' : 'Return to Mitigation Plan'}
            </button>
          </div>
        )}

      </div>
    </>
  )
}
