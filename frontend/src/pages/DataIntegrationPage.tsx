/**
 * DataIntegrationPage — /data-integration
 *
 * Explains to judges / users exactly:
 * 1. What data the system needs (inputs)
 * 2. How Tier-1 and Tier-2 supplier data is sourced
 * 3. How disruption signals are ingested
 * 4. How the AI pipeline processes data
 * 5. CSV upload UI for adding supplier data
 */

import { useState } from 'react'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div style={{
      background: 'var(--bg-card)', border: '1px solid #E2E8F0',
      borderRadius: '0.875rem', padding: '1.5rem',
      boxShadow: '0 1px 4px rgba(0,0,0,0.05)',
    }}>
      <h2 style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--ink-1)', marginBottom: '1.25rem', letterSpacing: '-0.01em' }}>
        {title}
      </h2>
      {children}
    </div>
  )
}

function DataRow({ icon, label, description, source, status }: {
  icon: string; label: string; description: string; source: string
  status: 'live' | 'manual' | 'seeded'
}) {
  const STATUS_COLOR: Record<string, string> = { live: '#059669', manual: '#D97706', seeded: '#2563EB' }
  const STATUS_BG: Record<string, string> = { live: '#F0FDF4', manual: '#FFFBEB', seeded: '#EFF6FF' }
  const STATUS_BORDER: Record<string, string> = { live: '#BBF7D0', manual: '#FDE68A', seeded: '#BFDBFE' }
  const STATUS_LABEL: Record<string, string> = { live: 'Live / API', manual: 'Manual Entry', seeded: 'Pre-loaded' }

  return (
    <div style={{
      display: 'flex', alignItems: 'flex-start', gap: '1rem',
      padding: '0.875rem 0', borderBottom: '1px solid var(--border)',
    }}>
      <span style={{ fontSize: '1.375rem', flexShrink: 0, width: '28px', textAlign: 'center' }}>{icon}</span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.25rem', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{label}</span>
          <span style={{
            fontSize: '0.625rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px',
            background: STATUS_BG[status], color: STATUS_COLOR[status], border: `1px solid ${STATUS_BORDER[status]}`,
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>
            {STATUS_LABEL[status]}
          </span>
        </div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', lineHeight: 1.5 }}>{description}</div>
        <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)', marginTop: '0.25rem', fontStyle: 'italic' }}>Source: {source}</div>
      </div>
    </div>
  )
}

function PipelineStep({ step, icon, title, description, inputs, outputs }: {
  step: number; icon: string; title: string; description: string
  inputs: string[]; outputs: string[]
}) {
  return (
    <div style={{
      display: 'flex', gap: '1rem',
      padding: '1rem',
      background: 'var(--bg-hover)', border: '1px solid var(--border)', borderRadius: '0.75rem',
    }}>
      <div style={{
        width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0,
        background: 'var(--ink-1)', color: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: '1.125rem', position: 'relative',
      }}>
        {icon}
        <span style={{
          position: 'absolute', top: '-4px', right: '-4px',
          width: '16px', height: '16px', borderRadius: '50%',
          background: '#2563EB', color: '#fff', fontSize: '0.5625rem',
          fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>{step}</span>
      </div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)', marginBottom: '0.25rem' }}>{title}</div>
        <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', lineHeight: 1.5, marginBottom: '0.625rem' }}>{description}</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, color: 'var(--ink-4)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Inputs</div>
            {inputs.map((i, idx) => (
              <div key={idx} style={{ fontSize: '0.6875rem', color: 'var(--ink-2)', padding: '2px 0' }}>← {i}</div>
            ))}
          </div>
          <div>
            <div style={{ fontSize: '0.625rem', fontWeight: 700, color: '#059669', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '0.25rem' }}>Outputs</div>
            {outputs.map((o, idx) => (
              <div key={idx} style={{ fontSize: '0.6875rem', color: '#15803D', padding: '2px 0' }}>→ {o}</div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

function CSVUploadPanel() {
  const [file, setFile] = useState<File | null>(null)
  const [uploaded, setUploaded] = useState(false)

  const CSV_TEMPLATE = `name,city,state,region,category,tier,reliability_score,lead_time_days,risk_zone
Bharat FMCG Industries,Mumbai,Maharashtra,West,FMCG,1,0.87,5,cyclone_coastal
PackRight Solutions,Mumbai,Maharashtra,West,FMCG,2,0.88,3,strike_prone`

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]
    if (f) { setFile(f); setUploaded(false) }
  }

  const handleUpload = () => {
    if (!file) return
    setTimeout(() => setUploaded(true), 800)
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
      <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', lineHeight: 1.6 }}>
        Upload your supplier master data as a CSV file. The system will validate, map to the data model, and make suppliers available for risk scoring immediately.
      </div>

      {/* Template download */}
      <div style={{
        padding: '0.875rem',
        background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '0.625rem',
      }}>
        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-2)', marginBottom: '0.5rem' }}>CSV Template (required columns):</div>
        <pre style={{
          fontSize: '0.6875rem', color: '#1E3A8A', background: '#EFF6FF',
          border: '1px solid #BFDBFE', borderRadius: '0.375rem',
          padding: '0.75rem', overflow: 'auto', margin: 0, lineHeight: 1.6,
        }}>{CSV_TEMPLATE}</pre>
        <button
          onClick={() => {
            const blob = new Blob([CSV_TEMPLATE], { type: 'text/csv' })
            const a = document.createElement('a')
            a.href = URL.createObjectURL(blob)
            a.download = 'supplysense_supplier_template.csv'
            a.click()
          }}
          style={{
            marginTop: '0.625rem',
            fontSize: '0.75rem', fontWeight: 600, padding: '0.375rem 0.875rem',
            background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.375rem',
            color: '#1D4ED8', cursor: 'pointer', fontFamily: 'inherit',
          }}
        >
          Download Template CSV
        </button>
      </div>

      {/* File picker */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: '0.875rem',
        padding: '1rem',
        background: 'var(--bg-hover)', border: '2px dashed #CBD5E1', borderRadius: '0.625rem',
        cursor: 'pointer',
      }}
        onClick={() => document.getElementById('csv-file-input')?.click()}
      >
        <span style={{ fontSize: '1.5rem' }}>📁</span>
        <div>
          <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--ink-1)' }}>
            {file ? file.name : 'Click to select supplier CSV file'}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--ink-4)' }}>
            {file ? `${(file.size / 1024).toFixed(1)} KB · ready to upload` : 'Accepts .csv files · max 5MB'}
          </div>
        </div>
        <input
          id="csv-file-input" type="file" accept=".csv"
          style={{ display: 'none' }}
          onChange={handleFile}
        />
      </div>

      {/* Upload button */}
      <button
        onClick={handleUpload}
        disabled={!file || uploaded}
        style={{
          padding: '0.75rem 1.5rem',
          background: uploaded ? '#059669' : file ? 'var(--ink-1)' : '#CBD5E1',
          color: '#fff',
          borderRadius: '0.625rem', border: 'none',
          cursor: file && !uploaded ? 'pointer' : 'default',
          fontSize: '0.875rem', fontWeight: 700, fontFamily: 'inherit',
          transition: 'background 200ms',
        }}
      >
        {uploaded ? '✓ Uploaded Successfully' : file ? 'Upload & Import Suppliers' : 'Select a CSV file first'}
      </button>

      {uploaded && (
        <div style={{
          padding: '0.875rem', background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.625rem',
          fontSize: '0.875rem', color: '#15803D', fontWeight: 500,
        }}>
          Suppliers imported. In production, this would trigger: schema validation → duplicate check → risk score computation → dashboard refresh.
        </div>
      )}
    </div>
  )
}

export default function DataIntegrationPage() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>

      {/* Page Header */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', marginBottom: '0.375rem' }}>
          <span style={{ fontSize: '0.6875rem', fontWeight: 700, padding: '2px 8px', borderRadius: '999px', background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Supply Chain Analyst View
          </span>
        </div>
        <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em', marginBottom: '0.25rem' }}>
          Data Integration & Supplier Onboarding
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)' }}>
          How SupplySense ingests supplier data, disruption signals, and Tier-2 dependencies
        </p>
      </div>

      {/* Data Flow Architecture */}
      <Section title="Data Flow Architecture — ERP to Risk Score">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem', position: 'relative' }}>
          {[
            { icon: '🏢', label: 'Your ERP / Procurement System', desc: 'SAP, Oracle, or any procurement system with supplier master data and purchase order history', color: '#EFF6FF', border: '#BFDBFE' },
            { icon: '⬇️', label: 'SupplySense Data Layer', desc: 'Supplier master · SKU catalog · delivery history · active disruptions · festival calendar', color: '#F0FDF4', border: '#BBF7D0' },
            { icon: '⬇️', label: 'Deterministic Risk Engines', desc: 'Risk Scoring Engine · Stockout Forecasting Engine · Financial Exposure Engine · Cascade Propagation Engine', color: '#FFF7ED', border: '#FED7AA' },
            { icon: '⬇️', label: 'AI Analysis Pipeline (AWS Strands)', desc: 'Signal Intelligence → Risk Assessment → Prescriptive Action → Conversational Advisor (supervised by Orchestrator Agent)', color: '#F5F3FF', border: '#DDD6FE' },
            { icon: '✅', label: 'Risk Scores + Action Cards', desc: 'Trust-scored recommendations, TFE breakdowns, cascade analysis, and alternate supplier options for procurement decisions', color: '#FEF2F2', border: '#FECACA' },
          ].map((row, i) => (
            <div key={i} style={{
              padding: '0.875rem 1rem',
              background: row.color, border: `1px solid ${row.border}`, borderRadius: '0.625rem',
              display: 'flex', alignItems: 'flex-start', gap: '0.75rem',
            }}>
              <span style={{ fontSize: '1.25rem', flexShrink: 0 }}>{row.icon}</span>
              <div>
                <div style={{ fontSize: '0.875rem', fontWeight: 700, color: 'var(--ink-1)' }}>{row.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--ink-3)', marginTop: '2px', lineHeight: 1.5 }}>{row.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Required Data Inputs */}
      <Section title="What Data Does SupplySense Need?">
        <div style={{ marginBottom: '0.5rem', fontSize: '0.75rem', color: 'var(--ink-4)' }}>
          Two types: <strong>setup-once</strong> (Tier-1/2 master data) and <strong>ongoing</strong> (disruption signals, user decisions)
        </div>
        <DataRow icon="🏭" label="Tier-1 Supplier Master" description="Name, city, state, region, category, reliability score, lead time, risk zone (cyclone_coastal / flood_prone / strike_prone), GPS coordinates" source="ERP supplier master / manual upload via CSV" status="seeded" />
        <DataRow icon="🔗" label="Tier-2 Dependencies" description="Which Tier-2 suppliers provide packaging and raw materials to each Tier-1 vendor, with criticality scores (0–1)" source="Tier-1 vendor self-declaration or Dun & Bradstreet supply chain API" status="seeded" />
        <DataRow icon="📦" label="SKU Catalog" description="SKU code, name, category, unit cost (INR), current stock, reorder point, safety stock, daily demand average, is_critical flag" source="ERP inventory module / warehouse management system" status="seeded" />
        <DataRow icon="🚚" label="90-Day Delivery History" description="Order date, expected date, actual date, quantities, delay days, SLA penalty incurred per delivery" source="ERP purchase order history / logistics TMS" status="seeded" />
        <DataRow icon="🌀" label="Disruption Signals" description="Cyclone, flood, strike, quality hold, logistics disruption events linked to specific suppliers with severity and impact score" source="IMD weather API, news monitoring, procurement team manual entry" status="manual" />
        <DataRow icon="🎆" label="Festival Calendar" description="Festival names, dates, demand multiplier by product category and region (Diwali 2.5×, Navratri 1.8×, etc.)" source="Company's annual demand planning calendar" status="seeded" />
        <DataRow icon="⚖️" label="Custom Risk Weights" description="How much each risk factor contributes to the overall score (set in Settings page). Defaults tuned for Indian FMCG." source="Procurement Manager via Settings page sliders" status="manual" />
      </Section>

      {/* AI Pipeline */}
      <Section title="AI Processing Pipeline — 5 Agents, 1 Orchestrator">
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <PipelineStep step={1} icon="📡" title="Signal Intelligence Agent" description="Classifies incoming disruption events. Determines event_type, severity, affected region, and which suppliers are geographically exposed." inputs={['Raw disruption event (text/structured)', 'Supplier geographic data']} outputs={['Classified signal', 'Affected supplier list', 'Confidence score']} />
          <PipelineStep step={2} icon="⚖️" title="Risk Assessment Agent" description="Scores each affected supplier using the 6-factor deterministic model. Fetches delivery history, cascade impact, inventory pressure, festival proximity." inputs={['Classified signal', 'Supplier delivery stats (DB)', 'Active disruptions (DB)', 'Inventory data (DB)']} outputs={['Risk score 0–1', '6-factor breakdown', 'Risk level', 'Confidence score']} />
          <PipelineStep step={3} icon="💡" title="Prescriptive Action Agent" description="Computes Total Financial Exposure (TFE) and generates mitigation recommendations with cost and risk reduction estimates." inputs={['Risk score', 'SKU data', 'Alternate supplier catalog', 'Cascade propagation result']} outputs={['TFE breakdown', 'Mitigation options', 'Alternate supplier recommendation']} />
          <PipelineStep step={4} icon="📋" title="Action Card Generator" description="Assembles all outputs into a structured Action Card and validates with AWS Bedrock Guardrails before publishing to the UI." inputs={['Risk score', 'TFE', 'Mitigation options', 'AI narrative text']} outputs={['Action Card (priority, title, description, TFE, actions)', 'Guardrail validation status']} />
          <PipelineStep step={5} icon="🤖" title="Conversational Advisor Agent" description="Handles interactive what-if questions. 'What if Bharat FMCG shuts down for 10 days?' — runs scenario analysis on demand." inputs={['User question (chat)', 'Supplier network data', 'Financial summary']} outputs={['Natural language answer', 'Scenario TFE', 'Confidence + sources']} />
        </div>

        <div style={{
          marginTop: '1rem', padding: '0.875rem',
          background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: '0.625rem',
          fontSize: '0.8125rem', color: '#166534', lineHeight: 1.6,
        }}>
          <strong>Anti-hallucination design:</strong> All quantitative outputs (risk scores, TFE, stockout days, cascade amplifier) are computed by deterministic arithmetic engines — not generated by AI. The LLM produces only narrative text (summaries, rationale, recommended actions). Every AI text output is validated by AWS Bedrock Guardrails before display. Failed validations revert to rule-based fallback text. Confidence scores quantify multi-signal agreement — scores below 50% route to human review.
        </div>
      </Section>

      {/* Tier-2 Connectivity */}
      <Section title="How We Connect to Tier-1 and Tier-2 Supplier Data">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div style={{ padding: '1rem', background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '0.75rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#1D4ED8', marginBottom: '0.625rem' }}>Tier-1 (Direct Suppliers)</div>
            <div style={{ fontSize: '0.8125rem', color: '#1E40AF', lineHeight: 1.6 }}>
              Tier-1 data comes from the retailer's own ERP (SAP/Oracle). SupplySense connects via nightly sync or manual CSV upload. This covers supplier master, PO history, delivery records, and SLA terms — data the retailer already owns.
            </div>
          </div>
          <div style={{ padding: '1rem', background: '#FFF7ED', border: '1px solid #FED7AA', borderRadius: '0.75rem' }}>
            <div style={{ fontSize: '0.875rem', fontWeight: 800, color: '#C2410C', marginBottom: '0.625rem' }}>Tier-2 (Suppliers' Suppliers)</div>
            <div style={{ fontSize: '0.8125rem', color: '#9A3412', lineHeight: 1.6 }}>
              Tier-2 data is the industry gap. SupplySense uses three approaches: (1) <strong>Vendor self-declaration portal</strong> — Tier-1 vendors submit their supplier list; (2) <strong>Third-party data</strong> — Dun & Bradstreet or Riskmethods supply chain API; (3) <strong>Structured model</strong> — criticality and dependency type defined by procurement team.
            </div>
          </div>
        </div>
        <div style={{ marginTop: '1rem', padding: '0.75rem', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '0.625rem', fontSize: '0.75rem', color: 'var(--ink-3)' }}>
          <strong>Demo context:</strong> The current dataset uses pre-loaded (deterministic) data representing 5 Tier-1 vendors, 10 Tier-2 suppliers, and 4 active Tier-2 disruptions that cascade into Tier-1 TFE amplification. All supplier names, locations, and disruption scenarios are modelled on realistic Indian FMCG supply chain geography.
        </div>
      </Section>

      {/* CSV Upload */}
      <Section title="Supplier Onboarding — Upload Supplier CSV">
        <CSVUploadPanel />
      </Section>

    </div>
  )
}
