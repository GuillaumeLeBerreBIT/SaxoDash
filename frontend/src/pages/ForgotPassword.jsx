import { useState } from 'react'
import { Link } from 'react-router-dom'
import { requestPasswordReset } from '../api/client'
import { AuthError, AuthField, AuthShell, AuthSubmit, authLinkClass } from '../components/auth/AuthShell'
import { RETRYABLE, TOO_MANY_ATTEMPTS, isRefusal, isThrottled } from '../lib/authErrors'

const FALLBACK_SENTENCE = 'If an account exists for that address, a link is on its way.'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [sentence, setSentence] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)

  async function handleSubmit(e) {
    e.preventDefault()
    setError(null)
    setBusy(true)
    try {
      const body = await requestPasswordReset(email)
      setSentence(body?.detail ?? FALLBACK_SENTENCE)
    } catch (failure) {
      if (isThrottled(failure)) setError(TOO_MANY_ATTEMPTS)
      else if (isRefusal(failure)) setSentence(failure.detail ?? FALLBACK_SENTENCE)
      else setError(RETRYABLE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Reset your password" onSubmit={handleSubmit}>
      <p role="status" className="text-[var(--fig-sm)] text-ink-2 empty:hidden">{sentence}</p>
      {!sentence && (
        <>
          <AuthField
            label="Email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
          />
          {error && <AuthError>{error}</AuthError>}
          <AuthSubmit busy={busy}>Send reset link</AuthSubmit>
        </>
      )}
      <Link to="/login" className={`${authLinkClass} text-center text-[var(--fig-xs)]`}>Back to sign in</Link>
    </AuthShell>
  )
}
