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
    <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1.25rem' }}>
        <div style={{ padding: '8px', background: '#F8FAFC', border: '1px solid #E2E8F0', borderRadius: '8px', color: '#0F172A', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Icon size={16} />
        </div>
        <h2 style={{ fontSize: '0.8125rem', fontWeight: 700, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          {title}
        </h2>
      </div>
      <div style={{ fontSize: '0.875rem', color: '#475569', lineHeight: 1.6, fontWeight: 500 }}>
        {children}
      </div>
    </div>
  )
}

/* ── FAQ Item ───────────────────────────────────────────────────────── */
function FAQItem({ q, a }: { q: string, a: string }) {
  return (
    <div style={{ padding: '1.25rem 0', borderBottom: '1px solid #F1F5F9' }}>
      <div style={{ fontSize: '0.875rem', fontWeight: 700, color: '#0F172A', marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
        <Info size={14} color="#64748B" /> {q}
      </div>
      <div style={{ fontSize: '0.8125rem', color: '#64748B', lineHeight: 1.5, fontWeight: 500 }}>
        {a}
      </div>
    </div>
  )
}

export default function HelpPage() {
  const navigate = useNavigate()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px', maxWidth: '1400px', margin: '0 auto', width: '100%', fontFamily: "'Inter', sans-serif" }}>
      
      {/* Enterprise Header */}
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', borderBottom: '1px solid #E2E8F0', paddingBottom: '16px', marginBottom: '8px' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginBottom: '8px' }}>
            <span 
              onClick={() => navigate('/')}
              style={{ color: '#64748B', fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'color 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.color = '#0F172A'}
              onMouseLeave={e => e.currentTarget.style.color = '#64748B'}
            >
              Dashboard
            </span>
            <span style={{ color: '#94A3B8', fontSize: '0.75rem' }}>/</span>
            <span style={{ color: '#0F172A', fontSize: '0.75rem', fontWeight: 700 }}>System Guide</span>
          </div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 800, color: '#0F172A', letterSpacing: '-0.03em', lineHeight: 1.1, margin: 0 }}>
            System Intelligence Guide
          </h1>
          <p style={{ fontSize: '0.875rem', color: '#64748B', marginTop: '6px', marginBottom: 0 }}>
            Full system documentation and configuration blueprints
          </p>
        </div>
        <div style={{ 
          padding: '6px 12px', background: '#F8FAFC', border: '1px solid #E2E8F0', color: '#0F172A', borderRadius: '6px', fontSize: '0.6875rem', fontWeight: 800, 
          display: 'flex', alignItems: 'center', gap: '0.5rem', fontFamily: 'monospace'
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
              style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 650, color: '#334155', cursor: 'pointer', transition: 'background 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
              onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
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
              style={{ background: '#0F172A', color: '#FFFFFF', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 650, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', transition: 'background 150ms ease' }}
              onMouseEnter={e => e.currentTarget.style.background = '#334155'}
              onMouseLeave={e => e.currentTarget.style.background = '#0F172A'}
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
      <div style={{ marginTop: '1rem', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '12px', padding: '24px', boxShadow: '0 1px 3px rgba(0,0,0,0.02)' }}>
        <h2 style={{ fontSize: '0.9375rem', fontWeight: 800, color: '#0F172A', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <BookOpen size={16} /> Frequently Asked Questions
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
      <div style={{ marginTop: '1rem', padding: '16px', background: '#F8FAFC', borderRadius: '12px', border: '1px solid #E2E8F0', textAlign: 'center' }}>
        <span style={{ fontSize: '0.8125rem', color: '#64748B', fontWeight: 500 }}>
          Need technical assistance or custom integration? <strong style={{ color: '#0F172A', cursor: 'pointer', textDecoration: 'underline' }}>Contact System Support</strong>
        </span>
      </div>
    </div>
  )
}
