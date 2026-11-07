import { useId } from 'react'
import { LineChart } from 'lucide-react'
import { Button, Input } from '../ui'

export function AuthShell({ title, onSubmit, children }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-page px-4 py-8">
      <form
        onSubmit={onSubmit}
        className="flex w-full max-w-80 flex-col gap-4 bg-pane border border-line rounded-lg p-6"
      >
        <div className="flex flex-col items-center gap-2 mb-1">
          <div className="w-9 h-9 rounded-md bg-accent-subtle border border-line flex items-center justify-center text-accent">
            <LineChart size={18} strokeWidth={2} />
          </div>
          <h1 className="text-[var(--fig-md)] font-medium tracking-tight text-ink text-center">{title}</h1>
        </div>
        {children}
      </form>
    </div>
  )
}

export function AuthField({ label, error, hint, describedBy, ...inputProps }) {
  const id = useId()
  const messageId = `${id}-message`
  const ids = [error || hint ? messageId : null, describedBy].filter(Boolean).join(' ')
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-[var(--fig-xs)] text-ink-2">{label}</label>
      <Input
        id={id}
        aria-invalid={error || inputProps['aria-invalid'] ? true : undefined}
        aria-describedby={ids || undefined}
        className="h-11 w-full text-[var(--fig-sm)] focus:border-accent focus:ring-1 focus:ring-focus"
        {...inputProps}
      />
      {error ? (
        <p id={messageId} className="text-[var(--fig-xs)] text-error">{error}</p>
      ) : hint ? (
        <p id={messageId} className="text-[var(--fig-xs)] text-ink-3">{hint}</p>
      ) : null}
    </div>
  )
}

export function AuthError({ id, children }) {
  return (
    <p id={id} role="alert" className="text-[var(--fig-xs)] text-error">
      {children}
    </p>
  )
}

export function AuthSubmit({ busy, children }) {
  return (
    <Button type="submit" variant="primary" disabled={busy} className="h-11 w-full text-[var(--fig-sm)]">
      {children}
    </Button>
  )
}

export const authLinkClass = 'text-accent underline underline-offset-2 hover:no-underline'
