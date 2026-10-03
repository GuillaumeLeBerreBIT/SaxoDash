import { Link } from 'react-router-dom'

import { formatReason } from '../../lib/discover'
import { fmtMoney } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { DayChange, InstrumentLogo } from '../ui'
import Sparkline from './Sparkline'
import WatchlistStar from './WatchlistStar'

export default function DiscoverCard({ item }) {
  return (
    <div className="relative w-56 shrink-0 snap-start rounded-lg border border-white/[0.06] bg-zinc-900/60 hover:border-white/[0.14] transition-colors">
      <Link
        to={researchHref(item.ticker, 'overview', { uic: item.uic, assetType: item.asset_type })}
        className="block p-3 focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 rounded-lg"
      >
        <div className="flex items-center gap-2 pr-7">
          <InstrumentLogo symbol={item.ticker} size={24} className="rounded" fallback={<span className="w-6 h-6 rounded bg-zinc-800" />} />
          <div className="min-w-0">
            <div className="text-[var(--fig-sm)] font-semibold text-zinc-100">{item.ticker}</div>
            <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.name}</div>
          </div>
        </div>
        <div className="mt-3 flex items-baseline justify-between">
          <span className="num font-mono text-[var(--fig-sm)] text-zinc-200">{fmtMoney(item.last_close, 'USD')}</span>
          <DayChange value={item.change_1d} className="text-[var(--fig-xs)]" />
        </div>
        <ul aria-label={`Why ${item.ticker} is here`} className="mt-1 flex flex-wrap gap-x-2 text-[var(--fig-xs)] text-blue-300">
          {item.reasons.map((reason) => (
            <li key={reason.field} className="whitespace-nowrap">{formatReason(reason)}</li>
          ))}
        </ul>
        <div className="mt-2">
          <Sparkline values={item.sparkline} />
        </div>
      </Link>
      <div className="absolute top-2 right-2">
        <WatchlistStar ticker={item.ticker} name={item.name} uic={item.uic} assetType={item.asset_type} />
      </div>
    </div>
  )
}
