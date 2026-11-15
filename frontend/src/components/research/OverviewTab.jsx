import { useMemo, useState } from 'react'

import { fmtCompact, fmtDate, fmtNum, fmtShares } from '../../lib/format'
import { COMPANY_DATA } from '../../lib/companyData'
import { daysUntil, sessionWords } from '../../lib/earnings'
import { trailingReturns } from '../../lib/performance'
import { rangeStats } from '../../lib/research'
import { Button, Card } from '../ui'
import SetupCard from '../signals/SetupCard'
import TradePlanCard from './TradePlanCard'
import AnswerCard from './AnswerCard'
import KeyFactsStrip from './KeyFactsStrip'
import PerformanceTiles from './PerformanceTiles'
import SnapshotSection from './SnapshotSection'
import ThesisAndRisksCard, { BusinessSummaryCard } from './SymbolNotesCard'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const COL = 'flex flex-col gap-[var(--sd-gap,12px)] min-w-0'
const PLAN_ACTIONS = new Set(['buy', 'add'])
const ANSWER_NOTES = {
  [COMPANY_DATA.fund]: 'This is an ETF, so there is no company to judge: no earnings, margins or valuation ratios.',
  [COMPANY_DATA.foreign]:
    'No verdict: this is listed outside the US. Company data is looked up by ticker alone, and that ticker belongs to a US-listed company that may not be this one.',
  [COMPANY_DATA.unverified]:
    'No verdict: Saxo could not confirm where this instrument is listed, so company data is held back until it can.',
}

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

function PlanSection({ action, children }) {
  const [open, setOpen] = useState(false)
  if (!action || PLAN_ACTIONS.has(action) || open) return children
  return (
    <Card context="For a new purchase" dot="off" title="Trade plan">
      <p className="text-[13px] text-ink-2">Stop-loss, size and risk. Closed because the verdict is not Buy or Add.</p>
      <Button size="sm" className="mt-2.5" onClick={() => setOpen(true)}>Show the trade plan</Button>
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
  position,
  details,
  detailsLoading,
  bars,
  allBars = [],
  range,
  fundamentals,
  verdict,
  answer,
  chartSignals,
  tradePlan,
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
  const eligible = companyData === COMPANY_DATA.eligible
  const company = eligible && fundamentals?.data?.available ? fundamentals.data : null
  const returns = useMemo(() => trailingReturns(allBars), [allBars])
  const hasReturns = returns.some((row) => row.pct != null)
  const pending = companyData === COMPANY_DATA.pending

  return (
    <div className={COL}>
      <div data-testid="overview-top" className={COL}>
        {header}
        {pending ? null : (
          <AnswerCard
            verdict={eligible ? verdict : undefined}
            sentence={eligible ? answer : null}
            position={position}
            note={ANSWER_NOTES[companyData]}
          />
        )}
      </div>
      <div className={BOARD}>
        <div data-testid="overview-col-main" className={`min-[1100px]:col-span-8 ${COL}`}>
          {lead}
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
          <NextEarningsCard earnings={earnings} onOpenTab={onOpenTab} />
          <PlanSection action={eligible ? verdict?.data?.action : null}>
            <TradePlanCard
              bars={allBars}
              currency={details?.currency ?? position?.currency}
              note={note?.data}
              position={position}
              positions={tradePlan?.positions}
              portfolioValue={tradePlan?.portfolioValue}
              nextEarnings={earnings?.data?.available ? earnings.data.next : null}
              verdict={eligible ? verdict?.data : null}
            />
          </PlanSection>
          {signals}
          <KeyFactsStrip fundamentals={company} details={details} detailsLoading={detailsLoading} />
        </div>
      </div>
    </div>
  )
}
