/**
 * ProvenanceTag
 * Small inline chip showing where this data is CURRENTLY coming from.
 * This is a temporary dev indicator — not the intended design method.
 *
 * Usage:
 *   <ProvenanceTag type="rule" />          → ⚡ Via Rule Engine
 *   <ProvenanceTag type="ai" />            → ✦ Via Claude
 *   <ProvenanceTag type="ai" label="..." /> → ✦ custom label
 */

type ProvenanceType = 'rule' | 'ai'

interface ProvenanceTagProps {
  type: ProvenanceType
  label?: string
  /** Size variant — defaults to 'sm' */
  size?: 'xs' | 'sm'
}

export function ProvenanceTag({ type, label, size = 'sm' }: ProvenanceTagProps) {
  const isRule = type === 'rule'
  const icon = isRule ? '⚡' : '✦'
  const text = label ?? (isRule ? 'Via Rule Engine' : 'Via Claude')

  const fontSize = size === 'xs' ? '0.5rem' : '0.5625rem'
  const padding = size === 'xs' ? '1px 5px' : '2px 6px'

  return (
    <span
      title={
        isRule
          ? 'Currently served by rule engine (fallback)'
          : 'Currently served by Claude AI'
      }
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '3px',
        fontSize,
        fontWeight: 700,
        padding,
        borderRadius: '4px',
        letterSpacing: '0.03em',
        background: isRule ? '#f0f9ff' : '#fdf4ff',
        color: isRule ? '#0369a1' : '#7c3aed',
        border: `1px solid ${isRule ? '#bae6fd' : '#e9d5ff'}`,
        lineHeight: 1,
        userSelect: 'none',
        whiteSpace: 'nowrap',
        verticalAlign: 'middle',
      }}
    >
      <span style={{ fontSize: size === 'xs' ? '0.5625rem' : '0.625rem', lineHeight: 1 }}>{icon}</span>
      {text}
    </span>
  )
}
