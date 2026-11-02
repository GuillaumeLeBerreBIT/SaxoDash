import { Link } from 'react-router-dom'

import { SPARKLINE_PERIOD, reasonParts } from '../../lib/discover'
import { fmtMoney } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { DayChange, InstrumentLogo } from '../ui'
import Sparkline from './Sparkline'
import WatchlistStar from './WatchlistStar'

export default function DiscoverCard({ item, className = '' }) {
  return (
    <div className={`relative rounded-[10px] bg-tile hover:bg-hover transition-colors ${className}`}>
      <Link
        to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
        className="block h-full rounded-[10px] p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
      >
        <div className="flex items-center gap-2 pr-11 sm:pr-7">
          <InstrumentLogo symbol={item.ticker} size={24} />
          <div className="min-w-0">
            <div className="text-[13px] font-semibold text-ink">{item.ticker}</div>
            <div className="text-[11px] text-ink-3 truncate">{item.name}</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="num text-[13px] text-ink">{fmtMoney(item.last_close, 'USD')}</span>
          <DayChange value={item.change_1d} className="text-[12px]" />
        </div>
        <ul aria-label={`Why ${item.ticker} is here`} className="mt-1 flex flex-wrap gap-x-2 text-[12px]">
          {item.reasons.map((reason) => {
            const { label, value } = reasonParts(reason)
            return (
              <li key={reason.field} className="whitespace-nowrap">
                <span className="text-ink-3">{label}</span> <span className="num text-ink">{value}</span>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <Sparkline values={item.sparkline} />
          </div>
          <span className="text-[11px] text-ink-3">{SPARKLINE_PERIOD}</span>
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <WatchlistStar ticker={item.ticker} name={item.name} uic={item.uic} assetType={item.asset_type} />
      </div>
    </div>
  )
}
