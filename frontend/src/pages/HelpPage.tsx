import { useNavigate } from 'react-router-dom'
import { 
  BookOpen, 
  ShieldCheck, 
  Zap, 
  Database, 
  Scale, 
  Info,
  ArrowUpRight
} from 'lucide-react'

/* ── Help Section Component ────────────────────────────────────────── */
function HelpSection({ 
  icon: Icon, 
  title, 
  children 
}: { 
  icon: any, 
  title: string, 
  children: React.ReactNode 
}) {
  return (
    <div style={{ background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '1.5rem', boxShadow: 'var(--shadow-sm)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ padding: '8px', background: 'var(--bg-hover)', borderRadius: '6px', color: '#000' }}>
          <Icon size={18} />
        </div>
        <h2 style={{ fontSize: '0.875rem', fontWeight: 700, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h2>
      </div>
      <div style={{ fontSize: '0.875rem', color: 'var(--ink-2)', lineHeight: 1.6 }}>
        {children}
      </div>
    </div>
  )
}

/* ── FAQ Item ───────────────────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string, a: string }) {
  return (
    <div style={{ padding: '1.25rem 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 600, color: '#000', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Info size={14} color="var(--ink-4)" /> {q}
      </div>
      <div style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', lineHeight: 1.5 }}>
        {a}
      </div>
    </div>
  )
}

export default function HelpPage() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', maxWidth: '1400px' }}>
      
      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid var(--border)', paddingBottom: '1.5rem', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span 
              onClick={() => navigate('/')}
              style={{ color: 'var(--ink-4)', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '0.25rem' }}
            >
              Dashboard / Documentation
            </span>
          </div>
          <h1 style={{ fontSize: '1.875rem', fontWeight: 600, color: '#000000', letterSpacing: '-0.02em', lineHeight: 1.1 }}>
            System Intelligence Guide
          </h1>
        </div>
        <div style={{ 
          padding: '8px 16px', background: '#000', color: '#fff', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700, 
          display: 'flex', alignItems: 'center', gap: '0.5rem'
        }}>
          V1.4.2 STABLE
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
        
        <HelpSection icon={ShieldCheck} title="Risk Analysis Engine">
          SupplySense utilizes a multi-factor risk scoring algorithm to monitor supplier health. 
          Factors include <strong>Delivery Reliability</strong>, <strong>Disruption Severity</strong> (weather, strikes), 
          and <strong>Inventory Pressure</strong>. Scores are normalized between 0-100%, where higher percentages 
          indicate critical intervention requirements.
          <div style={{ marginTop: '1rem', display: 'flex', gap: '0.5rem' }}>
            <button 
              onClick={() => navigate('/risks')}
              style={{ background: 'none', border: '1px solid #000', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer' }}
            >
              Go to Analytics
            </button>
          </div>
        </HelpSection>

        <HelpSection icon={Scale} title="Configuring Weights">
          The risk engine's sensitivity is fully customizable. In the <strong>Engine Configuration</strong>, you can adjust 
          how much each factor contributes to the overall score. Changes are applied in real-time across all 
          dashboards. Ensure weights sum to 100% for mathematical consistency.
          <div style={{ marginTop: '1rem' }}>
            <button 
              onClick={() => navigate('/settings')}
              style={{ background: '#000', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              Configure Engine <ArrowUpRight size={12} />
            </button>
          </div>
        </HelpSection>

        <HelpSection icon={Zap} title="Live Data Streams">
          The platform maintains a persistent connection to the backend via Server-Sent Events (SSE). 
          This allows for real-time disruption alerts and score updates. The "Live" indicator in the 
          header confirms the status of the intelligence stream.
        </HelpSection>

        <HelpSection icon={Database} title="Data Synchronization">
          To optimize performance, SupplySense employs a multi-tier caching strategy. You can control 
          the <strong>Cache Buffer Duration</strong> in settings. Use the <strong>Refresh Engine</strong> 
          button in the top header to manually force a re-fetch of all active supply chain signals.
        </HelpSection>

      </div>

      {/* FAQ Section */}
      <div style={{ marginTop: '2rem', background: '#fff', border: '1px solid var(--border)', borderRadius: '8px', padding: '2rem' }}>
        <h2 style={{ fontSize: '1rem', fontWeight: 800, color: '#000', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1.5rem', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <BookOpen size={20} /> Frequently Asked Questions
        </h2>
        
        <FAQItem 
          q="What is the 'Preferred Alt' badge?" 
          a="It identifies alternate suppliers that have passed high-fidelity verification and have a lead-time compatibility of >90% with your primary vendor."
        />
        <FAQItem 
          q="How often is the risk score updated?" 
          a="Scores are recomputed every 30 seconds if the data is stale, or instantly upon any change in system weights or active disruption events."
        />
        <FAQItem 
          q="Can I export these reports?" 
          a="Currently, the 'Board Brief' feature allows for a professional print-ready executive summary. CSV/Excel export functionality is scheduled for V1.5."
        />
      </div>

      {/* Contact Strip */}
      <div style={{ marginTop: '1rem', padding: '1.5rem', background: 'var(--bg-hover)', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
        <span style={{ fontSize: '0.8125rem', color: 'var(--ink-3)', fontWeight: 500 }}>
          Need technical assistance or custom integration? <strong style={{ color: '#000', cursor: 'pointer', textDecoration: 'underline' }}>Contact System Support</strong>
        </span>
      </div>
    </div>
  )
}
