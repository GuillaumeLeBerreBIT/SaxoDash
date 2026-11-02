import { Component } from 'react'

export default class ErrorBoundary extends Component {
  state = { hasError: false }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, info) {
    console.error('Unhandled error in app tree:', error, info)
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page text-center">
          <h1 className="text-[var(--fig-lg)] font-medium tracking-tight text-ink">Something went wrong</h1>
          <p className="text-[var(--fig-sm)] text-ink-3">Try reloading the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md bg-accent hover:bg-accent-hover transition-colors duration-200 px-4 py-2 text-[var(--fig-sm)] font-medium text-on-accent"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
