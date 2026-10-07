import { Link } from 'react-router-dom'

import { usePrefetchInvestor } from '../../api/queries'
import { Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import FollowButton from './FollowButton'
import ImportProgress from './ImportProgress'
import InvestorAvatar from './InvestorAvatar'
import StyleChips from './StyleChips'
import { UNKNOWN, fmtNum } from '../../lib/format'
import { fmtCount, fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'

const movement = (c) => (c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')}\u00a0new · ${fmtCount(c.exited_count, '−')}\u00a0exited`)

export function TopLogos({ holdings }) {
  return (
    <span className="flex -space-x-1.5">
      {holdings.map((h) => (
        <InstrumentLogo
          key={h.cusip}
          symbol={h.ticker}
          size={22}
          className="rounded-full ring-2 ring-zinc-900"
          fallback={<TickerInitial ticker={h.ticker ?? h.issuer} size={22} />}
        />
      ))}
    </span>
  )
}

export function LatestLine({ investor }) {
  if (!investor.latest_quarter) return <span className="text-zinc-500">No filings imported yet</span>
  if (investor.stale) return <span className="text-amber-400">{`No 13F since ${quarterLabel(investor.latest_quarter)}`}</span>
  return <span className="text-zinc-500">{`${quarterLabel(investor.latest_quarter)} · filed ${fmtFiledDate(investor.last_filing_at)}`}</span>
}

export default function InvestorCard({ investor, className = '' }) {
  const prefetch = usePrefetchInvestor()
  const warm = () => prefetch(investor.slug)
  return (
    <Card interactive className={`relative h-full flex flex-col gap-2 ${className}`}>
      <div data-testid="investor-card" className="contents">
        <div className="flex items-start gap-2.5">
          <InvestorAvatar name={investor.name} />
          <div className="min-w-0 flex-1">
            <Link
              to={`/investors/${investor.slug}`}
              onMouseEnter={warm}
              onFocus={warm}
              className="block truncate text-[var(--fig-sm)] font-medium text-zinc-100 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-blue-500"
            >
              {investor.name}
            </Link>
            <div className="text-[var(--fig-xs)] text-zinc-500 truncate">{investor.firm}</div>
          </div>
          <FollowButton investor={investor} />
        </div>
        <StyleChips styles={investor.styles} />
        <ImportProgress progress={investor.import} />
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[var(--fig-md)] num font-mono text-zinc-50">{fmtUsdCompact(investor.total_value)}</span>
          <span className="text-[var(--fig-xs)] num font-mono text-zinc-500">{investor.positions == null ? UNKNOWN : `${fmtNum(investor.positions)} pos`}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[var(--fig-xs)]">
          <TopLogos holdings={investor.top_holdings} />
          <span className="num font-mono text-zinc-400 text-right">{movement(investor)}</span>
        </div>
        <div className="mt-auto text-[var(--fig-xs)]"><LatestLine investor={investor} /></div>
      </div>
    </Card>
  )
}
