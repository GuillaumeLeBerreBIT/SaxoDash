import { useMemo } from 'react'

import { fmtNum, fmtShares } from '../../lib/format'
import { COMPANY_DATA } from '../../lib/companyData'
import { trailingReturns } from '../../lib/performance'
import { rangeStats } from '../../lib/research'
import { Card, Panel } from '../ui'
import SetupCard from '../signals/SetupCard'
import KeyFactsStrip from './KeyFactsStrip'
import PerformanceRows from './PerformanceRows'
import SnapshotSection from './SnapshotSection'

const COLUMN = 'min-w-0 flex-1 basis-0 min-[1100px]:px-6 min-[1100px]:first:pl-0 min-[1100px]:last:pr-0 min-[1100px]:border-l min-[1100px]:border-line min-[1100px]:first:border-l-0'

function RangeFacts({ bars, range }) {
  const stats = rangeStats(bars)
  if (!stats) return null
  const marker = Math.min(100, Math.max(0, stats.positionInRange))

  return (
    <div data-testid="range-facts" className="mt-3 pt-3 border-t border-line">
      <div className="text-[12px] text-ink-3">{`Where the price sits in its ${range} range`}</div>
      <div className="relative h-3.5 my-2">
        <span className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1.5 rounded-full bg-track" />
        <span
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-ink ring-2 ring-pane"
          style={{ left: `${marker}%` }}
        />
      </div>
      <div className="grid gap-3 grid-cols-3">
        <Fact label={`${range} low`} value={fmtNum(stats.low, 2)} />
        <Fact label={`${range} high`} value={fmtNum(stats.high, 2)} />
        <Fact label="Average volume" value={fmtShares(stats.avgVolume)} />
      </div>
    </div>
  )
}

function Fact({ label, value }) {
  return (
    <div className="min-w-0">
      <span className="block text-[12px] text-ink-3">{label}</span>
      <span className="block text-[15px] font-semibold num text-ink">{value ?? '—'}</span>
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
    <Card>
      <div className="flex flex-col gap-6 min-[1100px]:flex-row min-[1100px]:gap-0">
        {hasReturns || bars?.length ? (
          <div data-testid="overview-performance" className={COLUMN}>
            <Panel bare context="Change in price up to the latest close" title="Performance">
              <PerformanceRows returns={returns} />
              <RangeFacts bars={bars} range={range} />
            </Panel>
          </div>
        ) : null}
        {eligible ? (
          <div className={COLUMN}>
            <SnapshotSection bare fundamentals={fundamentals} returns={returns} valuationGrade={verdict?.data?.valuation} />
          </div>
        ) : null}
        <div className={COLUMN}>
          <KeyFactsStrip bare fundamentals={company} details={details} detailsLoading={detailsLoading} />
        </div>
      </div>
      {eligible ? (
        <SetupCard
          bare
          className="mt-6 pt-5 border-t border-line"
          stockSignals={chartSignals?.stock}
          signals={chartSignals?.catalogue}
        />
      ) : null}
    </Card>
  )
}
