import { Link } from 'react-router-dom'

import { reasonsLine } from '../../lib/discover'
import { PAGE_SIZE, checksLine, priceLine } from '../../lib/discoverBrowse'
import { fmtDate, fmtMoney } from '../../lib/format'
import { displayName } from '../../lib/names'
import { researchHref } from '../../lib/research'
import { Alert, Button, DataTable, EmptyState, Skeleton, Td, Th, Tr } from '../ui'
import StockCard from './StockCard'
import WatchlistStar from './WatchlistStar'

const GRID = 'grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4'

function reason(stock, screen) {
  if (stock.reasons?.length) return reasonsLine(stock.reasons)
  if (stock.fund_count) return `${stock.fund_count} tracked funds opened or added to positions in the quarter ending ${fmtDate(stock.fund_quarter)}.`
  if (screen === 'pullbacks') return `${Math.round(stock.below_high_pct)}% below its 1-year high. ${checksLine(stock)}`
  return checksLine(stock)
}

function ResultsTable({ stocks, screen }) {
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
          <Td>{priceLine(stock)?.text ?? '—'}</Td>
          <Td className="min-w-40 whitespace-normal">{reason(stock, screen)}</Td>
          <Td><WatchlistStar ticker={stock.ticker} name={stock.name} uic={stock.uic} assetType="Stock" /></Td>
        </Tr>
      ))}</tbody>
    </DataTable>
  )
}

export default function BrowseResults({ pages, screen, layout, health, onClear, onMore }) {
  const stocks = [...new Map(pages.flatMap((page) => page.data?.stocks ?? []).map((stock) => [stock.ticker, stock])).values()]
  const total = pages[0].data?.total ?? 0
  const failed = pages.find((page) => page.error)
  const loading = pages.some((page) => page.isLoading)
  const pendingScan = ['never', 'scanning', 'failed'].includes(health?.state)
  return (
    <section tabIndex={-1} aria-label="Matching stocks" className="flex min-w-0 flex-col gap-4">
      {pages[0].data && (total > 0 || !pendingScan) ? <p role="status" className="text-[14px] text-ink-2 num">{stocks.length} of {total} stocks</p> : null}
      {stocks.length > 0 && (layout === 'table' ? <ResultsTable stocks={stocks} screen={screen} /> : (
        <div className={GRID}>
          {stocks.map((stock) => (
            <StockCard key={stock.ticker} stock={stock} note={reason(stock, screen)}
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
