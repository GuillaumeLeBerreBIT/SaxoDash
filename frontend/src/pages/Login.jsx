import { useState } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { LineChart } from 'lucide-react'
import { login } from '../api/client'

export default function Login() {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const navigate = useNavigate()
  const location = useLocation()

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    try {
      await login(username, password)
      navigate(location.state?.from?.pathname ?? '/')
    } catch {
      setError('Invalid username or password')
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-page">
      <form
        onSubmit={handleSubmit}
        className="flex w-80 flex-col gap-4 bg-pane border border-line rounded-lg p-6"
      >
        <div className="flex flex-col items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-md bg-accent-subtle border border-line flex items-center justify-center text-accent">
            <LineChart size={18} strokeWidth={2} />
          </div>
          <h1 className="text-[var(--fig-md)] font-medium tracking-tight text-ink">Sign in to SaxoDash</h1>
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="login-username" className="text-[var(--fig-xs)] text-ink-2">Username</label>
          <input
            id="login-username"
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? true : undefined}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="Username"
            autoComplete="username"
            className="rounded-md border border-line-input bg-pane px-3 h-11 text-[var(--fig-sm)] text-ink placeholder:text-ink-3 outline-none focus:border-accent focus:ring-1 focus:ring-focus"
          />
        </div>
        <div className="flex flex-col gap-1">
          <label htmlFor="login-password" className="text-[var(--fig-xs)] text-ink-2">Password</label>
          <input
            id="login-password"
            aria-describedby={error ? 'login-error' : undefined}
            aria-invalid={error ? true : undefined}
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Password"
            autoComplete="current-password"
            className="rounded-md border border-line-input bg-pane px-3 h-11 text-[var(--fig-sm)] text-ink placeholder:text-ink-3 outline-none focus:border-accent focus:ring-1 focus:ring-focus"
          />
        </div>
        {error && <p id="login-error" role="alert" className="text-[var(--fig-xs)] text-error">{error}</p>}
        <button
          type="submit"
          className="rounded-md bg-accent hover:bg-accent-hover transition-colors duration-200 h-11 text-[var(--fig-sm)] font-medium text-on-accent"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
