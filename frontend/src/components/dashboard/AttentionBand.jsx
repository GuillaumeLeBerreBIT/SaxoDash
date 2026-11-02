import { Link } from 'react-router-dom'

import { researchHref } from '../../lib/research'
import { StatusDot } from '../ui'

const PORTFOLIO_KINDS = new Set(['concentration', 'single_name', 'price_basis'])
const THESIS_KINDS = new Set(['thesis_review_due', 'target_reached'])

function hrefFor(item) {
  if (item.kind === 'earnings_soon' && item.ticker) return researchHref(item.ticker, 'earnings')
  if (THESIS_KINDS.has(item.kind) && item.ticker) return researchHref(item.ticker, 'overview')
  if (PORTFOLIO_KINDS.has(item.kind)) return '/portfolio'
  return null
}

function Row({ item }) {
  const href = hrefFor(item)
  const body = (
    <>
      <StatusDot tone={item.severity === 'warn' ? 'warn' : 'off'} />
      <span className="min-w-0 flex-1 text-[13.5px] font-medium text-ink">{item.text}</span>
    </>
  )
  const row = 'flex items-center gap-3 min-h-11 py-2'
  return (
    <li className="border-t border-line first:border-t-0">
      {href ? (
        <Link to={href} className={`${row} -mx-2 px-2 rounded-lg hover:bg-hover`}>
          {body}
        </Link>
      ) : (
        <div className={row}>{body}</div>
      )}
    </li>
  )
}

export default function AttentionBand({ items }) {
  if (!items || items.length === 0) {
    return <p className="text-[13px] text-ink-3">Nothing needs attention right now.</p>
  }
  return (
    <ul>
      {items.map((item) => (
        <Row key={`${item.kind}:${item.text}`} item={item} />
      ))}
    </ul>
  )
}
