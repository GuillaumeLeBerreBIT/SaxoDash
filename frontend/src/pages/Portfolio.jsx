import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useCongressOwnershipSummary, useNetWorth, useOwnershipSummary, usePortfolioSummary, usePositionQuotes, usePositions, useVerdictSummary } from '../api/queries'
import { ownershipTickers } from '../lib/ownership'
import { positionVerdictTickers } from '../lib/verdicts'
import { nextSort, sortRows } from '../lib/sort'
import { QueryState, Segmented } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import PortfolioHero from '../components/portfolio/PortfolioHero'
import PositionsTable from '../components/portfolio/PositionsTable'
import TransactionsView from '../components/portfolio/TransactionsView'
import { ConcentrationPanel, CurrencyPanel, SectorsPanel } from '../components/portfolio/BalancePanels'

const NO_POSITIONS = []
const SPAN_12 = 'min-[1100px]:col-span-12'
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

export default function Portfolio() {
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
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-stretch [&>div>.sd-panel:only-child]:h-full [&>div.flex-col>.sd-panel:last-child]:flex-1">
        {ready ? (
          <div className={`${SPAN_12} min-w-0`}>
            <PortfolioHero
              summary={summary}
              positions={positions}
              quotes={quotes}
              holdingsCount={holdings ? positions.length : null}
              right={
                <>
                  <SaxoConnectionStatus />
                  <Segmented label="Portfolio view" options={VIEWS} value={view} onChange={chooseView} />
                </>
              }
            />
          </div>
        ) : (
          <div className={`${SPAN_12} min-w-0 flex flex-col gap-3`}>
            <div className="flex justify-end">
              <Segmented label="Portfolio view" options={VIEWS} value={view} onChange={chooseView} />
            </div>
            {view === 'positions' ? <QueryState isLoading={!failed} error={failed} onRetry={retryFailed} label="portfolio" /> : null}
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
            <SectorsPanel className={SPAN_4} positions={positions} />
            <ConcentrationPanel className={SPAN_4} positions={positions} />
            <CurrencyPanel className={SPAN_4} positions={positions} cash={netWorth.broker_cash} />
          </>
        )}
      </div>
    </>
  )
}
