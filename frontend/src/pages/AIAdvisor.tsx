import { PanelErrorBoundary } from '../components/ui/PanelErrorBoundary'
import { WhatIfChat } from '../components/panels/WhatIfChat'

export default function AIAdvisor() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      <div>
        <h1 style={{ fontSize: '1.375rem', fontWeight: 800, color: 'var(--ink-1)', letterSpacing: '-0.02em' }}>
          AI Advisor
        </h1>
        <p style={{ fontSize: '0.875rem', color: 'var(--ink-3)', marginTop: '0.25rem' }}>
          Ask what-if questions about suppliers, disruptions, financial exposure, or run scenario analysis.
          All financial figures are calculated by deterministic engines — never hallucinated.
        </p>
      </div>
      <div style={{ maxWidth: '760px' }}>
        <PanelErrorBoundary panelName="What-If Chat">
          <WhatIfChat />
        </PanelErrorBoundary>
      </div>
    </div>
  )
}
