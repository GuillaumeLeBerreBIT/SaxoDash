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
    <div className="flex min-h-screen items-center justify-center bg-zinc-950">
      <form
        onSubmit={handleSubmit}
        className="flex w-80 flex-col gap-4 bg-gradient-to-b from-zinc-900 to-zinc-900/70 border border-white/[0.06] border-t-white/[0.09] rounded-lg shadow-sm shadow-black/40 p-6"
      >
        <div className="flex flex-col items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <LineChart size={18} strokeWidth={2} />
          </div>
          <h1 className="text-[var(--fig-md)] font-medium tracking-tight text-zinc-50">Sign in to SaxoDash</h1>
        </div>
        <div className="flex flex-col gap-1">
        <label htmlFor="login-username" className="text-[var(--fig-xs)] text-zinc-400">Username</label>
        <input
          id="login-username"
          aria-describedby={error ? 'login-error' : undefined}
          aria-invalid={error ? true : undefined}
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="rounded-md border border-zinc-700/70 bg-zinc-900 px-3 h-11 text-[var(--fig-sm)] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
        />
        </div>
        <div className="flex flex-col gap-1">
        <label htmlFor="login-password" className="text-[var(--fig-xs)] text-zinc-400">Password</label>
        <input
          id="login-password"
          aria-describedby={error ? 'login-error' : undefined}
          aria-invalid={error ? true : undefined}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-md border border-zinc-700/70 bg-zinc-900 px-3 h-11 text-[var(--fig-sm)] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
        />
        </div>
        {error && <p id="login-error" role="alert" className="text-[var(--fig-xs)] text-red-400">{error}</p>}
        <button
          type="submit"
          className="rounded-md bg-blue-500 hover:bg-blue-400 transition-colors duration-200 h-11 text-[var(--fig-sm)] font-medium text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
