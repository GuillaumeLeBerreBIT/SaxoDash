import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useFundamentals, useMarkReviewedMutation, useSymbolNoteMutation } from '../api/queries'
import { chartHref, isEtf } from '../lib/research'
import { PageHeader } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { readRecentSymbols } from '../lib/recentSymbols'
import ChartPanel from '../components/research/ChartPanel'
import EarningsTab from '../components/research/EarningsTab'
import GuideTab from '../components/research/GuideTab'
import NewsTab from '../components/research/NewsTab'
import OverviewTab from '../components/research/OverviewTab'
import PeersTab from '../components/research/PeersTab'
import SymbolBar from '../components/research/SymbolBar'
import ValuationTab from '../components/research/ValuationTab'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

// `equityOnly` tabs are all Finnhub company-fundamentals underneath, which
// Finnhub's free tier never returns for an ETF - so unlike a stock with
// temporarily missing data, there's nothing to wait on. Marked here, once,
// so the visible tab list and the hidden-tab reset below can't drift apart.
const TABS = [
  ['overview', 'Overview'],
  ['valuation', 'Valuation', { equityOnly: true }],
  ['peers', 'Peers', { equityOnly: true }],
  ['earnings', 'Earnings', { equityOnly: true }],
  ['news', 'News'],
  ['guide', 'Guide'],
]

const TAB_KEYS = new Set(TABS.map(([key]) => key))
const EQUITY_ONLY_TAB_KEYS = new Set(TABS.filter(([, , meta]) => meta?.equityOnly).map(([key]) => key))

export default function Research() {
  const [params] = useSearchParams()
  const { symbol, instrument, position, positions, selectSymbol } = useResearchInstrument()

  const controls = useChartControls()
  const [hover, setHover] = useState(null)
  const requestedTab = params.get('tab')
  const [tab, setTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : 'overview')

  const [scaledSymbol, setScaledSymbol] = useState(symbol)
  if (scaledSymbol !== symbol) {
    setScaledSymbol(symbol)
    controls.resetView()
  }

  const recentSymbols = readRecentSymbols().filter((s) => s !== symbol)

  const instrumentIsEtf = isEtf(instrument)
  const visibleTabs = instrumentIsEtf ? TABS.filter(([, , meta]) => !meta?.equityOnly) : TABS

  // Adjusted during render, React's own pattern for "reset state when a prop
  // makes it invalid" - covers both a stale `?tab=` link and switching to an
  // ETF mid-session (the watchlist rail, ⌘K) while an equity-only tab is open.
  if (instrumentIsEtf && EQUITY_ONLY_TAB_KEYS.has(tab)) {
    setTab('overview')
  }

  const { chart, bars, rangeBars, ind, timeWindow, earnings, earningsMarkers, note, priceLines, quote, details } =
    useChartData({
      symbol,
      instrument,
      range: controls.range,
      timeView: controls.timeView,
    })
  const fundamentals = useFundamentals(symbol)
  const noteMutation = useSymbolNoteMutation(symbol)
  const reviewMutation = useMarkReviewedMutation(symbol)
  const { watchlists, toggleList } = useWatchlistToggle({
    symbol,
    instrument,
    details: details.data,
    position,
  })

  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])

  // A stale hover index outlives its dataset when the range or symbol changes;
  // clamping here beats an effect that fires after a bad render.
  const safeHover = hover != null && hover < bars.length ? hover : null

  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Prices, indicators and watchlists, straight from Saxo"
        right={<SaxoConnectionStatus />}
      />

      <div className="mb-3">
        <InstrumentSearchBar />
      </div>

      {recentSymbols.length > 0 && (
        <div className="flex items-center gap-1.5 mb-3 flex-wrap">
          <span className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-600">Recent</span>
          {recentSymbols.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => selectSymbol(s)}
              className="h-6 px-2 rounded border border-white/[0.06] text-[var(--fig-xs)] text-zinc-400 hover:text-zinc-100 hover:bg-white/[0.04]"
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="space-y-4">
        <SymbolBar
          symbol={symbol}
          instrument={instrument}
          details={details.data}
          position={position}
          quote={quote}
          bars={rangeBars}
          watchlists={watchlists}
          onToggleList={toggleList}
        />

        {/* The rail drops below the chart under 1280px, where 300px of it
            would leave the candles too narrow to read. */}
        <div className="grid gap-4 items-start grid-cols-1 xl:grid-cols-[minmax(0,1fr)_300px]">
          <div className="space-y-4 min-w-0">
            <ChartPanel
              bars={bars}
              ind={ind}
              timeWindow={timeWindow}
              isLoading={chart.isLoading}
              error={chart.error}
              controls={controls}
              hover={safeHover}
              setHover={setHover}
              symbol={symbol}
              unresolved={!instrument && !chart.isLoading}
              earningsMarkers={earningsMarkers}
              lines={priceLines.lines}
              onMoveLine={priceLines.move}
              onCreateLine={priceLines.create}
              onDeleteLine={priceLines.remove}
              onEditLineLabel={priceLines.setLabel}
              lineSaveFailed={priceLines.saveFailed}
              expandHref={chartHref(symbol, instrument)}
            />

            <div className="flex items-center gap-1 border-b border-white/[0.06] pb-px">
              {visibleTabs.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={tab === key}
                  className={`h-8 px-3 text-[var(--fig-sm)] font-medium border-b-2 -mb-px transition-colors ${
                    tab === key
                      ? 'text-zinc-100 border-blue-500'
                      : 'text-zinc-500 border-transparent hover:text-zinc-300'
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            {tab === 'overview' ? (
              <OverviewTab
                symbol={symbol}
                position={position}
                details={details.data}
                detailsLoading={details.isLoading}
                bars={rangeBars}
                range={controls.range}
                fundamentals={fundamentals}
                note={note}
                onSaveNote={(patch) => noteMutation.mutate(patch)}
                onMarkReviewed={() => reviewMutation.mutate()}
                reviewing={reviewMutation.isPending}
                isEtf={instrumentIsEtf}
              />
            ) : null}
            {tab === 'valuation' ? <ValuationTab fundamentals={fundamentals} /> : null}
            {tab === 'peers' ? <PeersTab symbol={symbol} fundamentals={fundamentals} /> : null}
            {tab === 'earnings' ? (
              <EarningsTab symbol={symbol} earnings={earnings} fundamentals={fundamentals} />
            ) : null}
            {tab === 'news' ? <NewsTab key={symbol} symbol={symbol} /> : null}
            {tab === 'guide' ? <GuideTab /> : null}
          </div>

          <WatchlistRail symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </div>
    </div>
  )
}
