import type { RiskLevel } from '../../types'

interface BadgeProps {
  level: RiskLevel | string
  label?: string
  className?: string
}

export function Badge({ level, label, className = '' }: BadgeProps) {
  const normalizedLevel = (typeof level === 'string' ? level.toLowerCase() : level) || 'neutral'
  const cls = `badge badge-${normalizedLevel} ${className}`
  return (
    <span className={cls}>
      {label ?? level}
    </span>
  )
}

export function RiskDot({ level }: { level: RiskLevel | string }) {
  const colors: Record<string, string> = {
    critical: '#c55b55',
    high:     '#f59e0b',
    medium:   '#52bde0',
    low:      '#10b981',
  }
  const color = colors[level] ?? '#475569'
  return (
    <span
      style={{
        display: 'inline-block',
        width: '6px',
        height: '6px',
        borderRadius: '50%',
        background: color,
        flexShrink: 0,
      }}
    />
  )
}
