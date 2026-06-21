import { useState, useMemo, useCallback, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useQueryClient, useQuery } from '@tanstack/react-query'
import { ChevronLeft, RefreshCw, CheckCircle2, Info, AlertTriangle, ArrowLeft, List, Package, TrendingUp, Clock } from 'lucide-react'
import { useStockoutForecast, useSuppliers } from '../hooks/useQueries'
import { queryKeys } from '../hooks/queryKeys'
import { api } from '../services/api'

function formatINR(n: number) {
  if (n >= 100_000) return `₹${(n / 100_000).toFixed(1)}L`
  if (n >= 1_000)   return `₹${(n / 1_000).toFixed(0)}K`
  return `₹${n.toFixed(0)}`
}

const DURATION_OPTIONS = [
  'Temporary — revert when supplier recovers',
  'Permanent — switch to this alternate going forward',
]
const NOTIFICATION_ITEMS = [
  { id: 'procurement', label: 'Procurement team notified — PO raised with alternate supplier' },
  { id: 'warehouse',   label: 'Warehouse / fulfilment team briefed on incoming source change' },
  { id: 'sales',       label: 'Sales team notified (if product label / batch changes)' },
  { id: 'ecommerce',   label: 'E-commerce listings reviewed for supplier-specific details' },
  { id: 'finance',     label: 'Finance notified of cost premium impact' },
  { id: 'qa',          label: 'QA team alerted to inspect incoming batch from alternate' },
]

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

// Which alternate supplier was chosen for a given at-risk SKU
type SkuMapping = {
  alternateId: string         // alternate_suppliers.id (the mapping row)
  alternateSupplierId: string
  alternateSupplierName: string
  costPremiumPct: number
  qualityScore: number
  leadTimeDays: number
  quantityToOrder: string
  poNumber: string
}

export default function SubstituteSkusPage() {
  const { id: supplierId } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const { data: stockout } = useStockoutForecast()
  const { data: suppliersData } = useSuppliers()

  // ── Fetch the REAL alternate suppliers for this supplier ──────────────────
  // This API returns: for each SKU that the primary supplier provides,
  // which alternate supplier(s) can also supply that same SKU.
  const { data: alternatesData, isLoading: altLoading } = useQuery({
    queryKey: ['alternate-suppliers', supplierId],
    queryFn: () => api.getAlternateSuppliersDirect(supplierId!),
    enabled: !!supplierId,
    staleTime: 300_000,
  })

  const [mappings, setMappings]             = useState<Record<string, SkuMapping | null>>({})
  const [duration, setDuration]             = useState('')
  const [revertDate, setRevertDate]         = useState('')
  const [contactPerson, setContactPerson]   = useState('')
  const [notifications, setNotifications]   = useState<Record<string, boolean>>({})
  const [authorizedBy, setAuthorizedBy]     = useState('')
  const [note, setNote]                     = useState('')
  // Per-SKU escalation notes for products with no alternate supplier
  const [escalationNotes, setEscalationNotes]   = useState<Record<string, string>>({})
  const [saving, setSaving]                     = useState(false)
  const [done, setDone]                         = useState(false)
  const [submitError, setSubmitError]           = useState('')

  const supplier = suppliersData?.suppliers.find(s => s.id === supplierId)

  const atRiskSKUs = useMemo(() =>
    (stockout?.forecasts ?? [])
      .filter(f => f.supplier_name === supplier?.name)
      .sort((a, b) => a.days_to_stockout - b.days_to_stockout),
    [stockout, supplier]
  )

  // Index the alternates by sku_code for O(1) lookup
  // Each entry: sku_code → list of alternate suppliers who can supply that SKU
  const alternatesBySku = useMemo(() => {
    const map: Record<string, NonNullable<typeof alternatesData>['alternates']> = {}
    for (const alt of alternatesData?.alternates ?? []) {
      if (!map[alt.sku_code]) map[alt.sku_code] = []
      map[alt.sku_code].push(alt)
    }
    return map
  }, [alternatesData])

  const isTemporary = duration.startsWith('Temporary')

  // SKUs that have at least one approved alternate — these MUST be mapped
  const skusRequiringMapping = atRiskSKUs.filter(s => (alternatesBySku[s.sku_code] ?? []).length > 0)
  // SKUs with no approved alternates — excluded from the mapping requirement
  const skusWithNoAlternate  = atRiskSKUs.filter(s => (alternatesBySku[s.sku_code] ?? []).length === 0)

  // Ready to submit when all routable SKUs have a mapping chosen
  const allMapped = skusRequiringMapping.length === 0 ||
    skusRequiringMapping.every(s => mappings[s.sku_id] != null)

  const toggleNotification = (id: string) =>
    setNotifications(prev => ({ ...prev, [id]: !prev[id] }))

  // Dirty-state warning
  const isDirty = Object.keys(mappings).length > 0 || duration !== '' || authorizedBy !== ''
  useEffect(() => {
    if (!isDirty || done) return
    const handler = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [isDirty, done])

  const handleDone = useCallback(async () => {
    if (!supplierId) return
    if (!allMapped && skusRequiringMapping.length > 0) {
      setSubmitError('Please choose an alternate supplier for all routable products before saving.'); return
    }
    if (!duration) {
      setSubmitError('Please select a substitution duration before saving.'); return
    }
    if (isTemporary && !revertDate) {
      setSubmitError('Please enter a planned revert date for this temporary arrangement.'); return
    }
    setSubmitError('')
    setSaving(true)

    // Build the audit log string
    // Routed SKUs — those that have an alternate supplier mapped
    const substitutionLines = skusRequiringMapping
      .map(sku => {
        const m = mappings[sku.sku_id]
        if (!m) return null
        const qtyStr = m.quantityToOrder ? ` — ${m.quantityToOrder} units` : ''
        const costStr = `+${m.costPremiumPct.toFixed(1)}% cost`
        return `${sku.sku_name} (${sku.sku_code}) → ${m.alternateSupplierName} [${costStr}, quality ${(m.qualityScore * 100).toFixed(0)}%, ${m.leadTimeDays}d lead]${qtyStr}`
      })
      .filter(Boolean).join('; ')

    const poLines = skusRequiringMapping
      .map(sku => {
        const m = mappings[sku.sku_id]
        return m?.poNumber ? `${sku.sku_name}: ${m.poNumber}` : null
      })
      .filter(Boolean).join(', ')

    const quantityLines = skusRequiringMapping
      .map(sku => {
        const m = mappings[sku.sku_id]
        return m?.quantityToOrder ? `${sku.sku_name}: ${m.quantityToOrder} units` : null
      })
      .filter(Boolean).join(', ')

    // Unroutable SKUs — no approved alternate exists; log them as escalations
    const escalationLines = skusWithNoAlternate
      .map(sku => {
        const userNote = escalationNotes[sku.sku_id]?.trim()
        const noteStr = userNote ? ` — ${userNote}` : ' — no action taken'
        return `${sku.sku_name} (${sku.sku_code}): no approved alternate${noteStr}`
      })
      .join('; ')

    const checkedNotifs = NOTIFICATION_ITEMS
      .filter(n => notifications[n.id])
      .map(n => n.label).join('; ')

    const parts = [
      'Action taken: Substitute alternative SKUs',
      substitutionLines  ? `Substitutions: ${substitutionLines}`             : null,
      quantityLines      ? `Quantities: ${quantityLines}`                    : null,
      poLines            ? `PO references: ${poLines}`                       : null,
      escalationLines    ? `Escalations (no alternate): ${escalationLines}`  : null,
      duration           ? `Duration: ${duration}`                           : null,
      isTemporary && revertDate ? `Revert date: ${revertDate}`               : null,
      contactPerson.trim()? `Alternate supplier contact: ${contactPerson.trim()}` : null,
      checkedNotifs      ? `Stakeholders notified: ${checkedNotifs}`         : null,
      authorizedBy.trim()? `Authorized by: ${authorizedBy.trim()}`           : null,
      note.trim()        || null,
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
    supplierId, allMapped, skusRequiringMapping, skusWithNoAlternate, atRiskSKUs,
    mappings, escalationNotes, duration, isTemporary,
    revertDate, contactPerson, notifications, authorizedBy, note, queryClient,
  ])

  if (done) {
    return (
      <div style={{ maxWidth: 520, margin: '3rem auto', padding: '0 1rem', textAlign: 'center' }}>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: '#DCFCE7', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 1.25rem' }}>
          <CheckCircle2 size={32} color="#16a34a" />
        </div>
        <div style={{ fontSize: '1.125rem', fontWeight: 700, color: '#000', marginBottom: '0.5rem' }}>Alternate supplier routing logged</div>
        <div style={{ fontSize: '0.8125rem', color: '#6B7280', marginBottom: '2rem', lineHeight: 1.6 }}>
          SKU rerouting details saved to the activity log. The supplier has been removed from the active risk queue.
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
        <div style={{ width: 44, height: 44, borderRadius: 10, background: '#FEF3C7', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <RefreshCw size={22} color="#D97706" />
        </div>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: '0.5rem', fontWeight: 700, color: 'rgba(255,255,255,0.4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 3 }}>Route via Alternate Supplier</div>
          <div style={{ fontSize: '1.125rem', fontWeight: 800, color: '#fff' }}>{supplier?.name ?? '—'}</div>
          <div style={{ fontSize: '0.6875rem', color: 'rgba(255,255,255,0.45)', marginTop: 3 }}>
            Keep the same products flowing — but source them from pre-approved alternate suppliers
          </div>
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontSize: '0.45rem', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>SKUs to reroute</div>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: '#FDE68A', fontFamily: 'monospace', lineHeight: 1 }}>{atRiskSKUs.length}</div>
          <div style={{ fontSize: '0.5rem', color: 'rgba(255,255,255,0.3)', marginTop: 2 }}>products affected</div>
        </div>
      </div>

      {/* Explainer */}
      <div style={{ background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '0.875rem 1rem', display: 'flex', gap: '0.75rem' }}>
        <Info size={16} color="#D97706" style={{ flexShrink: 0, marginTop: 1 }} />
        <div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E', marginBottom: 4 }}>Same products — different supplier</div>
          <p style={{ fontSize: '0.8125rem', color: '#78350F', lineHeight: 1.6, margin: 0 }}>
            The products themselves stay the same — <strong>customers get the exact same SKU</strong>. You are only changing <em>who manufactures / supplies</em> them for this period. The alternates shown below are pre-approved vendors who are already qualified to supply each product.
          </p>
        </div>
      </div>

      {/* Per-SKU routing table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827', marginBottom: 2 }}>
            Choose an alternate supplier for each at-risk product
          </div>
          <div style={{ fontSize: '0.5625rem', color: '#6B7280' }}>
            Only pre-approved alternates are shown — vendors already qualified to supply each specific SKU
          </div>
        </div>

        {altLoading ? (
          <div style={{ padding: '2rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 72, borderRadius: 8 }} />)}
          </div>
        ) : atRiskSKUs.length === 0 ? (
          <div style={{ padding: '2rem', textAlign: 'center', color: '#6B7280', fontSize: '0.8125rem' }}>
            No stockout forecast data found for this supplier.
          </div>
        ) : (
          atRiskSKUs.map((sku, idx) => {
            const chosen = mappings[sku.sku_id]
            // Approved alternates for this specific SKU from the real alternate_suppliers table
            const skuAlternates = alternatesBySku[sku.sku_code] ?? []
            const noAlternates = skuAlternates.length === 0

            return (
              <div
                key={sku.sku_id}
                style={{ borderBottom: idx < atRiskSKUs.length - 1 ? '1px solid #F3F4F6' : 'none', padding: '1rem' }}
              >
                {/* SKU identity row */}
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.875rem' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                      <Package size={14} color="#DC2626" />
                      <span style={{ fontSize: '0.9375rem', fontWeight: 700, color: '#111827' }}>{sku.sku_name}</span>
                      <span style={{ fontSize: '0.5rem', fontWeight: 700, background: '#FEE2E2', color: '#DC2626', padding: '1px 6px', borderRadius: 99, textTransform: 'uppercase', letterSpacing: '0.04em' }}>At Risk</span>
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#6B7280', display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
                      <span>Code: <strong style={{ color: '#374151' }}>{sku.sku_code}</strong></span>
                      <span>Current stock: <strong style={{ color: '#374151' }}>{sku.current_stock.toLocaleString()} units</strong></span>
                      <span>Daily demand: <strong style={{ color: '#374151' }}>{Math.round(sku.adjusted_demand)}/day</strong></span>
                      <span>Stockout in: <strong style={{ color: sku.days_to_stockout <= 3 ? '#DC2626' : sku.days_to_stockout <= 7 ? '#D97706' : '#059669' }}>{sku.days_to_stockout}d</strong></span>
                      <span>Revenue at risk: <strong style={{ color: '#374151' }}>{formatINR(sku.revenue_at_risk_inr)}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Alternate supplier selector */}
                {noAlternates ? (
                  <div style={{ border: '1px solid #FDE68A', borderRadius: 10, overflow: 'hidden' }}>
                    <div style={{ padding: '0.75rem 1rem', background: '#FFFBEB', borderBottom: '1px solid #FDE68A', display: 'flex', alignItems: 'center', gap: 8 }}>
                      <AlertTriangle size={14} color="#D97706" />
                      <div>
                        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#92400E' }}>No pre-approved alternate on file for this product</div>
                        <div style={{ fontSize: '0.5625rem', color: '#78350F', marginTop: 1 }}>
                          This SKU will be logged as "escalation needed" — the rest of the products will still be rerouted
                        </div>
                      </div>
                    </div>
                    <div style={{ padding: '0.875rem 1rem', background: '#fff', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                      <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#374151', marginBottom: 2 }}>Recommended next steps for this product:</div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                        {[
                          { icon: '⚡', label: 'Expedite the current order', desc: 'Call the supplier and push for faster delivery of existing POs', path: `/risks/${supplierId}/expedite` },
                          { icon: '📦', label: 'Pre-order extra safety stock', desc: 'Place an emergency order with the primary supplier for more units', path: `/risks/${supplierId}/increase-stock` },
                          { icon: '🔍', label: 'Find an emergency source', desc: 'Manually identify and onboard a new supplier — raise a qualification request', path: `/alternate-suppliers` },
                          { icon: '📋', label: 'Accept & communicate the risk', desc: 'If stockout is unavoidable, alert sales and customer teams now', path: `/risks/${supplierId}/mitigation` },
                        ].map(opt => (
                          <button
                            key={opt.label}
                            onClick={() => navigate(opt.path)}
                            style={{
                              padding: '0.625rem 0.75rem',
                              border: '1px solid #E5E7EB',
                              borderRadius: 8,
                              background: '#FAFAFA',
                              display: 'flex',
                              gap: '0.5rem',
                              alignItems: 'flex-start',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'all 150ms ease',
                              outline: 'none',
                              fontFamily: 'inherit'
                            }}
                            onMouseEnter={e => {
                              e.currentTarget.style.background = '#F3F4F6';
                              e.currentTarget.style.borderColor = '#D1D5DB';
                            }}
                            onMouseLeave={e => {
                              e.currentTarget.style.background = '#FAFAFA';
                              e.currentTarget.style.borderColor = '#E5E7EB';
                            }}
                          >
                            <span style={{ fontSize: '0.875rem', flexShrink: 0 }}>{opt.icon}</span>
                            <div>
                              <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827', marginBottom: 2 }}>{opt.label}</div>
                              <div style={{ fontSize: '0.5625rem', color: '#6B7280', lineHeight: 1.5 }}>{opt.desc}</div>
                            </div>
                          </button>
                        ))}
                      </div>
                      <div style={{ marginTop: '0.375rem' }}>
                        <label style={{ fontSize: '0.5625rem', fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.05em', display: 'block', marginBottom: 4 }}>
                          Escalation note <span style={{ fontWeight: 400, color: '#9CA3AF', textTransform: 'none', letterSpacing: 0 }}>(saved to activity log)</span>
                        </label>
                        <textarea
                          value={escalationNotes[sku.sku_id] ?? ''}
                          onChange={e => setEscalationNotes(prev => ({ ...prev, [sku.sku_id]: e.target.value }))}
                          placeholder={`e.g. No alternate on file for ${sku.sku_name}. Procurement team asked to find and qualify a second supplier. Expedite action raised separately to close the immediate gap.`}
                          rows={2}
                          style={{ ...inputStyle, resize: 'none', borderColor: '#FDE68A' }}
                        />
                      </div>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
                    {/* Alternate option cards — one per qualified supplier */}
                    {skuAlternates.map((alt: NonNullable<typeof alternatesData>['alternates'][number]) => {
                      const isSelected = chosen?.alternateId === alt.alternate_id
                      return (
                        <label
                          key={alt.alternate_id}
                          style={{
                            display: 'flex', alignItems: 'flex-start', gap: '0.875rem',
                            padding: '0.875rem 1rem',
                            border: `2px solid ${isSelected ? '#000' : '#E5E7EB'}`,
                            borderRadius: 10,
                            background: isSelected ? '#000' : '#FAFAFA',
                            cursor: 'pointer',
                            transition: 'all 150ms ease',
                          }}
                        >
                          {/* Radio */}
                          <div style={{
                            width: 18, height: 18, borderRadius: '50%', flexShrink: 0,
                            border: `2px solid ${isSelected ? '#fff' : '#D1D5DB'}`,
                            background: isSelected ? '#fff' : 'transparent',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            marginTop: 2,
                          }}>
                            {isSelected && <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#000' }} />}
                          </div>
                          <input
                            type="radio"
                            name={`alt-${sku.sku_id}`}
                            style={{ display: 'none' }}
                            checked={isSelected}
                            onChange={() => setMappings(prev => ({
                              ...prev,
                              [sku.sku_id]: {
                                alternateId: alt.alternate_id,
                                alternateSupplierId: alt.supplier_id,
                                alternateSupplierName: alt.supplier_name,
                                costPremiumPct: alt.cost_premium_pct,
                                qualityScore: alt.quality_score,
                                leadTimeDays: alt.lead_time_days,
                                quantityToOrder: mappings[sku.sku_id]?.quantityToOrder ?? '',
                                poNumber: mappings[sku.sku_id]?.poNumber ?? '',
                              }
                            }))}
                          />

                          {/* Supplier details */}
                          <div style={{ flex: 1 }}>
                            <div style={{ fontSize: '0.875rem', fontWeight: 700, color: isSelected ? '#fff' : '#111827', marginBottom: 4 }}>
                              {alt.supplier_name}
                            </div>
                            <div style={{ fontSize: '0.6875rem', color: isSelected ? 'rgba(255,255,255,0.55)' : '#6B7280', marginBottom: 6 }}>
                              {alt.city}, {alt.region}
                            </div>
                            {/* Metrics row */}
                            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <TrendingUp size={11} color={isSelected ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} />
                                <span style={{ fontSize: '0.6875rem', color: isSelected ? '#FDE68A' : '#D97706', fontWeight: 700 }}>
                                  +{alt.cost_premium_pct.toFixed(1)}% cost
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <CheckCircle2 size={11} color={isSelected ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} />
                                <span style={{ fontSize: '0.6875rem', color: isSelected ? 'rgba(255,255,255,0.75)' : '#374151' }}>
                                  Quality: <strong>{(alt.quality_score * 100).toFixed(0)}%</strong>
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Clock size={11} color={isSelected ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} />
                                <span style={{ fontSize: '0.6875rem', color: isSelected ? 'rgba(255,255,255,0.75)' : '#374151' }}>
                                  Lead time: <strong>{alt.lead_time_days} days</strong>
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                <Package size={11} color={isSelected ? 'rgba(255,255,255,0.5)' : '#9CA3AF'} />
                                <span style={{ fontSize: '0.6875rem', color: isSelected ? 'rgba(255,255,255,0.75)' : '#374151' }}>
                                  Reliability: <strong>{(alt.reliability_score * 100).toFixed(0)}%</strong>
                                </span>
                              </div>
                            </div>
                          </div>

                          {/* Selection badge */}
                          {isSelected && (
                            <div style={{ flexShrink: 0, fontSize: '0.4375rem', fontWeight: 700, background: '#059669', color: '#fff', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em', textTransform: 'uppercase', alignSelf: 'flex-start' }}>
                              Selected
                            </div>
                          )}
                        </label>
                      )
                    })}

                    {/* Per-SKU order details — shown when an alternate is chosen */}
                    {chosen && (
                      <div style={{ marginTop: '0.25rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', padding: '0.875rem 1rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 8 }}>
                        <Field label="Quantity to order from alternate" hint="Units to source from this supplier">
                          <input
                            type="number"
                            min={0}
                            value={chosen.quantityToOrder}
                            onChange={e => setMappings(prev => ({
                              ...prev,
                              [sku.sku_id]: { ...prev[sku.sku_id]!, quantityToOrder: e.target.value }
                            }))}
                            placeholder={`Needed: ~${Math.ceil(sku.adjusted_demand * 14).toLocaleString()} (14d)`}
                            style={inputStyle}
                          />
                        </Field>
                        <Field label="PO / reference number" hint="Purchase order for this alternate">
                          <input
                            value={chosen.poNumber}
                            onChange={e => setMappings(prev => ({
                              ...prev,
                              [sku.sku_id]: { ...prev[sku.sku_id]!, poNumber: e.target.value }
                            }))}
                            placeholder="e.g. PO-2024-9120"
                            style={inputStyle}
                          />
                        </Field>
                        <div style={{ gridColumn: '1 / -1', fontSize: '0.625rem', color: '#166534' }}>
                          ✓ <strong>{chosen.alternateSupplierName}</strong> supplies the exact same product — <strong>{sku.sku_name}</strong> — at +{chosen.costPremiumPct.toFixed(1)}% cost with {chosen.leadTimeDays}-day lead time.
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )
          })
        )}
      </div>

      {/* Duration */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>
            Duration <span style={{ color: '#DC2626' }}>*</span>
          </div>
          <div style={{ fontSize: '0.5625rem', color: '#6B7280', marginTop: 2 }}>Is this a temporary arrangement or a permanent change?</div>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
            {DURATION_OPTIONS.map(opt => (
              <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '0.625rem 0.875rem', border: `2px solid ${duration === opt ? '#000' : '#E5E7EB'}`, borderRadius: 8, background: duration === opt ? '#000' : '#fff', flex: 1, minWidth: 220 }}>
                <input type="radio" name="duration" value={opt} checked={duration === opt} onChange={() => setDuration(opt)} style={{ display: 'none' }} />
                <div style={{ width: 16, height: 16, borderRadius: '50%', border: `2px solid ${duration === opt ? '#fff' : '#D1D5DB'}`, background: 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {duration === opt && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#fff' }} />}
                </div>
                <span style={{ fontSize: '0.8125rem', fontWeight: 500, color: duration === opt ? '#fff' : '#374151' }}>{opt}</span>
              </label>
            ))}
          </div>
          {isTemporary && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
              <Field label="Planned revert date" required hint="When primary supplier recovers — switch back">
                <input
                  type="date"
                  value={revertDate}
                  onChange={e => setRevertDate(e.target.value)}
                  style={{ ...inputStyle, borderColor: revertDate ? '#059669' : '#D1D5DB' }}
                />
              </Field>
            </div>
          )}
        </div>
      </div>

      {/* Stakeholder checklist */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827', marginBottom: 2 }}>Coordination checklist</div>
          <div style={{ fontSize: '0.5625rem', color: '#6B7280' }}>Check each action you have completed or confirmed</div>
        </div>
        <div style={{ padding: '1rem', display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {NOTIFICATION_ITEMS.map(item => (
            <label key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', padding: '0.25rem 0' }}>
              <div
                onClick={() => toggleNotification(item.id)}
                style={{ width: 18, height: 18, border: `2px solid ${notifications[item.id] ? '#059669' : '#D1D5DB'}`, borderRadius: 4, background: notifications[item.id] ? '#059669' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, cursor: 'pointer' }}
              >
                {notifications[item.id] && <CheckCircle2 size={11} color="#fff" />}
              </div>
              <span style={{ fontSize: '0.8125rem', color: '#374151' }}>{item.label}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Authorization */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
        <div style={{ padding: '0.75rem 1rem', borderBottom: '1px solid #E5E7EB', background: '#F9FAFB' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: 700, color: '#111827' }}>Authorization & notes</div>
        </div>
        <div style={{ padding: '1rem', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <Field label="Contact person at alternate supplier" hint="Who confirmed they can fulfil the order">
            <input value={contactPerson} onChange={e => setContactPerson(e.target.value)} placeholder="e.g. Suresh Iyer, Regional Sales Head" style={inputStyle} />
          </Field>
          <Field label="Decision authorized by">
            <input value={authorizedBy} onChange={e => setAuthorizedBy(e.target.value)} placeholder="e.g. Ravi Shankar, VP Procurement" style={inputStyle} />
          </Field>
          <Field label="Additional notes" col="1 / -1">
            <textarea value={note} onChange={e => setNote(e.target.value)} placeholder="e.g. QA team asked to inspect first batch from alternate. Will revert to primary as soon as cyclone disruption clears." rows={3} style={{ ...inputStyle, resize: 'none' }} />
          </Field>
        </div>
      </div>

      {submitError && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 8, padding: '0.625rem 1rem', display: 'flex', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={14} color="#DC2626" />
          <span style={{ fontSize: '0.75rem', color: '#DC2626', fontWeight: 600 }}>{submitError}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
        <button
          onClick={handleDone}
          disabled={saving}
          style={{
            padding: '0.75rem 1.5rem', background: '#D97706', color: '#fff',
            border: 'none', borderRadius: 8, fontWeight: 700, fontSize: '0.9375rem',
            cursor: saving ? 'wait' : 'pointer',
            fontFamily: 'inherit', display: 'flex', alignItems: 'center', gap: 8,
          }}
        >
          <CheckCircle2 size={18} />
          {saving ? 'Saving…' : 'Confirm Routing & Mark as Done'}
        </button>
        <span style={{ fontSize: '0.6875rem', color: '#9CA3AF' }}>
          {!allMapped && atRiskSKUs.length > 0
            ? `Select an alternate for all ${atRiskSKUs.length} products to enable submit`
            : 'This will remove the supplier from the active risk queue'}
        </span>
      </div>
    </div>
  )
}
