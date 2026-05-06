import React from 'react'

interface ErrorBoundaryProps {
  children: React.ReactNode
  fallback?: React.ReactNode
  panelName: string
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class PanelErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error(`[PanelErrorBoundary] Error in panel "${this.props.panelName}":`, error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback
      }

      return (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.75rem',
            padding: '2rem 1rem',
            background: '#0d1117',
            borderRadius: '0.5rem',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              background: 'rgba(248,113,113,0.1)',
              border: '1px solid rgba(248,113,113,0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1rem',
            }}
          >
            ⚠
          </div>
          <p
            style={{
              fontSize: '0.75rem',
              color: '#94a3b8',
              maxWidth: '240px',
              lineHeight: 1.5,
              margin: 0,
            }}
          >
            <span style={{ color: '#f87171', fontWeight: 500 }}>{this.props.panelName}</span> failed
            to render
          </p>
          {this.state.error && (
            <p
              style={{
                fontSize: '0.6875rem',
                color: '#64748b',
                maxWidth: '240px',
                lineHeight: 1.4,
                margin: 0,
              }}
            >
              {this.state.error.message}
            </p>
          )}
          <button
            onClick={this.handleRetry}
            style={{
              fontSize: '0.6875rem',
              padding: '0.375rem 1rem',
              background: 'rgba(148,163,184,0.1)',
              border: '1px solid rgba(148,163,184,0.2)',
              borderRadius: '0.25rem',
              color: '#94a3b8',
              cursor: 'pointer',
              transition: 'background 0.15s ease',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(148,163,184,0.2)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(148,163,184,0.1)'
            }}
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
