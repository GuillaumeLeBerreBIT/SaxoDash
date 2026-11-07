import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from '../api/client'
import { useStartSession } from '../api/queries'
import { AuthError, AuthField, AuthShell, AuthSubmit, authLinkClass } from '../components/auth/AuthShell'
import { RETRYABLE, TOO_MANY_ATTEMPTS, fieldErrors, isRefusal, isThrottled } from '../lib/authErrors'

const EMAIL_HINT = "We only use this to send you a password reset link. A typo means you can't reset it."

const SIGNUP_FIELDS = ['email', 'username', 'password']
const MISMATCH = "Passwords don't match."
const UNPLACED = 'Could not create the account. Try again.'

export default function Signup() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [confirmation, setConfirmation] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const startSession = useStartSession()

  function clearMismatch() {
    setErrors((current) => (current.confirmation ? { ...current, confirmation: undefined } : current))
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setNotice(null)
    if (password !== confirmation) {
      setErrors({ confirmation: MISMATCH })
      return
    }
    setErrors({})
    setBusy(true)
    try {
      await signup({ email, username, password, website })
      startSession()
      navigate('/')
    } catch (failure) {
      if (isThrottled(failure)) {
        setNotice(TOO_MANY_ATTEMPTS)
      } else if (isRefusal(failure)) {
        const fields = fieldErrors(failure)
        setErrors(fields)
        const unplaced = Object.keys(fields).some((key) => !SIGNUP_FIELDS.includes(key))
        const general = fields.non_field_errors ?? failure.detail
        if (general) setNotice(general)
        else if (unplaced || Object.keys(fields).length === 0) setNotice(UNPLACED)
      } else {
        setNotice(RETRYABLE)
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Create your SaxoDash account" onSubmit={handleSubmit}>
      <AuthField
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        hint={EMAIL_HINT}
        error={errors.email}
        required
      />
      <AuthField
        label="Username"
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        autoComplete="username"
        error={errors.username}
        required
      />
      <AuthField
        label="Password"
        type="password"
        value={password}
        onChange={(e) => {
          setPassword(e.target.value)
          clearMismatch()
        }}
        autoComplete="new-password"
        error={errors.password}
        required
      />
      <AuthField
        label="Confirm password"
        type="password"
        value={confirmation}
        onChange={(e) => {
          setConfirmation(e.target.value)
          clearMismatch()
        }}
        autoComplete="new-password"
        error={errors.confirmation}
        required
      />
      <div aria-hidden="true" className="absolute left-[-9999px] h-0 w-0 overflow-hidden">
        <input
          name="website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={website}
          onChange={(e) => setWebsite(e.target.value)}
        />
      </div>
      {notice && <AuthError>{notice}</AuthError>}
      <AuthSubmit busy={busy}>Create account</AuthSubmit>
      <p className="text-center text-[var(--fig-xs)] text-ink-2">
        Already have an account? <Link to="/login" className={authLinkClass}>Sign in</Link>
      </p>
    </AuthShell>
  )
}
