import { Link } from 'react-router-dom'

const LINK_CLASS = 'inline-flex items-baseline justify-end gap-1.5 num font-mono text-zinc-300 hover:text-blue-300'

export const None = () => <span className="text-zinc-600">—</span>

export function OwnershipLink({ to, label, children }) {
  return (
    <Link to={to} aria-label={label} title={label} className={LINK_CLASS}>
      {children}
    </Link>
  )
}
