import { Link } from 'react-router-dom'

import { COMPACT_ROWS, leadReason, reasonParts } from '../../lib/discover'
import { researchHref } from '../../lib/research'
import { Card, DayChange, EmptyState, InstrumentLogo, LetterAvatar } from '../ui'
import ShelfHeader from './ShelfHeader'

function LeadReason({ reason }) {
  if (!reason) return null
  const { label, value } = reasonParts(reason)
  return (
    <span className="ml-auto flex min-w-0 items-baseline justify-end gap-1 text-[var(--fig-xs)]">
      <span title={label} className="min-w-0 truncate text-zinc-500">{label}</span>{' '}
      <span className="num shrink-0 whitespace-nowrap font-mono text-zinc-200">{value}</span>
    </span>
  )
}

export default function LensColumn({ shelf }) {
  const rows = shelf.items.slice(0, COMPACT_ROWS)
  return (
    <Card className="min-w-0 space-y-3">
      <ShelfHeader shelf={shelf} shown={rows.length} />
      {shelf.total === 0 ? (
        <EmptyState title={shelf.empty} className="py-4" />
      ) : (
        <ul aria-label={`${shelf.title} stocks`}>
          {rows.map((item) => (
            <li key={`${item.uic}:${item.asset_type}`} className="border-t border-white/[0.04] first:border-t-0">
              <Link
                to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
                className="flex min-w-0 items-center gap-2 py-2 rounded hover:bg-white/[0.03] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
              >
                <InstrumentLogo symbol={item.ticker} size={16} className="rounded" fallback={<LetterAvatar symbol={item.ticker} size={16} />} />
                <span className="w-14 shrink-0 text-[var(--fig-sm)] font-semibold text-zinc-100">{item.ticker}</span>
                <DayChange value={item.change_1d} className="shrink-0 text-[var(--fig-xs)]" />
                <LeadReason reason={leadReason(item, shelf.sort)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
