import { Link } from 'react-router-dom'

import { checksLine, priceLine } from '../../lib/discoverBrowse'
import { fmtDate, fmtMoney } from '../../lib/format'
import { displayName } from '../../lib/names'
import { hasPriceRange } from '../../lib/priceBar'
import { researchHref } from '../../lib/research'
import { InstrumentLogo } from '../ui'
import ActionBadge from '../verdicts/ActionBadge'
import PriceSpark from './PriceSpark'
import WatchlistStar from './WatchlistStar'
import ChartLink from '../ChartLink'

export default function StockCard({ stock, note, qualitySummary, className = '' }) {
  const line = priceLine(stock)
  const instrument = { uic: stock.uic, assetType: 'Stock' }
  return (
    <article
      data-testid="stock-card"
      data-listing={stock.ticker}
      className={`sd-panel group relative flex min-w-0 flex-col gap-3 rounded-[14px] bg-pane p-4 transition-colors hover:bg-hover ${className}`}
    >
      <div className="flex items-center gap-2.5 pr-[88px] sm:pr-16">
        <InstrumentLogo symbol={stock.ticker} size={34} />
        <div className="min-w-0">
          <Link
            to={researchHref(stock.ticker, 'overview', instrument)}
            title={stock.name}
            className="block truncate text-[15px] font-bold text-ink after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-focus"
          >
            {displayName(stock.name)}
          </Link>
          <div className="truncate text-[12px] text-ink-3">{[stock.ticker, stock.sector].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="num text-[20px] font-bold leading-tight text-ink">{fmtMoney(stock.last_close, 'USD')}</span>
        <span className="text-[12px] text-ink-3">{stock.close_date ? `Close · ${fmtDate(stock.close_date)}` : 'Close date unavailable'}</span>
        {stock.held ? <span className="text-[12px] font-semibold text-held">You own it</span> : null}
      </div>
      <figure className="flex flex-col gap-1.5">
        {stock.spark?.length >= 2 && <span className="text-[12px] text-ink-3">Weekly closes</span>}
        <PriceSpark
          values={stock.spark}
          cheapBelow={stock.cheap_below}
          expensiveAbove={stock.expensive_above}
          label={`${stock.name}, recent weekly closes`}
        />
        {hasPriceRange(stock.cheap_below, stock.expensive_above) ? (
          <figcaption className="flex flex-wrap items-baseline justify-between gap-x-2 text-[12px]">
            <span className="text-ink-3">P/E-based range</span>
            <span className="num whitespace-nowrap text-ink-2">{fmtMoney(stock.cheap_below, 'USD')}–{fmtMoney(stock.expensive_above, 'USD')}</span>
          </figcaption>
        ) : <figcaption className="text-[12px] text-ink-3">P/E range unavailable</figcaption>}
      </figure>
      {line ? <span className="num text-[12px] font-semibold text-ink-2">{line}</span> : null}
      <p className="text-[13px] leading-snug text-ink-2">{note ?? checksLine(stock)}</p>
      <div className="mt-auto flex items-center justify-between gap-2 border-t border-line pt-2.5">
        <div className="flex min-w-0 flex-col">
          {qualitySummary && <span className="num text-[13px] font-semibold text-ink-2">{qualitySummary}</span>}
          {(!qualitySummary || !['buy', 'add'].includes(stock.action)) && <ActionBadge verdict={stock} className="text-[14px]" />}
        </div>
        <span className="text-[12px] text-ink-3 transition-colors group-hover:text-ink-2">Open in Research →</span>
      </div>
      <div className="absolute right-2.5 top-3 z-10 flex items-center gap-1">
        <ChartLink symbol={stock.ticker} instrument={instrument} />
        <WatchlistStar ticker={stock.ticker} name={stock.name} uic={stock.uic} assetType="Stock" />
      </div>
    </article>
  )
}
