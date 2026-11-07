import { useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { confirmPasswordReset } from '../api/client'
import { useStartSession } from '../api/queries'
import { AuthError, AuthField, AuthShell, AuthSubmit, authLinkClass } from '../components/auth/AuthShell'
import { RETRYABLE, TOO_MANY_ATTEMPTS, fieldErrors, isRefusal, isThrottled } from '../lib/authErrors'

const INVALID_LINK = 'This reset link is invalid or has expired.'

export default function ResetPassword() {
  const [params] = useSearchParams()
  const uid = params.get('uid')
  const token = params.get('token')
  const [newPassword, setNewPassword] = useState('')
  const [fieldError, setFieldError] = useState(null)
  const [notice, setNotice] = useState(null)
  const [linkInvalid, setLinkInvalid] = useState(!uid || !token)
  const [busy, setBusy] = useState(false)
  const navigate = useNavigate()
  const startSession = useStartSession()

  async function handleSubmit(e) {
    e.preventDefault()
    setFieldError(null)
    setNotice(null)
    setBusy(true)
    try {
      await confirmPasswordReset({ uid, token, newPassword })
      startSession()
      navigate('/')
    } catch (failure) {
      const fields = fieldErrors(failure)
      if (isThrottled(failure)) setNotice(TOO_MANY_ATTEMPTS)
      else if (fields.new_password) setFieldError(fields.new_password)
      else if (isRefusal(failure) && failure.detail) setLinkInvalid(true)
      else setNotice(RETRYABLE)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell title="Choose a new password" onSubmit={handleSubmit}>
      {linkInvalid ? (
        <>
          <p className="text-[var(--fig-sm)] text-ink-2">{INVALID_LINK}</p>
          <Link to="/forgot-password" className={`${authLinkClass} text-center text-[var(--fig-sm)]`}>
            Request a new link
          </Link>
        </>
      ) : (
        <>
          <AuthField
            label="New password"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            autoComplete="new-password"
            error={fieldError}
            required
          />
          {notice && <AuthError>{notice}</AuthError>}
          <AuthSubmit busy={busy}>Set new password</AuthSubmit>
        </>
      )}
    </AuthShell>
  )
}
