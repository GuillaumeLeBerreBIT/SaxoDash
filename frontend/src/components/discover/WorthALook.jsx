import { Link } from 'react-router-dom'

import { useWorthALook } from '../../api/queries'
import { fmtMoney } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { actionLabel } from '../../lib/verdicts'
import { Card, EmptyState, InstrumentLogo, Skeleton } from '../ui'

const CONTEXT = 'Strong company, price in its own cheap range · rules, not advice'

const worthALookLine = (stock) =>
  `${fmtMoney(stock.last_close, 'USD')}, ${Math.abs(stock.discount_pct).toFixed(0)}% under the ${fmtMoney(stock.cheap_below, 'USD')} where it stops being cheap`

function Row({ stock }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        to={researchHref(stock.ticker)}
        className="flex min-w-0 items-center gap-2.5 py-2 rounded hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <InstrumentLogo symbol={stock.ticker} size={22} />
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline gap-2 min-w-0">
            <span className="text-[13.5px] font-semibold text-ink">{stock.ticker}</span>
            <span className="truncate text-[12px] text-ink-3" title={stock.name}>{stock.name}</span>
          </span>
          <span className="block text-[12px] text-ink-2 num">{worthALookLine(stock)}</span>
        </span>
        <span className={`shrink-0 text-[13px] font-semibold ${stock.action === 'hold' ? 'text-ink-2' : 'text-up'}`}>{actionLabel(stock)}</span>
      </Link>
    </li>
  )
}

export default function WorthALook({ className = '' }) {
  const { data, isLoading, error } = useWorthALook()
  const stocks = data?.stocks ?? []
  return (
    <Card className={className} context={CONTEXT} title="Worth a look today">
      {isLoading ? <Skeleton className="h-24" /> : null}
      {error ? <p className="text-[13px] text-ink-3">Could not load today’s list.</p> : null}
      {data && stocks.length === 0 ? (
        <EmptyState title="Nothing is both strong and cheap today" hint="The list fills when a company that passes the quality checks trades in its cheap range." className="py-4" />
      ) : null}
      {stocks.length > 0 ? (
        <>
          <ul aria-label="Worth a look today" className="grid grid-cols-1 gap-x-6 lg:grid-cols-2">
            {stocks.map((stock) => <Row key={stock.ticker} stock={stock} />)}
          </ul>
          {data.total > stocks.length ? (
            <p className="mt-2 text-[12px] text-ink-3">
              Showing {stocks.length} of {data.total}, furthest under its cheap price first.
            </p>
          ) : null}
        </>
      ) : null}
    </Card>
  )
}
