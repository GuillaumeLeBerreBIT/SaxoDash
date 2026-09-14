import { Link } from 'react-router-dom'

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-zinc-950 text-center">
      <h1 className="text-[var(--fig-2xl)] font-semibold tracking-tight text-zinc-50">404</h1>
      <p className="text-[var(--fig-sm)] text-zinc-500">This page doesn't exist.</p>
      <Link
        to="/"
        className="mt-2 rounded-md bg-blue-500 hover:bg-blue-400 transition-colors duration-200 px-4 py-2 text-[var(--fig-sm)] font-medium text-white"
      >
        Back to Dashboard
      </Link>
    </div>
  )
}
