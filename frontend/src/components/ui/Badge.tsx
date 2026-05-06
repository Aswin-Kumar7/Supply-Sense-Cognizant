import type { RiskLevel } from '../../types'

interface BadgeProps {
  level: RiskLevel | string
  label?: string
  className?: string
}

export function Badge({ level, label, className = '' }: BadgeProps) {
  const cls = `badge-${level} ${className}`
  return (
    <span className={cls}>
      {label ?? level}
    </span>
  )
}

export function RiskDot({ level }: { level: RiskLevel | string }) {
  const colors: Record<string, string> = {
    critical: '#ef4444',
    high:     '#f59e0b',
    medium:   '#3b82f6',
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
        boxShadow: `0 0 5px ${color}80`,
        flexShrink: 0,
      }}
    />
  )
}
