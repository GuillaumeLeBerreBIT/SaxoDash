import { useMemo } from 'react'

import { fmtCompact, fmtDate, fmtNum, fmtShares } from '../../lib/format'
import { COMPANY_DATA } from '../../lib/companyData'
import { daysUntil, sessionWords } from '../../lib/earnings'
import { trailingReturns } from '../../lib/performance'
import { rangeStats } from '../../lib/research'
import { Card } from '../ui'
import SetupCard from '../signals/SetupCard'
import KeyFactsStrip from './KeyFactsStrip'
import PerformanceTiles from './PerformanceTiles'
import SnapshotSection from './SnapshotSection'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-stretch [&>div>.sd-panel:only-child]:h-full [&>div.flex-col>.sd-panel:last-child]:flex-1'
const COL = 'flex flex-col gap-[var(--sd-gap,12px)] min-w-0'
function Fact({ label, value }) {
  return (
    <div className="bg-tile rounded-[10px] px-3.5 py-3 min-w-0">
      <span className="block text-[12px] text-ink-3">{label}</span>
      <span className="block mt-1 text-[17px] font-bold num text-ink">{value ?? '—'}</span>
    </div>
  )
}

function CompanyReads({ companyData, fundamentals, verdict, chartSignals, returns }) {
  if (companyData !== COMPANY_DATA.eligible) return null
  return (
    <>
      <SetupCard stockSignals={chartSignals?.stock} signals={chartSignals?.catalogue} />
      <SnapshotSection fundamentals={fundamentals} returns={returns} valuationGrade={verdict?.data?.valuation} />
    </>
  )
}

function RangeFacts({ bars, range }) {
  const stats = rangeStats(bars)
  if (!stats) return null
  const marker = Math.min(100, Math.max(0, stats.positionInRange))

  return (
    <div data-testid="range-facts" className="mt-3">
      <div className="text-[12px] text-ink-3">{`Where the price sits in its ${range} range`}</div>
      <div className="relative h-3.5 my-2">
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-track" />
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink ring-2 ring-pane"
          style={{ left: `${marker}%` }}
        />
      </div>
      <div className="grid gap-2 grid-cols-3">
        <Fact label={`${range} low`} value={fmtNum(stats.low, 2)} />
        <Fact label={`${range} high`} value={fmtNum(stats.high, 2)} />
        <Fact label="Average volume" value={fmtShares(stats.avgVolume)} />
      </div>
    </div>
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
  details,
  detailsLoading,
  bars,
  allBars = [],
  range,
  fundamentals,
  verdict,
  chartSignals,
  companyData = COMPANY_DATA.eligible,
  earnings,
  signals,
  onOpenTab,
}) {
  const eligible = companyData === COMPANY_DATA.eligible
  const company = eligible && fundamentals?.data?.available ? fundamentals.data : null
  const returns = useMemo(() => trailingReturns(allBars), [allBars])
  const hasReturns = returns.some((row) => row.pct != null)

  return (
    <div className={BOARD}>
      <div data-testid="overview-col-main" className={`min-[1100px]:col-span-8 ${COL}`}>
        {hasReturns || bars?.length ? (
          <Card context="Change in price up to the latest close" title="Performance">
            {hasReturns ? (
              <div className="sm:[&>ul]:grid-cols-6">
                <PerformanceTiles returns={returns} />
              </div>
            ) : null}
            <RangeFacts bars={bars} range={range} />
          </Card>
        ) : null}
        <CompanyReads companyData={companyData} fundamentals={fundamentals} verdict={verdict} chartSignals={chartSignals} returns={returns} />
      </div>

      <div data-testid="overview-col-side" className={`min-[1100px]:col-span-4 ${COL}`}>
        <NextEarningsCard earnings={earnings} onOpenTab={onOpenTab} />
        {signals}
        <KeyFactsStrip fundamentals={company} details={details} detailsLoading={detailsLoading} />
      </div>
    </div>
  )
}
