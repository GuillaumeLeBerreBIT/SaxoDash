import { Link } from 'react-router-dom'

import { usePrefetchInvestor } from '../../api/queries'
import StockLogo from '../StockLogo'
import FollowButton from './FollowButton'
import ImportProgress from './ImportProgress'
import InvestorAvatar from './InvestorAvatar'
import StyleChips from './StyleChips'
import { UNKNOWN, fmtNum } from '../../lib/format'
import { fmtCount, fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'
import { researchHref } from '../../lib/research'

const movement = (c) => (c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')}\u00a0new · ${fmtCount(c.exited_count, '−')}\u00a0exited`)

function HoldingLogo({ holding }) {
  return (
    <StockLogo ticker={holding.ticker} label={holding.issuer} size={22} className="ring-2 ring-tile" />
  )
}

export function TopLogos({ holdings, tab }) {
  return (
    <span className="flex -space-x-1.5">
      {holdings.map((h) => (h.ticker ? (
        <Link
          key={h.cusip ?? h.ticker}
          to={researchHref(h.ticker, tab)}
          aria-label={h.ticker}
          title={h.ticker}
          className="relative z-10 rounded-full transition-transform hover:z-20 hover:-translate-y-0.5 focus-visible:z-20 focus-visible:outline-2 focus-visible:outline-focus"
        >
          <HoldingLogo holding={h} />
        </Link>
      ) : (
        <HoldingLogo key={h.cusip ?? h.issuer} holding={h} />
      )))}
    </span>
  )
}

export function LatestLine({ investor }) {
  if (!investor.latest_quarter) return <span className="text-ink-3">No filings imported yet</span>
  if (investor.stale) return <span className="text-warn [[data-theme=light]_&]:text-warn-text">{`No 13F since ${quarterLabel(investor.latest_quarter)}`}</span>
  return <span className="text-ink-3">{`${quarterLabel(investor.latest_quarter)} · filed ${fmtFiledDate(investor.last_filing_at)}`}</span>
}

export default function InvestorCard({ investor, className = '' }) {
  const prefetch = usePrefetchInvestor()
  const warm = () => prefetch(investor.slug)
  return (
    <div className={`relative h-full flex flex-col gap-2 bg-tile rounded-[10px] px-3.5 py-3 hover:bg-hover transition-colors ${className}`}>
      <div data-testid="investor-card" className="contents">
        <div className="flex items-start gap-2.5">
          <InvestorAvatar name={investor.name} photo={investor.photo_url} logo={investor.logo_url} />
          <div className="min-w-0 flex-1">
            <Link
              to={`/investors/${investor.slug}`}
              onMouseEnter={warm}
              onFocus={warm}
              className="block truncate text-[14px] font-bold text-ink after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
            >
              {investor.name}
            </Link>
            {investor.firm !== investor.name ? <div className="text-[12px] text-ink-3 truncate">{investor.firm}</div> : null}
          </div>
          <FollowButton investor={investor} />
        </div>
        <StyleChips styles={investor.styles} />
        <ImportProgress progress={investor.import} />
        <div className="flex items-baseline justify-between gap-2">
          <span className="text-[17px] font-bold num text-ink">{fmtUsdCompact(investor.total_value)}</span>
          <span className="text-[12px] num text-ink-3">{investor.positions == null ? UNKNOWN : `${fmtNum(investor.positions)} pos`}</span>
        </div>
        <div className="flex items-center justify-between gap-2 text-[12px]">
          <TopLogos holdings={investor.top_holdings} />
          <span className="num text-ink-2 text-right">{movement(investor)}</span>
        </div>
        <div className="mt-auto text-[12px]"><LatestLine investor={investor} /></div>
      </div>
    </div>
  )
}
