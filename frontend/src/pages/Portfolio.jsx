import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useCongressOwnershipSummary, useNetWorth, useOwnershipSummary, usePortfolioSummary, usePositionQuotes, usePositions, useVerdictSummary } from '../api/queries'
import { fmtEur } from '../lib/format'
import { ownershipTickers } from '../lib/ownership'
import { positionVerdictTickers } from '../lib/verdicts'
import { nextSort, sortRows } from '../lib/sort'
import { useChartColors } from '../theme/useChartColors'
import { Card, Move, QueryState, Segmented, Tile } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import HistoryAreaChart from '../components/HistoryAreaChart'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import PositionsTable from '../components/portfolio/PositionsTable'
import TransactionsView from '../components/portfolio/TransactionsView'
import { ConcentrationPanel, CurrencyPanel, SectorsPanel } from '../components/portfolio/BalancePanels'

const NO_POSITIONS = []
const SPAN_12 = 'min-[1100px]:col-span-12'
const SPAN_8 = 'min-[1100px]:col-span-8'
const SPAN_6 = 'min-[1100px]:col-span-6'
const SPAN_4 = 'min-[1100px]:col-span-4'

const VIEWS = [
  { value: 'positions', label: 'Positions' },
  { value: 'transactions', label: 'Transactions' },
]

const finite = (raw) => (raw === null || raw === undefined ? null : Number(raw))

const HOLDING_ACCESSORS = {
  name: (p) => p.ticker,
  qty: (p) => finite(p.qty),
  value: (p) => finite(p.value),
  pnl_pct: (p) => finite(p.pnl_pct),
  pnl: (p) => finite(p.pnl),
  weight: (p) => finite(p.weight),
}

const pnlTone = (value) => (value == null ? undefined : Number(value) >= 0 ? 'up' : 'down')

function SummaryTiles({ summary }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      <Tile
        label="Portfolio value"
        value={fmtEur(summary.total_value)}
        sub={
          summary.total_pnl_pct == null ? (
            '—'
          ) : (
            <>
              <Move value={summary.total_pnl_pct} /> since purchase
            </>
          )
        }
      />
      <Tile
        label="Profit since purchase"
        value={summary.total_pnl == null ? null : fmtEur(summary.total_pnl, { sign: true })}
        tone={pnlTone(summary.total_pnl)}
        sub={`${fmtEur(summary.total_cost)} invested`}
      />
    </div>
  )
}

export default function Portfolio() {
  const c = useChartColors()
  const summaryQuery = usePortfolioSummary()
  const positionsQuery = usePositions()
  const netWorthQuery = useNetWorth()
  const quotes = usePositionQuotes(positionsQuery.data ?? NO_POSITIONS)
  const [searchParams, setSearchParams] = useSearchParams()
  const view = searchParams.get('view') === 'transactions' ? 'transactions' : 'positions'
  const chooseView = (next) => setSearchParams(next === 'transactions' ? { view: next } : {})

  const [sort, setSort] = useState(null)
  const holdings = positionsQuery.data
  const fundTickers = useMemo(() => ownershipTickers(holdings ?? NO_POSITIONS), [holdings])
  const ownership = useOwnershipSummary(fundTickers).data
  const congress = useCongressOwnershipSummary(fundTickers).data
  const verdictTickers = useMemo(() => positionVerdictTickers(holdings ?? NO_POSITIONS), [holdings])
  const verdicts = useVerdictSummary(verdictTickers).data
  const sortedHoldings = useMemo(() => sortRows(holdings ?? NO_POSITIONS, sort, HOLDING_ACCESSORS), [holdings, sort])
  const onSort = (key) => setSort((current) => nextSort(current, key))

  const failed = summaryQuery.error || positionsQuery.error || netWorthQuery.error
  const ready = !failed && summaryQuery.data && netWorthQuery.data
  const retryFailed = () =>
    [summaryQuery, positionsQuery, netWorthQuery].filter((q) => q.error).forEach((q) => q.refetch())

  const summary = summaryQuery.data
  const netWorth = netWorthQuery.data
  const positions = holdings ?? NO_POSITIONS

  return (
    <>
      <h1 className="sr-only">Portfolio</h1>
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
        <Card
          className={SPAN_12}
          context={`Saxo${holdings ? ` · ${positions.length} position${positions.length === 1 ? '' : 's'}` : ''} · in euros`}
          dot={failed ? 'warn' : 'ok'}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SaxoConnectionStatus />
              <Segmented label="Portfolio view" options={VIEWS} value={view} onChange={chooseView} />
            </div>
          }
        >
          {ready && <SummaryTiles summary={summary} />}
        </Card>

        {view === 'positions' && !ready && (
          <div className={`${SPAN_12} min-w-0`}>
            <QueryState isLoading={!failed} error={failed} onRetry={retryFailed} label="portfolio" />
          </div>
        )}

        {view === 'transactions' && <TransactionsView />}

        {view === 'positions' && ready && (
          <>
            <div className={`${SPAN_12} min-w-0`}>
              <InstrumentSearchBar />
            </div>
            <PositionsTable
              className={SPAN_12}
              positions={positions}
              sortedPositions={sortedHoldings}
              summary={summary}
              quotes={quotes}
              ownership={ownership}
              congress={congress}
              verdicts={verdicts}
              sort={sort}
              onSort={onSort}
            />
            <div className={`${SPAN_8} min-w-0`}>
              <HistoryAreaChart
                title="Value over time"
                subtitle="Your investments, in euros"
                dataKey="portfolio_value"
                name="Portfolio"
                color={c.primary}
              />
            </div>
            <SectorsPanel className={SPAN_4} positions={positions} />
            <ConcentrationPanel className={SPAN_6} positions={positions} />
            <CurrencyPanel className={SPAN_6} positions={positions} cash={netWorth.broker_cash} />
          </>
        )}
      </div>
    </>
  )
}
