import { Component } from 'react'
import type { ErrorInfo, ReactNode } from 'react'

interface Props {
  children: ReactNode
}

interface State {
  hasError: boolean
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info.componentStack)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <main className="error-shell">
        <div className="error-card">
          <div className="loading-mark">L</div>
          <span className="overline">Kartuli Labs workspace</span>
          <h1>Something went wrong.</h1>
          <p>Reload the page to get back to your workspace.</p>
          <div className="error-actions">
            <button type="button" className="button button-primary" onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </main>
    )
  }
}
