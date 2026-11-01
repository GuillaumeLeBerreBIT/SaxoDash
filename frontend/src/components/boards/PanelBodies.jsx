import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { Link2 } from 'lucide-react'

import {
  useChart,
  useDiscoverShelf,
  useOwnershipSummary,
  usePerformance,
  usePortfolioInsights,
  usePortfolioSummary,
  usePositionQuotes,
  usePositions,
} from '../../api/queries'
import { useSize } from '../../lib/chartGeometry'
import { DEFAULT_PANE_HEIGHTS } from '../../lib/chartOptions'
import { chartPlaceholderFor } from '../../lib/chartState'
import { COMPANY_DATA, TAB_GATE, tabGate } from '../../lib/companyData'
import { fmtDate, fmtEur, fmtMoney } from '../../lib/format'
import { activatesRow } from '../../lib/keys'
import { ownershipTickers } from '../../lib/ownership'
import { trailingReturns } from '../../lib/performance'
import { DAILY_HORIZON, WIDEST_RANGE_COUNT, chartHref, researchHref } from '../../lib/research'
import { Alert, Card, InstrumentLogo, Move, Skeleton } from '../ui'
import AllocationPanel from '../dashboard/AllocationPanel'
import PortfolioHeatmap from '../dashboard/PortfolioHeatmap'
import PositionsPanel from '../dashboard/PositionsPanel'
import SmartMoney from '../dashboard/SmartMoney'
import UpcomingEarnings from '../dashboard/UpcomingEarnings'
import VsBenchmark from '../dashboard/VsBenchmark'
import ChartCanvas from '../research/ChartCanvas'
import { RangeButtons } from '../research/chartHeader'
import NewsTab from '../research/NewsTab'
import PerformanceTiles from '../research/PerformanceTiles'
import WatchlistRail from '../research/WatchlistRail'
import { useChartControls } from '../research/useChartControls'
import { useChartData } from '../research/useChartData'
import { useFollowedInstrument } from './useFollowedInstrument'

const FILL = 'h-full overflow-auto'
const NO_POSITIONS = []
const DEFAULT_SHELF = 'oversold'
const YEAR_SESSIONS = 252

const followedSymbol = (board, panel) => panel.cfg?.sym || board.sym

function FollowContext({ board, panel }) {
  const symbol = followedSymbol(board, panel)
  if (panel.cfg?.sym) return <>Fixed · {symbol}</>
  return (
    <>
      <Link2 size={13} aria-hidden="true" className="inline-block align-[-2px] mr-1.5 text-ink-2" />
      Follows watchlist · <b className="font-bold">{symbol || '—'}</b>
    </>
  )
}

function NothingFollowed({ board, panel, title }) {
  return (
    <Card className={FILL} context={<FollowContext board={board} panel={panel} />} dot="off" title={title}>
      <p className="text-[13px] text-ink-3">Pick a symbol in a watchlist, heatmap, shelf or positions panel.</p>
    </Card>
  )
}

function LoadingCard({ context, title }) {
  return (
    <Card className={FILL} context={context} dot="off" title={title}>
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-24 w-full mt-3" />
    </Card>
  )
}

function usePortfolioRows() {
  const positionsQuery = usePositions()
  const positions = positionsQuery.data ?? NO_POSITIONS
  const quotes = usePositionQuotes(positions)
  return { positionsQuery, positions, quotes }
}

function FixedList({ board, panel, onFollow }) {
  const list = panel.cfg.list
  return (
    <Card
      className={FILL}
      context={`Custom list · ${list.length} symbol${list.length === 1 ? '' : 's'}`}
      dot="off"
      title={panel.cfg.title || 'Watchlist'}
    >
      <ul className="-mx-2">
        {list.map((symbol) => (
          <li key={symbol}>
            <div
              role="button"
              tabIndex={0}
              aria-current={symbol === board.sym || undefined}
              onClick={() => onFollow(symbol)}
              onKeyDown={(event) => {
                if (!activatesRow(event)) return
                event.preventDefault()
                onFollow(symbol)
              }}
              className={`flex items-center gap-2.5 min-h-11 px-2 rounded-lg cursor-pointer ${
                symbol === board.sym ? 'bg-selected' : 'hover:bg-hover'
              }`}
            >
              <InstrumentLogo symbol={symbol} size={24} />
              <span className="text-[13.5px] font-semibold text-ink">{symbol}</span>
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[12px] text-ink-3">A fixed list carries tickers only; quotes show in your saved watchlists.</p>
    </Card>
  )
}

export function WatchlistPanel({ board, panel, onFollow }) {
  const { positions } = usePortfolioRows()
  const held = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  if (Array.isArray(panel.cfg?.list)) return <FixedList board={board} panel={panel} onFollow={onFollow} />
  return <WatchlistRail fill symbol={board.sym} onSelectSymbol={(symbol) => onFollow(symbol)} heldSymbols={held} />
}

function ChartBody({ symbol, instrument, resolving }) {
  const controls = useChartControls()
  const data = useChartData({ symbol, instrument, range: controls.range, timeView: controls.timeView, resolving })
  const [hover, setHover] = useState(null)
  const [ref, size] = useSize()
  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="flex flex-wrap items-center gap-2">
        <RangeButtons controls={controls} />
      </div>
      <div ref={ref} className="flex-1 min-h-0 mt-2 overflow-hidden">
        <ChartCanvas
          bars={data.bars}
          ind={data.ind}
          timeWindow={data.timeWindow}
          controls={controls}
          hover={hover}
          setHover={setHover}
          symbol={symbol}
          isLoading={data.chart.isLoading || resolving}
          error={data.chart.error}
          unresolved={!instrument && !resolving}
          earningsMarkers={data.earningsMarkers}
          lines={data.priceLines.lines}
          fitHeight={size.height}
          paneHeights={DEFAULT_PANE_HEIGHTS}
          shedToFit
        />
      </div>
    </div>
  )
}

export function ChartBoardPanel({ board, panel }) {
  const symbol = followedSymbol(board, panel)
  const { instrument, resolving } = useFollowedInstrument(symbol)
  if (!symbol) return <NothingFollowed board={board} panel={panel} title="Price chart" />
  return (
    <Card
      className="h-full flex flex-col overflow-hidden"
      context={<FollowContext board={board} panel={panel} />}
      dot="ok"
      title={symbol}
      right={
        <Link
          to={chartHref(symbol, instrument)}
          className="inline-flex items-center h-7 px-2.5 rounded-lg text-[12px] font-semibold text-ink-2 hover:text-ink hover:bg-hover whitespace-nowrap"
        >
          Open in Chart
        </Link>
      }
    >
      <div className="flex-1 min-h-0">
        <ChartBody key={symbol} symbol={symbol} instrument={instrument} resolving={resolving} />
      </div>
    </Card>
  )
}

function YearRange({ bars }) {
  const year = bars.slice(-YEAR_SESSIONS)
  if (year.length < 2) return null
  const closes = year.map((bar) => bar.close)
  const low = Math.min(...closes)
  const high = Math.max(...closes)
  const last = closes[closes.length - 1]
  const at = high === low ? 100 : ((last - low) / (high - low)) * 100
  return (
    <div className="mt-3.5">
      <div className="text-[12px] text-ink-3">{year.length < YEAR_SESSIONS ? 'Range of the fetched history' : '52-week range'}</div>
      <div className="mt-1 flex justify-between text-[13px] font-semibold num text-ink">
        <span>{low.toFixed(2)}</span>
        <span>{high.toFixed(2)}</span>
      </div>
      <div className="relative mt-1.5 h-1.5 rounded-full bg-track" role="img" aria-label={`Last close ${at.toFixed(0)}% of the way up the range`}>
        <span className="absolute inset-y-0 left-0 rounded-full bg-ink-3" style={{ width: `${at}%` }} />
      </div>
    </div>
  )
}

export function SymbolStatsPanel({ board, panel }) {
  const symbol = followedSymbol(board, panel)
  const { instrument, position, resolving } = useFollowedInstrument(symbol)
  const chart = useChart({
    uic: instrument?.uic,
    assetType: instrument?.assetType,
    horizon: DAILY_HORIZON,
    count: WIDEST_RANGE_COUNT,
  })
  const bars = useMemo(() => chart.data ?? [], [chart.data])
  const returns = useMemo(() => trailingReturns(bars), [bars])
  if (!symbol) return <NothingFollowed board={board} panel={panel} title="Symbol stats" />
  const placeholder = chartPlaceholderFor({
    isLoading: chart.isLoading || resolving,
    error: chart.error,
    data: bars,
    minPoints: 2,
    height: 120,
    symbol,
    unresolved: !instrument && !resolving,
  })
  return (
    <Card className={FILL} context={<FollowContext board={board} panel={panel} />} dot="ok" title={`${symbol} at a glance`}>
      {placeholder ?? (
        <>
          <PerformanceTiles returns={returns} />
          <YearRange bars={bars} />
        </>
      )}
      {position ? (
        <div className="mt-3 flex items-center gap-3 min-h-8 text-[13.5px]">
          <span className="flex-1 text-ink-2">Your position</span>
          <b className="num text-ink">{fmtEur(position.value)}</b>
          <Move value={position.pnl_pct} digits={1} />
        </div>
      ) : null}
      <Link to={researchHref(symbol, undefined, instrument)} className="mt-3 inline-block text-[12px] font-semibold text-ink-2 hover:text-ink">
        Open in Research →
      </Link>
    </Card>
  )
}

export function NewsPanel({ board, panel }) {
  const symbol = followedSymbol(board, panel)
  const { companyData } = useFollowedInstrument(symbol)
  const gate = tabGate('ticker', companyData)
  if (!symbol) return <NothingFollowed board={board} panel={panel} title="News" />
  const context = <FollowContext board={board} panel={panel} />
  if (gate === TAB_GATE.pending) return <LoadingCard context={context} title="News" />
  if (gate !== TAB_GATE.show) {
    return (
      <Card className={FILL} context={context} dot="off" title="News">
        <p className="text-[13px] text-ink-3">
          {companyData === COMPANY_DATA.foreign
            ? `${symbol} is not a US listing, so Finnhub's news for that ticker could be about another company.`
            : `The listing currency of ${symbol} is unknown, so its news is not shown.`}
        </p>
      </Card>
    )
  }
  return <NewsTab symbol={symbol} context={context} className={FILL} />
}

export function HeatmapPanel({ onFollow }) {
  const { positionsQuery, positions, quotes } = usePortfolioRows()
  if (positionsQuery.isLoading) return <LoadingCard context="Your positions" title="Today heatmap" />
  if (positionsQuery.error) return <Unavailable title="Today heatmap" what="your positions" />
  return <PortfolioHeatmap className={FILL} positions={positions} quotes={quotes} onSelect={onFollow} />
}

function Unavailable({ title, what }) {
  return (
    <Card className={FILL} context="Not available" dot="warn" title={title}>
      <Alert>Could not load {what}.</Alert>
    </Card>
  )
}

export function EarningsPanel() {
  const insights = usePortfolioInsights()
  if (insights.isLoading) return <LoadingCard context="Holdings" title="Your earnings" />
  if (insights.error) return <Unavailable title="Your earnings" what="upcoming earnings" />
  return (
    <Card className={FILL} context="Holdings · next 2 weeks" dot="earn" title="Your earnings">
      <UpcomingEarnings items={insights.data?.upcoming_earnings ?? []} />
    </Card>
  )
}

export function PositionsBoardPanel({ onFollow }) {
  const { positionsQuery, positions, quotes } = usePortfolioRows()
  const summary = usePortfolioSummary()
  if (positionsQuery.isLoading || summary.isLoading) return <LoadingCard context="Saxo" title="Positions" />
  if (positionsQuery.error || summary.error || !summary.data) return <Unavailable title="Positions" what="your positions" />
  return <PositionsPanel className={FILL} summary={summary.data} positions={positions} quotes={quotes} onSelect={onFollow} />
}

export function AllocationBoardPanel() {
  const { positionsQuery, positions } = usePortfolioRows()
  const insights = usePortfolioInsights()
  if (positionsQuery.isLoading || insights.isLoading) return <LoadingCard context="Your positions" title="Allocation" />
  if (positionsQuery.error || insights.error) return <Unavailable title="Allocation" what="your allocation" />
  return (
    <AllocationPanel
      className={FILL}
      positions={positions}
      currency={insights.data?.currency_exposure}
      concentration={insights.data?.concentration}
    />
  )
}

export function ShelfPanel({ panel, onFollow }) {
  const key = panel.cfg?.shelf || DEFAULT_SHELF
  const { data, isLoading, error } = useDiscoverShelf(key)
  if (isLoading) return <LoadingCard context="Discover" title="Discover shelf" />
  if (error || !data) return <Unavailable title="Discover shelf" what="this Discover shelf" />
  return (
    <Card
      className={FILL}
      context={`Discover · ${data.subtitle} · scan ${fmtDate(data.as_of)}`}
      dot="warn"
      title={data.title}
      right={<span className="text-[13px] text-ink-3 num">{data.total}</span>}
    >
      {data.items.length === 0 ? (
        <p className="text-[13px] text-ink-3">Nothing matches this lens in the latest scan.</p>
      ) : (
        <ul className="-mx-2">
          {data.items.slice(0, 8).map((item) => (
            <li key={`${item.uic}:${item.asset_type}`}>
              <button
                type="button"
                onClick={() => onFollow(item.ticker)}
                className="flex items-center gap-2.5 w-full min-h-11 px-2 rounded-lg text-left hover:bg-hover"
              >
                <InstrumentLogo symbol={item.ticker} size={24} />
                <span className="w-14 shrink-0 text-[13.5px] font-semibold text-ink">{item.ticker}</span>
                <span className="flex-1 min-w-0 truncate text-[12px] text-ink-3">{item.name}</span>
                <span className="text-[13px] num text-ink">{fmtMoney(item.last_close, 'USD')}</span>
                <Move value={item.change_1d} className="w-[72px] text-right text-[13px]" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

export function FundsPanel() {
  const { positionsQuery, positions } = usePortfolioRows()
  const tickers = useMemo(() => ownershipTickers(positions), [positions])
  const ownership = useOwnershipSummary(tickers).data
  if (positionsQuery.isLoading) return <LoadingCard context="13F" title="Smart money" />
  if (positionsQuery.error) return <Unavailable title="Smart money" what="your positions" />
  return <SmartMoney className={FILL} positions={positions} ownership={ownership} />
}

export function PerformancePanel() {
  const performance = usePerformance('sp500')
  if (performance.isLoading) return <LoadingCard context="Time-weighted" title="Vs the US 500" />
  if (performance.error) return <Unavailable title="Vs the US 500" what="your performance" />
  return <VsBenchmark className={FILL} data={performance.data} />
}

export function NetWorthPanel() {
  const insights = usePortfolioInsights()
  if (insights.isLoading) return <LoadingCard context="Saxo + bank" title="Net worth" />
  if (insights.error || !insights.data) return <Unavailable title="Net worth" what="your net worth" />
  const { value, change, as_of: asOf, stale } = insights.data
  const day = change?.day
  return (
    <Card
      className={FILL}
      context={`Saxo + bank · as of ${fmtDate(asOf)}${stale ? ' · stale' : ''}`}
      dot={stale ? 'warn' : 'ok'}
      title="Net worth"
    >
      <div className="text-[26px] font-bold tracking-[-0.01em] num text-ink">{fmtEur(value?.net_worth)}</div>
      <div className="mt-1 flex items-baseline gap-2 text-[13.5px] font-semibold">
        <Move value={day?.pct ?? null} />
        {day?.abs != null ? <span className="num text-ink-2">{fmtEur(day.abs, { sign: true, decimals: 0 })}</span> : null}
        <span className="text-[12px] font-normal text-ink-3">day</span>
      </div>
    </Card>
  )
}
