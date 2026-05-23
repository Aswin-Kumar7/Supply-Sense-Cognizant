import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useState, useCallback } from 'react'
import {
  ChevronLeft, MapPin, Clock, Star, Package, AlertTriangle,
  CheckCircle2, ShoppingCart, Phone, Mail, Globe, Building2,
  FileText, Shield, TrendingUp, Users, X, Plus, Minus,
} from 'lucide-react'
import { api } from '../services/api'

function formatINR(n: number) {
  if (n >= 10_000_000) return `₹${(n / 10_000_000).toFixed(1)}Cr`
  if (n >= 100_000)    return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)      return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

function ScoreBar({ value, color = '#059669' }: { value: number; color?: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
      <div style={{ flex: 1, height: '6px', background: '#F4F4F5', borderRadius: '99px', overflow: 'hidden' }}>
        <div style={{ width: `${(value * 100).toFixed(0)}%`, height: '100%', background: color, borderRadius: '99px', transition: 'width 0.6s ease' }} />
      </div>
      <span style={{ fontSize: '0.6875rem', fontWeight: 700, color, width: '2.5rem', textAlign: 'right' }}>
        {(value * 100).toFixed(0)}%
      </span>
    </div>
  )
}

// Deterministic hash from string — keeps generated contact info stable per supplier
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) h = (Math.imul(31, h) + s.charCodeAt(i)) | 0
  return Math.abs(h)
}

const STATE_GST: Record<string, string> = {
  'Maharashtra': '27', 'Delhi': '07', 'Karnataka': '29', 'Tamil Nadu': '33',
  'Gujarat': '24', 'West Bengal': '19', 'Rajasthan': '08', 'Uttar Pradesh': '09',
  'Andhra Pradesh': '28', 'Telangana': '36', 'Punjab': '03', 'Haryana': '06',
  'Madhya Pradesh': '23', 'Kerala': '32', 'Bihar': '10', 'Odisha': '21',
}

const STATE_STD: Record<string, string> = {
  'Maharashtra': '022', 'Delhi': '011', 'Karnataka': '080', 'Tamil Nadu': '044',
  'Gujarat': '079', 'West Bengal': '033', 'Rajasthan': '0141', 'Uttar Pradesh': '0522',
  'Andhra Pradesh': '040', 'Telangana': '040', 'Punjab': '0172', 'Haryana': '0124',
  'Madhya Pradesh': '0755', 'Kerala': '0484', 'Bihar': '0612', 'Odisha': '0674',
}

function generateContactInfo(name: string, state: string, category: string) {
  const h = hashStr(name)
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 12)
  const gstCode = STATE_GST[state] ?? '27'
  const std = STATE_STD[state] ?? '022'
  const pan = `${String.fromCharCode(65 + (h % 26))}${String.fromCharCode(65 + ((h >> 4) % 26))}${String.fromCharCode(65 + ((h >> 8) % 26))}P${String.fromCharCode(65 + ((h >> 12) % 26))}${1000 + (h % 9000)}`
  const gst = `${gstCode}${pan}1Z${String.fromCharCode(65 + ((h >> 16) % 26))}`
  const phone = `${std}-${2000000 + (h % 8000000)}`
  const mobile = `+91 ${7000000000 + (h % 2999999999)}`
  const tld = h % 3 === 0 ? '.in' : h % 3 === 1 ? '.com' : '.co.in'
  const established = 1985 + (h % 35)
  const employees = [50, 100, 200, 350, 500, 750, 1000, 1500][h % 8]
  const certifications = [
    ['ISO 9001:2015', 'FSSAI Licensed'],
    ['ISO 9001:2015', 'ISO 22000', 'FSSAI Licensed'],
    ['FSSAI Licensed', 'HACCP Certified'],
    ['ISO 9001:2015', 'ISO 14001', 'FSSAI Licensed', 'GMP Certified'],
    ['FSSAI Licensed', 'ISO 22000', 'BRC Global Standards'],
  ][h % 5]
  const paymentTerms = ['NET-30', 'NET-45', 'NET-60', '50% advance, 50% NET-30'][h % 4]
  const moq = [500, 1000, 2000, 5000, 250, 100][h % 6]

  return {
    email: `procurement@${slug}${tld}`,
    website: `www.${slug}${tld}`,
    phone,
    mobile,
    gst,
    pan,
    established,
    employees,
    certifications,
    paymentTerms,
    moq,
    category,
  }
}

function InfoRow({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.625rem' }}>
      <div style={{ width: 28, height: 28, borderRadius: '6px', background: '#F4F4F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: '1px' }}>
        <Icon size={13} color="#71717A" />
      </div>
      <div>
        <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{label}</div>
        <div style={{ fontSize: '0.8125rem', color: '#000', fontWeight: 500, marginTop: '1px' }}>{value}</div>
      </div>
    </div>
  )
}

/* ── Order Confirmation Modal ───────────────────────────────────────── */
function OrderModal({
  supplier,
  skus,
  contact,
  primarySupplierId,
  actionCardId,
  onClose,
}: {
  supplier: any
  skus: any[]
  contact: ReturnType<typeof generateContactInfo>
  primarySupplierId: string | undefined
  actionCardId: string | undefined
  onClose: () => void
}) {
  const navigate = useNavigate()
  // Fix 4: include timestamp suffix so repeated orders to the same supplier get unique PO numbers
  const poNumber = `PO-${new Date().getFullYear()}-${String(hashStr(supplier.supplier_name) % 9000 + 1000)}-${Date.now().toString(36).toUpperCase().slice(-5)}`
  const [quantities, setQuantities] = useState<Record<string, number>>(
    () => Object.fromEntries(skus.map(s => [s.sku_id, Math.ceil(s.daily_demand_avg * supplier.alt_lead_time_days)]))
  )
  const [submitting, setSubmitting] = useState(false)

  const setQty = useCallback((skuId: string, delta: number) => {
    setQuantities(prev => ({ ...prev, [skuId]: Math.max(0, (prev[skuId] ?? 0) + delta) }))
  }, [])

  const lineTotal = (sku: any) => quantities[sku.sku_id] * sku.adjusted_unit_cost_inr
  const grandTotal = skus.reduce((sum, s) => sum + lineTotal(s), 0)

  const handleConfirm = async () => {
    setSubmitting(true)
    await new Promise(r => setTimeout(r, 900))
    navigate('/order-summary', {
      state: {
        poNumber,
        supplierName: supplier.supplier_name,
        supplierCity: supplier.city,
        supplierState: supplier.state,
        supplierRegion: supplier.region,
        costPremiumPct: supplier.cost_premium_pct,
        leadTimeDays: supplier.alt_lead_time_days,
        skus: skus.map(s => ({
          sku_id: s.sku_id,
          sku_name: s.sku_name,
          sku_code: s.sku_code,
          quantity: quantities[s.sku_id],
          adjusted_unit_cost_inr: s.adjusted_unit_cost_inr,
          lineTotal: lineTotal(s),
        })),
        grandTotal,
        paymentTerms: contact.paymentTerms,
        email: contact.email,
        phone: contact.phone,
        primarySupplierId,
        actionCardId,
        orderedAt: new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }),
      },
    })
  }

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.45)', backdropFilter: 'blur(2px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '1.5rem',
    }} onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        style={{
          background: '#fff', borderRadius: '0.875rem', width: '100%', maxWidth: '620px',
          maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
          boxShadow: '0 24px 60px rgba(0,0,0,0.18)',
        }}
      >
        {/* Modal header */}
        <div style={{ padding: '1.25rem 1.5rem', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: '1rem', fontWeight: 700, color: '#000' }}>Confirm Order</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '2px' }}>
              {supplier.supplier_name} · {poNumber}
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink-3)', display: 'flex', padding: '4px' }}>
            <X size={18} />
          </button>
        </div>

        <>
          <>
            {/* SKU quantity table */}
            <div style={{ overflowY: 'auto', flex: 1, padding: '1rem 1.5rem' }}>
              <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
                Order Items — adjust quantities as needed
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 80px 90px', gap: '0.5rem', padding: '0 0 0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
                {['SKU', 'Quantity', 'Unit Price', 'Total'].map((h, i) => (
                  <div key={h} style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', textAlign: i > 1 ? 'right' : 'left' }}>{h}</div>
                ))}
              </div>

              {skus.map(sku => (
                <div key={sku.sku_id} style={{
                  display: 'grid', gridTemplateColumns: '1fr 120px 80px 90px', gap: '0.5rem',
                  padding: '0.75rem 0', borderBottom: '1px solid var(--border)', alignItems: 'center',
                }}>
                  <div>
                    <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000' }}>{sku.sku_name}</div>
                    <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)' }}>{sku.sku_code}</div>
                  </div>
                  {/* Quantity stepper */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <button
                      onClick={() => setQty(sku.sku_id, -Math.ceil(sku.daily_demand_avg))}
                      style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Minus size={11} />
                    </button>
                    <span style={{ fontSize: '0.8125rem', fontWeight: 600, minWidth: '40px', textAlign: 'center', fontFamily: 'monospace' }}>
                      {quantities[sku.sku_id]}
                    </span>
                    <button
                      onClick={() => setQty(sku.sku_id, Math.ceil(sku.daily_demand_avg))}
                      style={{ width: '26px', height: '26px', borderRadius: '4px', border: '1px solid var(--border)', background: '#fff', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Plus size={11} />
                    </button>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', textAlign: 'right' }}>{formatINR(sku.adjusted_unit_cost_inr)}</div>
                  <div style={{ fontSize: '0.8125rem', fontWeight: 600, color: '#000', textAlign: 'right', fontFamily: 'monospace' }}>{formatINR(lineTotal(sku))}</div>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)', background: '#F9F9F9' }}>
              {/* Order meta */}
              <div style={{ display: 'flex', gap: '1.5rem', marginBottom: '1rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                <span>Payment: <strong style={{ color: '#000' }}>{contact.paymentTerms}</strong></span>
                <span>Delivery: <strong style={{ color: '#000' }}>{supplier.alt_lead_time_days} days</strong></span>
                <span>To: <strong style={{ color: '#000' }}>{contact.email}</strong></span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>Grand Total</div>
                  <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#000', fontFamily: 'monospace', lineHeight: 1.1 }}>{formatINR(grandTotal)}</div>
                  <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '2px' }}>incl. +{supplier.cost_premium_pct.toFixed(0)}% premium</div>
                </div>
                <div style={{ display: 'flex', gap: '0.625rem' }}>
                  <button onClick={onClose} style={{ padding: '0.625rem 1.25rem', border: '1px solid var(--border)', borderRadius: '6px', background: '#fff', color: 'var(--ink-2)', fontWeight: 600, fontSize: '0.875rem', cursor: 'pointer', fontFamily: 'inherit' }}>
                    Cancel
                  </button>
                  <button
                    onClick={handleConfirm}
                    disabled={submitting || grandTotal === 0}
                    style={{ padding: '0.625rem 1.5rem', background: submitting ? '#666' : '#000', color: '#fff', border: 'none', borderRadius: '6px', fontWeight: 700, fontSize: '0.875rem', cursor: submitting ? 'wait' : 'pointer', fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: '0.5rem' }}
                  >
                    <ShoppingCart size={14} />
                    {submitting ? 'Submitting…' : 'Confirm Order'}
                  </button>
                </div>
              </div>
            </div>
          </>
        </>
      </div>
    </div>
  )
}

export default function AlternateSupplierDetailPage() {
  const { altId } = useParams<{ altId: string }>()
  const location = useLocation()
  const navigate = useNavigate()
  const primarySupplierId = (location.state as any)?.primarySupplierId as string | undefined
  const actionCardId = (location.state as any)?.actionCardId as string | undefined

  // Fix 1: useState MUST come before any conditional returns (Rules of Hooks)
  const [orderOpen, setOrderOpen] = useState(false)

  const { data, isLoading, isError } = useQuery({
    queryKey: ['alt-detail', altId, primarySupplierId],
    queryFn: () => api.getAlternateSupplierDetail(altId!, primarySupplierId!),
    enabled: !!altId && !!primarySupplierId,
  })

  if (!primarySupplierId) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--ink-4)', fontSize: '0.875rem' }}>
        Missing context. Please navigate here from a supplier page.
      </div>
    )
  }

  if (isLoading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', padding: '1rem' }}>
        {[160, 220, 300, 200].map(h => (
          <div key={h} className="skeleton" style={{ height: h, borderRadius: '0.5rem' }} />
        ))}
      </div>
    )
  }

  if (isError || !data) {
    return (
      <div style={{ padding: '2rem', textAlign: 'center', color: '#DC2626', fontSize: '0.875rem' }}>
        Could not load alternate supplier details.
      </div>
    )
  }

  const { supplier, skus_covered, estimated_order_value_inr } = data
  const contact = generateContactInfo(supplier.supplier_name, supplier.state, supplier.category)
  const reliabilityColor = supplier.reliability_score >= 0.8 ? '#059669' : supplier.reliability_score >= 0.6 ? '#D29729' : '#DC2626'
  const qualityColor = supplier.quality_score >= 0.85 ? '#059669' : supplier.quality_score >= 0.7 ? '#D29729' : '#DC2626'

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem', maxWidth: '900px' }}>
      {orderOpen && (
        <OrderModal
          supplier={supplier}
          skus={skus_covered}
          contact={contact}
          primarySupplierId={primarySupplierId}
          actionCardId={actionCardId}
          onClose={() => setOrderOpen(false)}
        />
      )}

      {/* Breadcrumb */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem', color: 'var(--ink-3)', fontSize: '0.8125rem', fontFamily: 'inherit', padding: '4px 0' }}
        >
          <ChevronLeft size={14} /> Back
        </button>
        <span style={{ color: 'var(--ink-4)', fontSize: '0.75rem' }}>/</span>
        <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>Alternate Supplier</span>
        <span style={{ color: 'var(--ink-4)', fontSize: '0.75rem' }}>/</span>
        <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>{supplier.supplier_name}</span>
      </div>

      {/* Profile + Contact — two column layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 300px', gap: '0.875rem', alignItems: 'start' }}>

        {/* Left: Profile card */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
                {supplier.cost_premium_pct <= 5 && (
                  <span style={{ fontSize: '0.5rem', fontWeight: 700, background: '#F0FDF4', color: '#059669', border: '1px solid #BBF7D0', borderRadius: '4px', padding: '2px 6px', letterSpacing: '0.04em' }}>BEST VALUE</span>
                )}
                <span style={{ fontSize: '0.5rem', fontWeight: 700, background: '#F4F4F5', color: '#71717A', border: '1px solid var(--border)', borderRadius: '4px', padding: '2px 6px', letterSpacing: '0.04em' }}>
                  EST. {contact.established}
                </span>
              </div>
              <h1 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#000', margin: 0, lineHeight: 1.2 }}>{supplier.supplier_name}</h1>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: '0.375rem', color: 'var(--ink-4)', fontSize: '0.75rem' }}>
                <MapPin size={12} />
                <span>{supplier.city}, {supplier.state} · {supplier.region}</span>
                <span>·</span>
                <span style={{ fontWeight: 500, color: 'var(--ink-3)' }}>{supplier.category}</span>
              </div>
            </div>
            <div style={{ textAlign: 'right', flexShrink: 0 }}>
              <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>Cost Premium</div>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: supplier.cost_premium_pct <= 10 ? '#059669' : '#D29729', lineHeight: 1 }}>
                +{supplier.cost_premium_pct.toFixed(0)}%
              </div>
              <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '2px' }}>vs primary supplier</div>
            </div>
          </div>

          {/* Score bars */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem 1.5rem', padding: '0.875rem 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)', marginBottom: '0.875rem' }}>
            <div>
              <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>Reliability</div>
              <ScoreBar value={supplier.reliability_score} color={reliabilityColor} />
            </div>
            <div>
              <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.375rem' }}>Quality Score</div>
              <ScoreBar value={supplier.quality_score} color={qualityColor} />
            </div>
          </div>

          {/* Quick stats */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '1rem' }}>
            {[
              { icon: Clock, label: `${supplier.alt_lead_time_days}d lead time` },
              { icon: Package, label: `${skus_covered.length} SKU${skus_covered.length !== 1 ? 's' : ''} covered` },
              { icon: Users, label: `~${contact.employees} employees` },
              { icon: Star, label: supplier.region },
              ...(supplier.risk_zone ? [{ icon: AlertTriangle, label: `Risk: ${supplier.risk_zone}` }] : []),
            ].map(({ icon: Icon, label }) => (
              <div key={label} style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                <Icon size={13} style={{ color: 'var(--ink-4)' }} />
                <span>{label}</span>
              </div>
            ))}
          </div>

          {/* Certifications */}
          <div style={{ marginTop: '0.875rem', paddingTop: '0.875rem', borderTop: '1px solid var(--border)' }}>
            <div style={{ fontSize: '0.5625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: '0.5rem' }}>Certifications</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.375rem' }}>
              {contact.certifications.map(cert => (
                <span key={cert} style={{
                  display: 'flex', alignItems: 'center', gap: '4px',
                  fontSize: '0.6875rem', fontWeight: 500,
                  background: '#F0FDF4', color: '#166534',
                  border: '1px solid #BBF7D0', borderRadius: '4px',
                  padding: '3px 8px',
                }}>
                  <Shield size={10} /> {cert}
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Right: Contact card */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '1.25rem', boxShadow: 'var(--shadow-sm)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Contact Information</div>

          <InfoRow icon={Phone} label="Phone" value={contact.phone} />
          <InfoRow icon={Phone} label="Mobile" value={contact.mobile} />
          <InfoRow icon={Mail} label="Email" value={contact.email} />
          <InfoRow icon={Globe} label="Website" value={contact.website} />
          <InfoRow icon={MapPin} label="Location" value={`${supplier.city}, ${supplier.state}`} />

          <div style={{ height: '1px', background: 'var(--border)' }} />

          <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Business Registration</div>
          <InfoRow icon={FileText} label="GST Number" value={contact.gst} />
          <InfoRow icon={Building2} label="PAN" value={contact.pan} />
        </div>
      </div>

      {/* Order summary banner */}
      <div style={{ background: '#000', borderRadius: '0.625rem', padding: '1rem 1.25rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem' }}>
        <div>
          <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '4px' }}>
            Estimated Order Value
          </div>
          <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fff', fontFamily: 'monospace' }}>
            {formatINR(estimated_order_value_inr)}
          </div>
          <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.45)', marginTop: '2px' }}>
            {supplier.alt_lead_time_days}-day supply across {skus_covered.length} SKU{skus_covered.length !== 1 ? 's' : ''} · includes +{supplier.cost_premium_pct.toFixed(0)}% premium
          </div>
        </div>
        <div style={{ flexShrink: 0, textAlign: 'right' }}>
          <button
            onClick={() => setOrderOpen(true)}
            style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', background: '#fff', color: '#000', padding: '0.5rem 1rem', borderRadius: '0.375rem', fontSize: '0.75rem', fontWeight: 700, marginBottom: '0.5rem', border: 'none', cursor: 'pointer', fontFamily: 'inherit' }}
          >
            <ShoppingCart size={13} />
            Ready to Order
          </button>
          <div style={{ fontSize: '0.5625rem', color: 'rgba(255,255,255,0.4)' }}>MOQ: {contact.moq.toLocaleString()} units</div>
        </div>
      </div>

      {/* SKUs covered */}
      <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '1rem 1.25rem', boxShadow: 'var(--shadow-sm)' }}>
        <h2 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
          SKUs This Supplier Can Cover
        </h2>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 100px 24px', gap: '0.75rem', padding: '0 0 0.5rem', borderBottom: '1px solid var(--border)', marginBottom: '0.25rem' }}>
            {['SKU', 'Lead Time', 'Base Price', 'Your Price', 'Daily Demand', ''].map(h => (
              <div key={h} style={{ fontSize: '0.5rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{h}</div>
            ))}
          </div>
          {skus_covered.map((sku: any) => (
            <div key={sku.sku_id} style={{
              display: 'grid', gridTemplateColumns: '1fr 80px 80px 100px 100px 24px', gap: '0.75rem',
              padding: '0.625rem 0', borderBottom: '1px solid var(--border)', alignItems: 'center',
            }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  {sku.is_critical && <AlertTriangle size={10} style={{ color: '#DC2626', flexShrink: 0 }} />}
                  <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#000' }}>{sku.sku_name}</span>
                </div>
                <div style={{ fontSize: '0.5625rem', color: 'var(--ink-4)', marginTop: '1px' }}>{sku.sku_code}</div>
              </div>
              <div style={{ fontSize: '0.75rem', color: '#000', fontWeight: 500 }}>{sku.lead_time_days}d</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>{formatINR(sku.unit_cost_inr)}</div>
              <div style={{ fontSize: '0.75rem', fontWeight: 600, color: sku.cost_premium_pct > 10 ? '#D29729' : '#000' }}>
                {formatINR(sku.adjusted_unit_cost_inr)}
                <span style={{ fontSize: '0.5rem', color: 'var(--ink-4)', fontWeight: 400, marginLeft: '2px' }}>+{sku.cost_premium_pct.toFixed(0)}%</span>
              </div>
              <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                {sku.daily_demand_avg.toFixed(0)} units/day
              </div>
              <CheckCircle2 size={14} style={{ color: '#059669' }} />
            </div>
          ))}
        </div>
      </div>

      {/* Ordering guidance + performance */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.875rem' }}>

        {/* Ordering guidance */}
        <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.625rem', padding: '1rem 1.25rem' }}>
          <h2 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#166534', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Ordering Guidance
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
            {[
              { label: 'Min. order qty', value: `${contact.moq.toLocaleString()} units` },
              { label: 'Payment terms', value: contact.paymentTerms },
              { label: 'Delivery window', value: `${supplier.alt_lead_time_days} days from PO` },
              { label: 'Quality cert', value: `${(supplier.quality_score * 100).toFixed(0)}% · FSSAI compliant` },
              { label: 'Contact email', value: contact.email },
              { label: 'Procurement', value: `${supplier.city} — coordinate via procurement team` },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', gap: '0.75rem', fontSize: '0.75rem' }}>
                <span style={{ color: '#166534', fontWeight: 600, minWidth: '120px', flexShrink: 0 }}>{row.label}</span>
                <span style={{ color: '#14532D' }}>{row.value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Performance indicators */}
        <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '0.625rem', padding: '1rem 1.25rem' }}>
          <h2 style={{ fontSize: '0.625rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.75rem' }}>
            Performance Indicators
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
            {[
              { label: 'On-time delivery', value: supplier.reliability_score, color: reliabilityColor },
              { label: 'Quality score', value: supplier.quality_score, color: qualityColor },
              { label: 'Order fill rate', value: Math.min(supplier.reliability_score + 0.05, 1), color: '#2563EB' },
            ].map(item => (
              <div key={item.label}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span style={{ fontSize: '0.75rem', color: 'var(--ink-3)', fontWeight: 500 }}>{item.label}</span>
                </div>
                <ScoreBar value={item.value} color={item.color} />
              </div>
            ))}
            <div style={{ paddingTop: '0.5rem', borderTop: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
                <TrendingUp size={13} color="#059669" />
                <span>Operating since <strong style={{ color: '#000' }}>{contact.established}</strong> · {new Date().getFullYear() - contact.established} years in business</span>
              </div>
            </div>
          </div>
        </div>

      </div>

    </div>
  )
}
