import { Link } from 'react-router-dom'
import { AlertTriangle, Info } from 'lucide-react'

import { researchHref } from '../../lib/research'

const PORTFOLIO_KINDS = new Set(['concentration', 'single_name', 'price_basis'])

function chipClass(severity) {
  return severity === 'warn'
    ? 'bg-amber-500/10 text-amber-300 border-amber-500/20'
    : 'bg-white/[0.04] text-zinc-300 border-white/[0.08]'
}

function Chip({ item }) {
  const Icon = item.severity === 'warn' ? AlertTriangle : Info
  const body = (
    <span
      className={`inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md border text-[11.5px] ${chipClass(
        item.severity,
      )}`}
    >
      <Icon size={12} />
      {item.text}
    </span>
  )
  if (item.kind === 'earnings_soon' && item.ticker) {
    return <Link to={researchHref(item.ticker, 'earnings')}>{body}</Link>
  }
  if (PORTFOLIO_KINDS.has(item.kind)) {
    return <Link to="/portfolio">{body}</Link>
  }
  return body
}

export default function AttentionBand({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-[12px] text-zinc-600">Nothing needs attention right now.</p>
  }
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((item) => (
        <Chip key={`${item.kind}:${item.text}`} item={item} />
      ))}
    </div>
  )
}
