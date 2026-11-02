import { Link } from 'react-router-dom'

import { COMPACT_ROWS, leadReason, reasonParts } from '../../lib/discover'
import { researchHref } from '../../lib/research'
import { Card, DayChange, EmptyState, InstrumentLogo, Tag } from '../ui'
import ShelfHeader from './ShelfHeader'
import Sparkline from './Sparkline'

function LeadReason({ reason }) {
  if (!reason) return null
  const { label, value } = reasonParts(reason)
  return (
    <Tag tone="neutral" className="ml-auto min-w-0 shrink-0 gap-1">
      <span title={label} className="min-w-0 truncate">{label}</span>{' '}
      <span className="num whitespace-nowrap">{value}</span>
    </Tag>
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
            <li key={`${item.uic}:${item.asset_type}`} className="border-t border-line first:border-t-0">
              <Link
                to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
                className="flex min-w-0 items-center gap-2 py-2 rounded hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
              >
                <InstrumentLogo symbol={item.ticker} size={20} />
                <span className="w-14 shrink-0 text-[13.5px] font-semibold text-ink">{item.ticker}</span>
                <span className="hidden w-16 shrink-0 sm:block">
                  <Sparkline values={item.sparkline} height={20} />
                </span>
                <DayChange value={item.change_1d} className="shrink-0 text-[12px]" />
                <LeadReason reason={leadReason(item, shelf.sort)} />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
