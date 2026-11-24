import { Info } from 'lucide-react'
import { Link } from 'react-router-dom'

import { reasonsLine } from '../../lib/discover'
import { PAGE_SIZE, checksLine, fallLine, priceLine, qualityCount } from '../../lib/discoverBrowse'
import { fmtDate, fmtMoney } from '../../lib/format'
import { displayName } from '../../lib/names'
import { hasPriceRange } from '../../lib/priceBar'
import { researchHref } from '../../lib/research'
import { Popover } from '../overlays'
import { Alert, Button, DataTable, EmptyState, Skeleton, Td, Th, Tr } from '../ui'
import StockCard from './StockCard'
import WatchlistStar from './WatchlistStar'
import ChartLink from '../ChartLink'

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

function reason(stock) {
  if (stock.reasons?.length) return reasonsLine(stock.reasons)
  if (stock.fund_count) return `${stock.fund_count} tracked funds opened or added to positions in the quarter ending ${fmtDate(stock.fund_quarter)}.`
  return checksLine(stock)
}

function RangeGuide() {
  return (
    <Popover label="How to read the price range" align="end" width="min(290px, calc(100vw - 24px))"
      className="space-y-2 p-3.5 text-[13px] leading-snug text-ink-2"
      trigger={
        <button type="button" className="inline-flex min-h-8 items-center gap-1.5 rounded text-ink-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-focus">
          <Info size={14} aria-hidden="true" /> About P/E ranges
        </button>
      }>
      <p className="font-semibold text-ink">How to read the price range</p>
      <p>P/E is the price paid per dollar of earnings. We apply the middle half of the company’s past P/E ratios to its latest 12 months of earnings per share.</p>
      <p>When a range is available, the chart compares each weekly close with it. Prices inside the range are unshaded.</p>
      <div className="flex gap-4">
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-up" />Below range</span>
        <span className="inline-flex items-center gap-1.5"><span aria-hidden="true" className="size-2 rounded-sm bg-down" />Above range</span>
      </div>
    </Popover>
  )
}

function priceContextLines(stock, showFall) {
  const lines = [priceLine(stock), showFall ? fallLine(stock) : null]
  return lines.filter((text, index) => text && lines.indexOf(text) === index)
}

function TablePriceContext({ stock, showFall }) {
  const lines = priceContextLines(stock, showFall)
  const text = lines.map((line) => <div key={line}>{line}</div>)
  if (hasPriceRange(stock.cheap_below, stock.expensive_above)) return lines.length ? text : '—'
  return <>{text}<div className="text-ink-3">P/E range unavailable</div></>
}

function ResultsTable({ stocks, screen, showFall }) {
  return (
    <DataTable label="Matching stocks" frameClassName="sd-panel rounded-[14px] bg-pane">
      <thead><tr><Th>Company</Th><Th align="right">Closing price</Th><Th>Price context</Th><Th>Screen evidence</Th><Th>Watchlists</Th></tr></thead>
      <tbody>{stocks.map((stock) => (
        <Tr key={stock.ticker} data-listing={stock.ticker}>
          <Td>
            <Link className="font-semibold text-ink hover:underline"
              to={researchHref(stock.ticker, 'overview', { uic: stock.uic, assetType: 'Stock' })}>
              {displayName(stock.name)}
            </Link>
            <div className="text-ink-3">{[stock.ticker, stock.sector].filter(Boolean).join(' · ')}</div>
          </Td>
          <Td align="right" className="num">{fmtMoney(stock.last_close, 'USD')}<div className="text-ink-3">{stock.close_date ? fmtDate(stock.close_date) : 'Close date unavailable'}</div></Td>
          <Td><TablePriceContext stock={stock} showFall={showFall} /></Td>
          <Td className="min-w-40 whitespace-normal">
            {screen === 'strong' && <div className="num font-semibold">{qualityCount(stock)}</div>}
            {reason(stock)}
          </Td>
          <Td>
            <div className="flex items-center gap-1">
              <ChartLink symbol={stock.ticker} instrument={{ uic: stock.uic, assetType: 'Stock' }} />
              <WatchlistStar ticker={stock.ticker} name={stock.name} uic={stock.uic} assetType="Stock" />
            </div>
          </Td>
        </Tr>
      ))}</tbody>
    </DataTable>
  )
}

export default function BrowseResults({ pages, screen, showFall = false, layout, health, onClear, onMore }) {
  const stocks = [...new Map(pages.flatMap((page) => page.data?.stocks ?? []).map((stock) => [stock.ticker, stock])).values()]
  const total = pages[0].data?.total ?? 0
  const failed = pages.find((page) => page.error)
  const loading = pages.some((page) => page.isLoading)
  const pendingScan = ['never', 'scanning', 'failed'].includes(health?.state)
  return (
    <section tabIndex={-1} aria-label="Matching stocks" className="flex min-w-0 flex-col gap-4">
      {pages[0].data && (total > 0 || !pendingScan) ? (
        <div className="flex flex-wrap items-center justify-between gap-x-3">
          <p role="status" className="text-[14px] text-ink-2 num">{stocks.length} of {total} stocks</p>
          {stocks.some(stock => hasPriceRange(stock.cheap_below, stock.expensive_above)) && <RangeGuide />}
        </div>
      ) : null}
      {stocks.length > 0 && (layout === 'table' ? <ResultsTable stocks={stocks} screen={screen} showFall={showFall} /> : (
        <div className={GRID}>
          {stocks.map((stock) => (
            <StockCard key={stock.ticker} stock={stock} note={reason(stock)} showFall={showFall} qualitySummary={screen === 'strong' ? qualityCount(stock) : null}
              className="[content-visibility:auto] [contain-intrinsic-size:auto_320px]" />
          ))}
        </div>
      ))}
      {loading ? <Skeleton className="h-20 rounded-xl" /> : null}
      {failed ? <Alert tone="warning">Could not load these stocks. <Button size="sm" onClick={() => failed.refetch()}>Retry</Button></Alert> : null}
      {!failed && !loading && total === 0 && !pendingScan ? (
        <div className="rounded-[14px] bg-pane">
          <EmptyState title="No matching stocks" hint={screen === 'saved' ? 'Use the star on a company to save it to a watchlist.' : 'Try another screen or broaden your filters.'} />
          <div className="flex justify-center pb-6"><Button size="sm" onClick={onClear}>Browse all stocks</Button></div>
        </div>
      ) : null}
      {!loading && !failed && pages.length * PAGE_SIZE < total ? <Button className="self-center" onClick={onMore}>Show {Math.min(PAGE_SIZE, total - pages.length * PAGE_SIZE)} more</Button> : null}
    </section>
  )
}
