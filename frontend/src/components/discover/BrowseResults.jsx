import { useState } from 'react'

import { useBrowse } from '../../api/queries'
import { PAGE_SIZE, browseQuery } from '../../lib/discoverBrowse'
import { Alert, Button, EmptyState, Skeleton } from '../ui'
import StockCard from './StockCard'

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'
const MAX_SHOWN = 60

export default function BrowseResults({ filters, onClear }) {
  const [limit, setLimit] = useState(PAGE_SIZE)
  const query = useBrowse(browseQuery(filters, { limit }))
  const stocks = query.data?.stocks ?? []
  const total = query.data?.total ?? 0

  if (query.error) return <Alert tone="warning">Could not load these stocks. {query.error.message}</Alert>
  if (query.isLoading) {
    return (
      <div className={GRID}>
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-[330px] rounded-[14px]" />
        ))}
      </div>
    )
  }
  if (total === 0) {
    return (
      <div className="rounded-[14px] bg-pane">
        <EmptyState title="No stock matches every filter." hint="Remove a filter to widen the search." />
        <div className="flex justify-center pb-6">
          <Button size="sm" onClick={onClear}>Clear filters</Button>
        </div>
      </div>
    )
  }
  return (
    <section aria-label="Matching stocks" className={`flex flex-col gap-4 ${query.isPlaceholderData ? 'opacity-60' : ''}`}>
      <p className="text-[14px] text-ink-2" data-testid="browse-count">
        <span className="font-semibold text-ink num">{total}</span> {total === 1 ? 'stock matches' : 'stocks match'}
      </p>
      <div className={GRID}>
        {stocks.map((stock) => (
          <StockCard key={stock.ticker} stock={stock} />
        ))}
      </div>
      {stocks.length < total ? (
        limit < MAX_SHOWN ? (
          <Button className="self-center" onClick={() => setLimit(Math.min(MAX_SHOWN, limit + PAGE_SIZE))}>
            {`Show ${Math.min(PAGE_SIZE, total - stocks.length)} more`}
          </Button>
        ) : (
          <p className="text-center text-[13px] text-ink-3">{`Showing ${stocks.length} of ${total}. Add a filter to narrow it down.`}</p>
        )
      ) : null}
    </section>
  )
}
