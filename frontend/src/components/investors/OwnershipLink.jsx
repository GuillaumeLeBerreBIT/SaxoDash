import { Link } from 'react-router-dom'

const LINK_CLASS = 'inline-flex items-baseline justify-end gap-1.5 num text-ink-2 hover:text-ink hover:underline'

export const None = () => <span className="text-ink-3">—</span>

export function OwnershipLink({ to, label, children }) {
  return (
    <Link to={to} aria-label={label} title={label} className={LINK_CLASS}>
      {children}
    </Link>
  )
}
