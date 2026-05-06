interface ErrorStateProps {
  message: string
  onRetry?: () => void
}

export function ErrorState({ message, onRetry }: ErrorStateProps) {
  return (
    <div
      className="flex flex-col items-center justify-center gap-2 text-center"
      style={{ padding: '2rem 1rem' }}
    >
      <div
        style={{
          width: '36px',
          height: '36px',
          borderRadius: '50%',
          background: 'rgba(239,68,68,0.1)',
          border: '1px solid rgba(239,68,68,0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '1rem',
        }}
      >
        ⚠
      </div>
      <p style={{ fontSize: '0.6875rem', color: '#64748b', maxWidth: '200px', lineHeight: 1.5 }}>
        {message}
      </p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="btn-ghost"
          style={{ fontSize: '0.5625rem', padding: '0.25rem 0.75rem' }}
        >
          Retry
        </button>
      )}
    </div>
  )
}
