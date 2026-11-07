import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { signup } from '../api/client'
import { AuthError, AuthField, AuthShell, AuthSubmit, authLinkClass } from '../components/auth/AuthShell'
import { TOO_MANY_ATTEMPTS, fieldErrors, isThrottled } from '../lib/authErrors'

const EMAIL_HINT = "We only use this to send you a password reset link. A typo means you can't reset it."

export default function Signup() {
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [website, setWebsite] = useState('')
  const [errors, setErrors] = useState({})
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setErrors({})
    setNotice(null)
    setBusy(true)
    try {
      await signup({ email, username, password, website })
      navigate('/')
    } catch (failure) {
      if (isThrottled(failure)) {
        setNotice(TOO_MANY_ATTEMPTS)
      } else {
        const fields = fieldErrors(failure)
        setErrors(fields)
        const general = fields.non_field_errors ?? fields.detail
        if (general || Object.keys(fields).length === 0) {
          setNotice(general ?? 'Could not create the account. Try again.')
        }
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
        onChange={(e) => setPassword(e.target.value)}
        autoComplete="new-password"
        error={errors.password}
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
