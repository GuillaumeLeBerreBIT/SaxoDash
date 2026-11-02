import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-page text-center">
      <h1 className="text-[var(--fig-2xl)] font-semibold tracking-tight text-ink">404</h1>
      <p className="text-[var(--fig-sm)] text-ink-3">This page doesn't exist.</p>
      <Link
        to="/"
        className="mt-2 rounded-md bg-accent hover:bg-accent-hover transition-colors duration-200 px-4 py-2 text-[var(--fig-sm)] font-medium text-on-accent"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
