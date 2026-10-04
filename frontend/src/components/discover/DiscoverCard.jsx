import { Link } from 'react-router-dom'

import { SPARKLINE_PERIOD, reasonParts } from '../../lib/discover'
import { fmtMoney } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, DayChange, InstrumentLogo } from '../ui'
import Sparkline from './Sparkline'
import TickerInitial from './TickerInitial'
import WatchlistStar from './WatchlistStar'

export default function DiscoverCard({ item, className = '' }) {
  return (
    <Card padding={false} interactive className={`relative ${className}`}>
      <Link
        to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
        className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded-lg"
      >
        <div className="flex items-center gap-2 pr-11 sm:pr-7">
          <InstrumentLogo symbol={item.ticker} size={24} className="rounded" fallback={<TickerInitial ticker={item.ticker} size={24} />} />
          <div className="min-w-0">
            <div className="text-[var(--fig-sm)] font-semibold text-zinc-100">{item.ticker}</div>
            <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.name}</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="num font-mono text-[var(--fig-sm)] text-zinc-200">{fmtMoney(item.last_close, 'USD')}</span>
          <DayChange value={item.change_1d} className="text-[var(--fig-xs)]" />
        </div>
        <ul aria-label={`Why ${item.ticker} is here`} className="mt-1 flex flex-wrap gap-x-2 text-[var(--fig-xs)]">
          {item.reasons.map((reason) => {
            const { label, value } = reasonParts(reason)
            return (
              <li key={reason.field} className="whitespace-nowrap">
                <span className="text-zinc-500">{label}</span> <span className="num font-mono text-zinc-200">{value}</span>
              </li>
            )
          })}
        </ul>
        <div className="mt-2 flex items-end gap-1.5">
          <div className="min-w-0 flex-1">
            <Sparkline values={item.sparkline} />
          </div>
          <span className="text-[var(--fig-2xs)] text-zinc-500">{SPARKLINE_PERIOD}</span>
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <WatchlistStar ticker={item.ticker} name={item.name} uic={item.uic} assetType={item.asset_type} />
      </div>
    </Card>
  )
}
