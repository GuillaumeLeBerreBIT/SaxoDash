import { Link } from 'react-router-dom'

import { checksLine, priceLine } from '../../lib/discoverBrowse'
import { fmtMoney } from '../../lib/format'
import { displayName } from '../../lib/names'
import { researchHref } from '../../lib/research'
import { InstrumentLogo } from '../ui'
import ActionBadge from '../verdicts/ActionBadge'
import PriceBar from '../verdicts/PriceBar'
import PriceSpark from './PriceSpark'
import WatchlistStar from './WatchlistStar'

const LINE_TONE = { up: 'text-up', neutral: 'text-ink-2' }

export default function StockCard({ stock, note, className = '' }) {
  const line = priceLine(stock)
  const instrument = { uic: stock.uic, assetType: 'Stock' }
  return (
    <article
      data-testid="stock-card"
      className={`group relative flex min-w-0 flex-col gap-3 rounded-[14px] bg-pane p-4 transition-colors hover:bg-hover ${className}`}
    >
      <div className="flex items-center gap-2.5 pr-9">
        <InstrumentLogo symbol={stock.ticker} size={34} />
        <div className="min-w-0">
          <Link
            to={researchHref(stock.ticker, 'overview', instrument)}
            className="block truncate text-[15px] font-bold text-ink after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:outline focus-visible:after:outline-2 focus-visible:after:outline-focus"
          >
            {displayName(stock.name)}
          </Link>
          <div className="truncate text-[12px] text-ink-3">{[stock.ticker, stock.sector].filter(Boolean).join(' · ')}</div>
        </div>
      </div>
      <PriceSpark
        values={stock.spark}
        cheapBelow={stock.cheap_below}
        expensiveAbove={stock.expensive_above}
        label={`${stock.name}, weekly closes over the last year`}
      />
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[20px] font-bold text-ink num">{fmtMoney(stock.last_close, 'USD')}</span>
        {stock.held ? <span className="text-[12px] font-semibold text-held">You own it</span> : null}
      </div>
      <div className="flex flex-col gap-1.5">
        <PriceBar price={stock.last_close} cheapBelow={stock.cheap_below} expensiveAbove={stock.expensive_above} labels={false} />
        {line ? <span className={`text-[12px] font-semibold num ${LINE_TONE[line.tone]}`}>{line.text}</span> : null}
      </div>
      <p className="min-h-[36px] text-[13px] leading-snug text-ink-2">{note ?? checksLine(stock)}</p>
      <div className="mt-auto flex items-center justify-between border-t border-line pt-2.5">
        <ActionBadge verdict={stock} className="text-[14px]" />
        <span className="text-[12px] text-ink-3 transition-colors group-hover:text-ink-2">Open in Research →</span>
      </div>
      <div className="absolute right-2.5 top-3 z-10">
        <WatchlistStar ticker={stock.ticker} name={stock.name} uic={stock.uic} assetType="Stock" />
      </div>
    </article>
  )
}
