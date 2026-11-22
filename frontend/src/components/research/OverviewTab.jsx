import { useMemo } from 'react'

import { fmtNum, fmtShares } from '../../lib/format'
import { COMPANY_DATA } from '../../lib/companyData'
import { trailingReturns } from '../../lib/performance'
import { rangeStats } from '../../lib/research'
import { Card } from '../ui'
import SetupCard from '../signals/SetupCard'
import KeyFactsStrip from './KeyFactsStrip'
import PerformanceTiles from './PerformanceTiles'
import SnapshotSection from './SnapshotSection'

const GAP = 'gap-[var(--sd-gap,12px)]'
function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-ink-3">{label}</span>
      <span className="block text-[15px] font-semibold num text-ink">{value ?? '—'}</span>
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
      <div className="grid gap-3 grid-cols-3 pt-3 border-t border-line">
        <Fact label={`${range} low`} value={fmtNum(stats.low, 2)} />
        <Fact label={`${range} high`} value={fmtNum(stats.high, 2)} />
        <Fact label="Average volume" value={fmtShares(stats.avgVolume)} />
      </div>
    </div>
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
}) {
  const eligible = companyData === COMPANY_DATA.eligible
  const company = eligible && fundamentals?.data?.available ? fundamentals.data : null
  const returns = useMemo(() => trailingReturns(allBars), [allBars])
  const hasReturns = returns.some((row) => row.pct != null)

  return (
    <div className={`flex flex-col ${GAP}`}>
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
      <div className={`grid grid-cols-1 min-[1100px]:grid-cols-2 ${GAP} items-start`}>
        <CompanyReads companyData={companyData} fundamentals={fundamentals} verdict={verdict} chartSignals={chartSignals} returns={returns} />
      </div>
      <KeyFactsStrip fundamentals={company} details={details} detailsLoading={detailsLoading} />
    </div>
  )
}
