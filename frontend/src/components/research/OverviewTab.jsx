import { useMemo } from 'react'

import { fmtCompact, fmtDate, fmtEur, fmtMoney, fmtNum, fmtPct, fmtQty, fmtShares } from '../../lib/format'
import { COMPANY_DATA } from '../../lib/companyData'
import { daysUntil, sessionWords } from '../../lib/earnings'
import { priceBasis } from '../../lib/pricing'
import { trailingReturns } from '../../lib/performance'
import { rangeStats } from '../../lib/research'
import { Card, Move, Tile } from '../ui'
import AnalystRatingCard from './AnalystRatingCard'
import CapitalStructureCard from './CapitalStructureCard'
import KeyFactsStrip from './KeyFactsStrip'
import OwnershipCard from './OwnershipCard'
import PerformanceTiles from './PerformanceTiles'
import SnapshotSection from './SnapshotSection'
import ThesisAndRisksCard, { BusinessSummaryCard } from './SymbolNotesCard'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const COL = 'flex flex-col gap-[var(--sd-gap,12px)] min-w-0'
const TOP_ROW = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-stretch'
const TOP_CELL = 'flex flex-col min-w-0 [&>*]:flex-1'

function Fact({ label, value }) {
  return (
    <div className="bg-tile rounded-[10px] px-3.5 py-3 min-w-0">
      <span className="block text-[12px] text-ink-3">{label}</span>
      <span className="block mt-1 text-[17px] font-bold num text-ink">{value ?? '—'}</span>
    </div>
  )
}

function ListingNote({ context, title, children }) {
  return (
    <Card context={context} dot="off" title={title}>
      <p className="text-[13px] text-ink-2">{children}</p>
    </Card>
  )
}

function CompanyReads({ companyData, fundamentals }) {
  if (companyData === COMPANY_DATA.fund) {
    return (
      <ListingNote context="Company fundamentals don't apply" title="Fund">
        This is an ETF, so there are no earnings, margins or valuation ratios to show. Range statistics and your notes
        are beside it.
      </ListingNote>
    )
  }
  if (companyData === COMPANY_DATA.foreign) {
    return (
      <ListingNote context="Company data covers US-listed shares" title="Listed outside the US">
        Fundamentals, statements, earnings and SEC filings are looked up by ticker alone, and that ticker belongs to a
        US-listed company that may not be this one. They are left out here. Range statistics and your notes are beside
        it.
      </ListingNote>
    )
  }
  if (companyData === COMPANY_DATA.unverified) {
    return (
      <ListingNote context="Company data is held back" title="Listing not confirmed">
        Saxo could not confirm where this instrument is listed. Fundamentals and filings are looked up by US ticker, so
        they are held back until it can. Range statistics and your notes are beside it.
      </ListingNote>
    )
  }
  if (companyData === COMPANY_DATA.pending) return null
  return <SnapshotSection fundamentals={fundamentals} />
}

function positionContext(position) {
  const parts = [`Held · ${fmtQty(position.qty)} shares`]
  if (position.weight != null) parts.push(`${fmtPct(position.weight, { sign: false, decimals: 1 })} of the book`)
  return parts.join(' · ')
}

function PositionCard({ symbol, position }) {
  if (!position) {
    return (
      <Card context="Not in your book" dot="off" title="Your position" className="h-full">
        <p className="text-[13px] text-ink-2">You don’t hold {symbol}.</p>
      </Card>
    )
  }

  const pnl = position.pnl == null ? null : Number(position.pnl)
  const basis =
    position.price_source && position.price_source !== 'live' ? priceBasis(position.price_source).note : undefined

  return (
    <Card context={positionContext(position)} dot={basis ? 'warn' : 'ok'} title="Your position" className="h-full">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="Market value" value={fmtEur(position.value, { decimals: 0 })} />
        <Tile
          label="Unrealised P&L"
          value={pnl == null ? null : fmtEur(pnl, { sign: true, decimals: 0 })}
          tone={pnl == null ? undefined : pnl >= 0 ? 'up' : 'down'}
          sub={<Move value={position.pnl_pct} />}
        />
        <Tile label="Quantity" value={fmtQty(position.qty)} />
        <Tile label="Avg buy" value={fmtMoney(position.avg_cost, position.currency)} />
      </div>
      {basis && <p className="mt-2 text-[12px] text-ink-3">{basis}</p>}
    </Card>
  )
}

function RangeStatsCard({ bars, range }) {
  const stats = rangeStats(bars)
  if (!stats) return null
  const marker = Math.min(100, Math.max(0, stats.positionInRange))

  return (
    <Card context={`Computed from the ${range} candles on screen`} dot="ok" title="Range statistics">
      <div className="flex items-baseline justify-between text-[13px] font-semibold num text-ink">
        <span>{fmtNum(stats.low, 2)} low</span>
        <span>{fmtNum(stats.high, 2)} high</span>
      </div>
      <div className="relative h-3.5 my-2">
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-track" />
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink ring-2 ring-pane"
          style={{ left: `${marker}%` }}
        />
      </div>
      <div className="grid gap-2 grid-cols-[repeat(auto-fit,minmax(120px,1fr))]">
        <Fact label={`${range} high`} value={fmtNum(stats.high, 2)} />
        <Fact label={`${range} low`} value={fmtNum(stats.low, 2)} />
        <Fact label="Last close" value={fmtNum(stats.last, 2)} />
        <Fact label="Avg volume" value={fmtShares(stats.avgVolume)} />
      </div>
    </Card>
  )
}

function NextEarningsCard({ earnings, onOpenTab }) {
  const data = earnings?.data
  if (!data?.available) return null
  const next = data.next

  return (
    <Card context={next ? `Finnhub calendar · ${daysUntil(next.date)}` : 'Finnhub calendar'} dot="earn" title="Next earnings">
      {next ? (
        <>
          <div className="text-[26px] font-bold num text-ink">{fmtDate(next.date)}</div>
          <div className="mt-0.5 text-[13px] text-ink-2 num">
            {[
              sessionWords(next.session),
              next.eps_estimate == null ? null : `EPS est. ${fmtNum(next.eps_estimate, 2)}`,
              next.revenue_estimate == null ? null : `revenue est. ${fmtCompact(next.revenue_estimate / 1e6)}`,
            ]
              .filter(Boolean)
              .join(' · ')}
          </div>
        </>
      ) : (
        <p className="text-[13px] text-ink-3">No scheduled earnings date for this symbol.</p>
      )}
      {onOpenTab && (
        <button
          type="button"
          onClick={() => onOpenTab('earnings')}
          className="mt-2.5 text-[13px] font-semibold text-ink hover:underline"
        >
          Earnings history →
        </button>
      )}
    </Card>
  )
}

export default function OverviewTab({
  symbol,
  position,
  details,
  detailsLoading,
  bars,
  allBars = [],
  range,
  fundamentals,
  note,
  onSaveNote,
  onMarkReviewed,
  reviewing = false,
  companyData = COMPANY_DATA.eligible,
  earnings,
  header,
  lead,
  signals,
  rail,
  onOpenTab,
}) {
  const company = companyData === COMPANY_DATA.eligible && fundamentals?.data?.available ? fundamentals.data : null
  const returns = useMemo(() => trailingReturns(allBars), [allBars])
  const hasReturns = returns.some((row) => row.pct != null)

  return (
    <div className={COL}>
      <div data-testid="overview-top" className={TOP_ROW}>
        <div className={`min-[1100px]:col-span-8 ${TOP_CELL}`}>{header}</div>
        <div className={`min-[1100px]:col-span-4 ${TOP_CELL}`}>
          <PositionCard symbol={symbol} position={position} />
        </div>
      </div>
      <div className={BOARD}>
        <div data-testid="overview-col-main" className={`min-[1100px]:col-span-8 ${COL}`}>
          {lead}
          {hasReturns && (
            <Card context="Change in price up to the latest close" dot="ok" title="Performance">
              <div className="sm:[&>ul]:grid-cols-6">
                <PerformanceTiles returns={returns} />
              </div>
            </Card>
          )}
          <RangeStatsCard bars={bars} range={range} />
          <BusinessSummaryCard note={note?.data} onSave={onSaveNote} />
          <ThesisAndRisksCard
            note={note?.data}
            onSave={onSaveNote}
            onMarkReviewed={onMarkReviewed}
            reviewing={reviewing}
            fundamentals={fundamentals}
            currency={details?.currency}
          />
        </div>

        <div data-testid="overview-col-side" className={`min-[1100px]:col-span-4 ${COL}`}>
          {rail}
          <CompanyReads companyData={companyData} fundamentals={fundamentals} />
          {company && <AnalystRatingCard fundamentals={company} />}
          {signals}
          {company && <CapitalStructureCard fundamentals={company} />}
          {company && <OwnershipCard fundamentals={company} />}
          <NextEarningsCard earnings={earnings} onOpenTab={onOpenTab} />
          <KeyFactsStrip fundamentals={company} details={details} detailsLoading={detailsLoading} />
        </div>
      </div>
    </div>
  )
}
