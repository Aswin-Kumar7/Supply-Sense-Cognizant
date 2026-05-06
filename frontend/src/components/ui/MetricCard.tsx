import { ReactNode } from 'react'

interface MetricCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: 'up' | 'down' | 'neutral'
  icon?: ReactNode
  accent?: 'blue' | 'green' | 'red' | 'amber' | 'purple'
  suffix?: string
}

const accentMap = {
  blue:   { border: '#003087', bg: '#EEF2FF', icon: '#003087', iconBg: '#E8EFFE', value: '#003087' },
  green:  { border: '#047857', bg: '#F0FDF4', icon: '#047857', iconBg: '#ECFDF5', value: '#047857' },
  red:    { border: '#B91C1C', bg: '#FFF5F5', icon: '#B91C1C', iconBg: '#FEF2F2', value: '#B91C1C' },
  amber:  { border: '#B45309', bg: '#FFFDF0', icon: '#B45309', iconBg: '#FFFBEB', value: '#92400E' },
  purple: { border: '#6D28D9', bg: '#F5F3FF', icon: '#6D28D9', iconBg: '#EDE9FE', value: '#5B21B6' },
}

const trendConfig = {
  up:      { color: '#047857', arrow: '↑' },
  down:    { color: '#B91C1C', arrow: '↓' },
  neutral: { color: '#8896A7', arrow: '→' },
}

export function MetricCard({ title, value, subtitle, trend = 'neutral', icon, accent = 'blue', suffix }: MetricCardProps) {
  const ac = accentMap[accent]
  const tr = trendConfig[trend]

  return (
    <div
      className="relative overflow-hidden"
      style={{
        background: 'var(--bg-card)',
        border: '1px solid #DDE3ED',
        borderLeft: `4px solid ${ac.border}`,
        borderRadius: '0.875rem',
        padding: '1.125rem 1.125rem 1.125rem 1.25rem',
        boxShadow: '0 1px 3px rgba(0,0,0,0.07), 0 1px 2px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.2s',
      }}
    >
      {/* Subtle background tint */}
      <div
        style={{
          position: 'absolute',
          top: 0, right: 0,
          width: '100px', height: '100%',
          background: `linear-gradient(to left, ${ac.bg}, transparent)`,
          pointerEvents: 'none',
          opacity: 0.5,
        }}
      />

      <div className="flex items-start justify-between relative">
        <div className="flex-1 min-w-0">
          <p className="metric-label truncate">{title}</p>
          <div className="flex items-baseline gap-1 mt-1.5">
            <span className="metric-value" style={{ color: ac.value }}>{value}</span>
            {suffix && (
              <span style={{ fontSize: '0.8rem', color: '#8896A7', fontWeight: 500 }}>{suffix}</span>
            )}
          </div>
          {subtitle && (
            <p className="metric-sub flex items-center gap-1 mt-1">
              <span style={{ color: tr.color, fontSize: '0.7rem', fontWeight: 600 }}>{tr.arrow}</span>
              <span style={{ color: 'var(--ink-3)' }}>{subtitle}</span>
            </p>
          )}
        </div>

        {icon && (
          <div
            className="flex items-center justify-center flex-shrink-0 ml-3"
            style={{
              width: '38px',
              height: '38px',
              borderRadius: '10px',
              background: ac.iconBg,
              color: ac.icon,
              border: `1px solid ${ac.border}22`,
            }}
          >
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}
