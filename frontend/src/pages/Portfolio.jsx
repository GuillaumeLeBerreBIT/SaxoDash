import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useCongressOwnershipSummary, useNetWorth, useOwnershipSummary, usePortfolioSummary, usePositionQuotes, usePositions } from '../api/queries'
import { fmtEur } from '../lib/format'
import { ownershipTickers } from '../lib/ownership'
import { colorForTicker } from '../lib/charts'
import { nextSort, sortRows } from '../lib/sort'
import { useChartColors } from '../theme/useChartColors'
import { Card, EmptyState, Move, QueryState, Segmented, Tile } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import HistoryAreaChart from '../components/HistoryAreaChart'
import GainersLosersChart from '../components/GainersLosersChart'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import AllocationDonut from '../components/AllocationDonut'
import PositionsTable from '../components/portfolio/PositionsTable'
import TransactionsView from '../components/portfolio/TransactionsView'
import { ConcentrationPanel, CurrencyPanel, SectorsPanel } from '../components/portfolio/BalancePanels'

const NO_POSITIONS = []
const SPAN_12 = 'min-[1100px]:col-span-12'
const SPAN_8 = 'min-[1100px]:col-span-8'
const SPAN_4 = 'min-[1100px]:col-span-4'
const TOP_HOLDINGS = 5

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

function SummaryTiles({ summary, netWorth }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(150px,1fr))] gap-2">
      <Tile label="Total net worth" value={fmtEur(netWorth.net_worth)} sub="Portfolio + bank accounts" />
      <Tile
        label="Investment portfolio"
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
        label="Total P&L"
        value={summary.total_pnl == null ? null : fmtEur(summary.total_pnl, { sign: true })}
        tone={pnlTone(summary.total_pnl)}
        sub={`${fmtEur(summary.total_cost)} invested`}
      />
      <Tile
        label="Bank balance"
        value={fmtEur(netWorth.bank_only_total)}
        sub={`+ ${fmtEur(netWorth.broker_cash)} cash at Saxo, included in net worth`}
      />
    </div>
  )
}

function HoldingsAllocation({ positions, className }) {
  const c = useChartColors()
  const positionsValue = positions.reduce((sum, p) => sum + Number(p.value), 0)
  const top = positions.slice().sort((a, b) => Number(b.value) - Number(a.value)).slice(0, TOP_HOLDINGS)
  const other = Math.max(positionsValue - top.reduce((sum, p) => sum + Number(p.value), 0), 0)
  const items = [
    ...top.map((p) => ({ name: p.ticker, value: Number(p.value), color: colorForTicker(p.ticker, c) })),
    ...(other > 0 ? [{ name: 'Other', value: other, color: c.flat, logo: false }] : []),
  ]
  return (
    <Card className={className} context={`Top ${TOP_HOLDINGS} by value`} dot={positionsValue > 0 ? 'ok' : 'off'} title="Holdings allocation">
      {positionsValue > 0 ? (
        <AllocationDonut items={items} formatValue={fmtEur} showIcons />
      ) : (
        <EmptyState title="No priced holdings yet" hint="Allocation needs a value per holding to chart." />
      )}
    </Card>
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
          context={`Saxo + bank accounts${holdings ? ` · ${positions.length} position${positions.length === 1 ? '' : 's'}` : ''} · in euros`}
          dot={failed ? 'warn' : 'ok'}
          right={
            <div className="flex flex-wrap items-center justify-end gap-2">
              <SaxoConnectionStatus />
              <Segmented label="Portfolio view" options={VIEWS} value={view} onChange={chooseView} />
            </div>
          }
        >
          {ready && <SummaryTiles summary={summary} netWorth={netWorth} />}
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
              sort={sort}
              onSort={onSort}
            />
            <SectorsPanel className={SPAN_4} positions={positions} />
            <ConcentrationPanel className={SPAN_4} positions={positions} />
            <CurrencyPanel className={SPAN_4} positions={positions} cash={netWorth.broker_cash} />
            <div className={`${SPAN_8} min-w-0`}>
              <HistoryAreaChart
                title="Portfolio value"
                subtitle="Investment value over time"
                dataKey="portfolio_value"
                name="Portfolio"
                color={c.primary}
              />
            </div>
            <HoldingsAllocation className={SPAN_4} positions={positions} />
            <GainersLosersChart className={SPAN_12} positions={positions} />
          </>
        )}
      </div>
    </>
  )
}
