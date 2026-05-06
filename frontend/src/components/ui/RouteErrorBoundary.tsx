import React from 'react'

interface RouteErrorBoundaryProps {
  children: React.ReactNode
}

interface RouteErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

/**
 * Route-level error boundary that catches failed lazy loads and other
 * route rendering errors. Provides a retry button that resets the error
 * state, allowing React.lazy to re-attempt the dynamic import.
 */
export class RouteErrorBoundary extends React.Component<
  RouteErrorBoundaryProps,
  RouteErrorBoundaryState
> {
  constructor(props: RouteErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): RouteErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error('[RouteErrorBoundary] Failed to load route:', error, errorInfo)
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center gap-4 p-12 min-h-[300px]">
          <div className="w-12 h-12 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center text-xl">
            ⚠
          </div>
          <h2 className="text-sm font-medium text-slate-300">
            Failed to load page
          </h2>
          <p className="text-xs text-slate-500 max-w-xs text-center leading-relaxed">
            {this.state.error?.message || 'An unexpected error occurred while loading this page.'}
          </p>
          <button
            onClick={this.handleRetry}
            className="text-xs px-4 py-2 rounded bg-slate-700/50 border border-slate-600/50 text-slate-300 hover:bg-slate-700 hover:border-slate-500 transition-colors cursor-pointer"
          >
            Retry
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
