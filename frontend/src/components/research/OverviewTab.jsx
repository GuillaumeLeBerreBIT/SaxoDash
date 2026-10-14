import { useMemo } from 'react'

import { fmtEur, fmtMoney, fmtNum, fmtPct, fmtQty, fmtShares } from '../../lib/format'
import { COMPANY_DATA } from '../../lib/companyData'
import { priceBasis } from '../../lib/pricing'
import { trailingReturns } from '../../lib/performance'
import { rangeStats } from '../../lib/research'
import { Card, CardHeader, Metric } from '../ui'
import AnalystRatingCard from './AnalystRatingCard'
import CapitalStructureCard from './CapitalStructureCard'
import KeyFactsStrip from './KeyFactsStrip'
import OwnershipCard from './OwnershipCard'
import PerformanceTiles from './PerformanceTiles'
import SnapshotSection from './SnapshotSection'
import ThesisAndRisksCard, { BusinessSummaryCard } from './SymbolNotesCard'

function Fact({ label, value }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-[var(--fig-xs)] text-zinc-500">{label}</span>
      <span className="text-[var(--fig-sm)] num font-mono text-zinc-100">{value ?? '—'}</span>
    </div>
  )
}

function EtfNote() {
  return (
    <Card>
      <CardHeader title="Fund" subtitle="Company fundamentals don't apply" />
      <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
        This is an ETF, so there are no earnings, margins or valuation ratios to show. Range statistics
        and your notes are below.
      </p>
    </Card>
  )
}

function ForeignListingNote() {
  return (
    <Card>
      <CardHeader title="Listed outside the US" subtitle="Company data covers US-listed shares" />
      <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
        Fundamentals, statements, earnings and SEC filings are looked up by ticker alone, and that ticker belongs
        to a US-listed company that may not be this one. They are left out here. Range statistics and your
        notes are below.
      </p>
    </Card>
  )
}

function UnverifiedListingNote() {
  return (
    <Card>
      <CardHeader title="Listing not confirmed" subtitle="Company data is held back" />
      <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
        Saxo could not confirm where this instrument is listed. Fundamentals and filings are looked up by US ticker,
        so they are held back until it can. Range statistics and your notes are below.
      </p>
    </Card>
  )
}

function CompanyReads({ companyData, fundamentals }) {
  if (companyData === COMPANY_DATA.fund) return <EtfNote />
  if (companyData === COMPANY_DATA.foreign) return <ForeignListingNote />
  if (companyData === COMPANY_DATA.unverified) return <UnverifiedListingNote />
  if (companyData === COMPANY_DATA.pending) return null
  return <SnapshotSection fundamentals={fundamentals} />
}

function PositionCard({ position }) {
  const gain = Number(position.pnl) >= 0
  const basis =
    position.price_source && position.price_source !== 'live' ? priceBasis(position.price_source).note : undefined

  return (
    <Card>
      <CardHeader title="Your position" subtitle={basis} />
      <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Metric label="Quantity" value={fmtQty(position.qty)} />
        <Metric label="Avg buy" value={fmtMoney(position.avg_cost, position.currency)} />
        <Metric label="Market value" value={fmtEur(position.value, { decimals: 0 })} />
        <Metric
          label="Unrealised P&L"
          value={fmtEur(position.pnl, { sign: true, decimals: 0 })}
          tone={gain ? 'text-emerald-400' : 'text-red-400'}
          hint={fmtPct(position.pnl_pct)}
        />
      </div>
    </Card>
  )
}

function ReferenceStrip({ symbol, details, isLoading }) {
  if (isLoading) return <div className="h-4 w-64 rounded bg-white/[0.05]" />
  const pairs = [
    ['Exchange', details?.exchange_name || details?.exchange],
    ['Currency', details?.currency],
    ['ISIN', details?.isin],
    ['Uic', details?.uic],
    ['Lot size', details?.lot_size],
    ['Asset type', details?.asset_type],
  ].filter(([, value]) => value != null && value !== '')

  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1 text-[var(--fig-xs)] text-zinc-500">
      <span className="text-zinc-400 font-medium">{details?.description || symbol}</span>
      {pairs.map(([label, value]) => (
        <span key={label}>
          {label} <span className="text-zinc-300 num font-mono">{value}</span>
        </span>
      ))}
    </div>
  )
}

function RangeStatsCard({ bars, range }) {
  const stats = rangeStats(bars)
  if (!stats) return null

  return (
    <Card>
      <CardHeader title="Range statistics" subtitle={`Computed from the ${range} candles on screen`} />
      <div className="mt-3 grid grid-cols-1 2xl:grid-cols-2 gap-x-5 gap-y-2.5">
        <Fact label={`${range} high`} value={fmtNum(stats.high, 2)} />
        <Fact label={`${range} low`} value={fmtNum(stats.low, 2)} />
        <Fact label="Last close" value={fmtNum(stats.last, 2)} />
        <Fact label="Avg volume" value={fmtShares(stats.avgVolume)} />
      </div>

      <div className="mt-4 pt-3 border-t border-white/[0.06]">
        <div className="flex items-center justify-between text-[var(--fig-2xs)] text-zinc-500 mb-2 num font-mono">
          <span>{fmtNum(stats.low, 2)}</span>
          <span className="uppercase tracking-wide">{range} range</span>
          <span>{fmtNum(stats.high, 2)}</span>
        </div>
        <div className="relative h-1.5 bg-white/[0.07] rounded-full">
          <span
            className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-blue-400"
            style={{ left: `${Math.min(100, Math.max(0, stats.positionInRange))}%` }}
          />
        </div>
      </div>
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
}) {
  const company = companyData === COMPANY_DATA.eligible && fundamentals?.data?.available ? fundamentals.data : null
  const returns = useMemo(() => trailingReturns(allBars), [allBars])
  const hasReturns = returns.some((row) => row.pct != null)

  return (
    <div className="space-y-4">
      {position ? <PositionCard position={position} /> : null}

      {company && <KeyFactsStrip fundamentals={company} />}

      {hasReturns && (
        <Card>
          <CardHeader title="Performance" subtitle="Change in price up to the latest close" />
          <div className="mt-3 [&>ul]:grid-cols-6">
            <PerformanceTiles returns={returns} />
          </div>
        </Card>
      )}
      <CompanyReads companyData={companyData} fundamentals={fundamentals} />
      {company && (
        <div className="grid gap-4 lg:grid-cols-2">
          <OwnershipCard fundamentals={company} />
          <CapitalStructureCard fundamentals={company} />
        </div>
      )}
      {company && <AnalystRatingCard fundamentals={company} />}

      <ReferenceStrip symbol={symbol} details={details} isLoading={detailsLoading} />

      <BusinessSummaryCard note={note?.data} onSave={onSaveNote} />

      <RangeStatsCard bars={bars} range={range} />

      <ThesisAndRisksCard
        note={note?.data}
        onSave={onSaveNote}
        onMarkReviewed={onMarkReviewed}
        reviewing={reviewing}
        fundamentals={fundamentals}
        currency={details?.currency}
      />
    </div>
  )
}
