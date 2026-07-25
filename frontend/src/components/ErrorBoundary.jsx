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
        <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-center">
          <h1 className="text-[20px] font-medium tracking-tight text-zinc-50">Something went wrong</h1>
          <p className="text-[13px] text-zinc-500">Try reloading the page.</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-2 rounded-md bg-blue-500 hover:bg-blue-400 transition-colors duration-200 px-4 py-2 text-[13px] font-medium text-white"
          >
            Reload
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
