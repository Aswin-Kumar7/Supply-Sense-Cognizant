interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg'
  label?: string
}

export function LoadingSpinner({ size = 'md', label }: LoadingSpinnerProps) {
  const sizes = { sm: 16, md: 24, lg: 36 }
  const s = sizes[size]

  return (
    <div className="flex flex-col items-center justify-center gap-2" style={{ padding: '2rem' }}>
      <svg
        width={s}
        height={s}
        viewBox="0 0 24 24"
        fill="none"
        style={{ animation: 'spin 0.8s linear infinite' }}
      >
        <circle cx="12" cy="12" r="10" stroke="#1f2d45" strokeWidth="2.5" />
        <path
          d="M12 2a10 10 0 0 1 10 10"
          stroke="#52bde0"
          strokeWidth="2.5"
          strokeLinecap="round"
        />
      </svg>
      {label && (
        <span style={{ fontSize: '0.5625rem', color: 'var(--ink-2)', letterSpacing: '0.05em' }}>{label}</span>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
