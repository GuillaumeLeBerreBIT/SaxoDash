import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { login } from '../api/client'
import { AuthError, AuthField, AuthShell, AuthSubmit, authLinkClass } from '../components/auth/AuthShell'
import { TOO_MANY_ATTEMPTS, isThrottled } from '../lib/authErrors'

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
    } catch (failure) {
      setError(isThrottled(failure) ? TOO_MANY_ATTEMPTS : 'Invalid username or password')
    }
  }

  const failed = error ? { 'aria-invalid': true, describedBy: 'login-error' } : {}

  return (
    <AuthShell title="Sign in to SaxoDash" onSubmit={handleSubmit}>
      <AuthField
        label="Email or username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        placeholder="Email or username"
        autoComplete="username"
        {...failed}
      />
      <AuthField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="Password"
        autoComplete="current-password"
        {...failed}
      />
      {error && <AuthError id="login-error">{error}</AuthError>}
      <AuthSubmit>Sign in</AuthSubmit>
      <div className="flex justify-between text-[var(--fig-xs)]">
        <Link to="/forgot-password" className={authLinkClass}>Forgot password?</Link>
        <Link to="/signup" className={authLinkClass}>Create an account</Link>
      </div>
    </AuthShell>
  )
}
