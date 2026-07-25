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
        className="flex w-80 flex-col gap-4 bg-gradient-to-b from-zinc-900 to-zinc-900/70 border border-white/[0.06] border-t-white/[0.09] rounded-xl shadow-sm shadow-black/40 p-6"
      >
        <div className="flex flex-col items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400">
            <LineChart size={18} strokeWidth={2} />
          </div>
          <h1 className="text-[16px] font-medium tracking-tight text-zinc-50">Sign in to SaxoDash</h1>
        </div>
        <input
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          placeholder="Username"
          autoComplete="username"
          className="rounded-md border border-zinc-700/70 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
        />
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          autoComplete="current-password"
          className="rounded-md border border-zinc-700/70 bg-zinc-900 px-3 py-2 text-[13px] text-zinc-100 placeholder:text-zinc-500 outline-none focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/30"
        />
        {error && <p className="text-[12px] text-red-400">{error}</p>}
        <button
          type="submit"
          className="rounded-md bg-blue-500 hover:bg-blue-400 transition-colors duration-200 py-2 text-[13px] font-medium text-white"
        >
          Sign in
        </button>
      </form>
    </div>
  )
}
