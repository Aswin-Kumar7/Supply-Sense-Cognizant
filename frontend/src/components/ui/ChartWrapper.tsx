import { ReactNode } from 'react'

interface ChartWrapperProps {
  title: string
  children: ReactNode
  subtitle?: string
  action?: ReactNode
  accent?: 'blue' | 'green' | 'red' | 'amber' | 'none'
  noPad?: boolean
}

const accentColors = {
  blue:  { top: '#003087', dot: '#003087' },
  green: { top: '#4A8B50', dot: '#4A8B50' },
  red:   { top: '#c55b55', dot: '#c55b55' },
  amber: { top: '#B45309', dot: '#B45309' },
  none:  { top: '#DDE3ED', dot: 'var(--ink-4)' },
}

export function ChartWrapper({ title, children, subtitle, action, accent = 'none', noPad }: ChartWrapperProps) {
  const ac = accentColors[accent]

  return (
    <div
      className="relative overflow-hidden flex flex-col"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid #DDE3ED',
        borderRadius: '0.875rem',
        borderTop: `3px solid ${ac.top}`,
        boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between flex-shrink-0"
        style={{
          padding: '0.875rem 1.125rem 0.625rem',
          borderBottom: '1px solid #EEF0F5',
        }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span
            style={{
              display: 'inline-block',
              width: '7px',
              height: '7px',
              borderRadius: '50%',
              background: ac.dot,
              flexShrink: 0,
            }}
          />
          <div className="min-w-0">
            <h3 className="panel-title truncate">{title}</h3>
            {subtitle && <p className="panel-subtitle truncate">{subtitle}</p>}
          </div>
        </div>
        {action && <div className="flex-shrink-0 ml-3">{action}</div>}
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0" style={{ padding: noPad ? 0 : '0.875rem 1.125rem' }}>
        {children}
      </div>
    </div>
  )
}
