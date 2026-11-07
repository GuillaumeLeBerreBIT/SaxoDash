import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { useChangePassword, useMe, useSignOutEverywhere, useUpdateMe } from '../../api/queries'
import { fieldErrors, isThrottled, TOO_MANY_ATTEMPTS } from '../../lib/authErrors'
import { Alert, Button, Card, Input } from '../ui'

function Field({ label, error, hint, ...inputProps }) {
  const id = useId()
  const messageId = `${id}-message`
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[12px] font-semibold text-ink-2">{label}</label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error || hint ? messageId : undefined}
        className="w-full max-w-[420px]"
        {...inputProps}
      />
      {error ? (
        <p id={messageId} className="text-[12px] text-error">{error}</p>
      ) : hint ? (
        <p id={messageId} className="text-[12px] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

function Outcome({ failure, success }) {
  if (failure) return <Alert tone="warning"><span role="alert">{failure}</span></Alert>
  if (success) return <Alert tone="info"><span role="status">{success}</span></Alert>
  return null
}

function generalMessage(error, fields) {
  if (isThrottled(error)) return TOO_MANY_ATTEMPTS
  if (Object.keys(fields).length === 0) return 'Something went wrong. Try again.'
  return fields.non_field_errors ?? fields.detail ?? null
}

function ProfileForm({ me }) {
  const [username, setUsername] = useState(me.username)
  const [email, setEmail] = useState(me.email)
  const [currentPassword, setCurrentPassword] = useState('')
  const update = useUpdateMe()
  const emailChanged = email !== me.email
  const unchanged = username === me.username && !emailChanged
  const fields = update.error ? fieldErrors(update.error) : {}

  const submit = (event) => {
    event.preventDefault()
    const changes = {}
    if (username !== me.username) changes.username = username
    if (emailChanged) {
      changes.email = email
      changes.current_password = currentPassword
    }
    update.mutate(changes, { onSuccess: () => setCurrentPassword('') })
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label="Username" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" error={fields.username} />
      <Field
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        autoComplete="email"
        hint="Used only to send you a password reset link."
        error={fields.email}
      />
      {emailChanged ? (
        <Field
          label="Current password to change email"
          type="password"
          value={currentPassword}
          onChange={(e) => setCurrentPassword(e.target.value)}
          autoComplete="current-password"
          error={fields.current_password}
          required
        />
      ) : null}
      <Outcome failure={update.error ? generalMessage(update.error, fields) : null} success={update.isSuccess && unchanged ? 'Profile saved' : null} />
      <div>
        <Button type="submit" variant="primary" disabled={unchanged || update.isPending}>Save profile</Button>
      </div>
    </form>
  )
}

function PasswordForm() {
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const change = useChangePassword()
  const fields = change.error ? fieldErrors(change.error) : {}

  const submit = (event) => {
    event.preventDefault()
    change.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          setCurrentPassword('')
          setNewPassword('')
        },
      },
    )
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-3.5">
      <Field label="Current password" type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} autoComplete="current-password" error={fields.current_password} required />
      <Field label="New password" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} autoComplete="new-password" error={fields.new_password} required />
      <Outcome
        failure={change.error ? generalMessage(change.error, fields) : null}
        success={change.isSuccess ? 'Password changed. Your other sessions were signed out; this one stays signed in.' : null}
      />
      <div>
        <Button type="submit" variant="primary" disabled={change.isPending}>Change password</Button>
      </div>
    </form>
  )
}

function Sessions() {
  const navigate = useNavigate()
  const signOut = useSignOutEverywhere()
  return (
    <div className="flex flex-col gap-3">
      <p className="text-[14px] text-ink-2">Signs this browser and every other device out. You will need to sign in again.</p>
      {signOut.error ? <Alert tone="warning"><span role="alert">Could not sign out. Try again.</span></Alert> : null}
      <div>
        <Button variant="destructive" disabled={signOut.isPending} onClick={() => signOut.mutate(undefined, { onSuccess: () => navigate('/login') })}>
          Sign out everywhere
        </Button>
      </div>
    </div>
  )
}

export default function AccountSettings() {
  const { data: me, isError } = useMe()
  return (
    <div className="flex flex-col gap-[var(--sd-gap)]">
      <Card context="How you sign in" title="Profile">
        {me ? <ProfileForm me={me} /> : <p className="text-[14px] text-ink-2">{isError ? 'Could not load your profile.' : 'Loading…'}</p>}
      </Card>
      <Card context="Changing it signs your other devices out" title="Password">
        <PasswordForm />
      </Card>
      <Card context="Every device, including this one" title="Sessions">
        <Sessions />
      </Card>
    </div>
  )
}
