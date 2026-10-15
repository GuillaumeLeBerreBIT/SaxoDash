import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useFundamentals, useMarkReviewedMutation, useSymbolNoteMutation } from '../api/queries'
import { COMPANY_DATA, TAB_GATE, tabGate } from '../lib/companyData'
import { chartHref } from '../lib/research'
import { Card, PageHeader, TabButton, TabList } from '../components/ui'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { readRecentSymbols } from '../lib/recentSymbols'
import ChartPanel from '../components/research/ChartPanel'
import EarningsTab from '../components/research/EarningsTab'
import FundsTab from '../components/research/FundsTab'
import CongressTab from '../components/research/CongressTab'
import GuideTab from '../components/research/GuideTab'
import NewsTab from '../components/research/NewsTab'
import FilingsTab from '../components/research/FilingsTab'
import FinancialsTab from '../components/research/FinancialsTab'
import OverviewTab from '../components/research/OverviewTab'
import PeersTab from '../components/research/PeersTab'
import SymbolBar from '../components/research/SymbolBar'
import StatisticsTab from '../components/research/StatisticsTab'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const TABS = [
  ['overview', 'Overview'],
  ['financials', 'Financials', 'company'],
  ['statistics', 'Statistics', 'company'],
  ['peers', 'Peers', 'company'],
  ['earnings', 'Earnings', 'company'],
  ['funds', 'Funds'],
  ['congress', 'Congress'],
  ['filings', 'Filings', 'company'],
  ['news', 'News', 'ticker'],
  ['guide', 'Guide'],
]

const TAB_ALIASES = { valuation: 'statistics' }
const TAB_NEEDS = Object.fromEntries(TABS.map(([key, , needs]) => [key, needs]))
const TAB_KEYS = new Set(Object.keys(TAB_NEEDS))

const REFUSALS = {
  [COMPANY_DATA.foreign]:
    'This is looked up by US ticker, which may name another company, so it is left out for a listing outside the US.',
  [COMPANY_DATA.unverified]:
    'Saxo could not confirm where this instrument is listed, so data looked up by US ticker is held back. Reload once Saxo answers.',
}

export default function Research() {
  const [params] = useSearchParams()
  const { symbol, instrument, resolving, position, positions, selectSymbol } = useResearchInstrument()

  const controls = useChartControls()
  const [hover, setHover] = useState(null)
  const rawTab = params.get('tab')
  const requestedTab = TAB_ALIASES[rawTab] ?? rawTab
  const [tab, setTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : 'overview')

  const [scaledSymbol, setScaledSymbol] = useState(symbol)
  if (scaledSymbol !== symbol) {
    setScaledSymbol(symbol)
    controls.resetView()
  }

  const recentSymbols = readRecentSymbols().filter((s) => s !== symbol)

  const {
    chart,
    bars,
    allBars,
    rangeBars,
    ind,
    timeWindow,
    earnings,
    earningsMarkers,
    note,
    priceLines,
    quote,
    details,
    companyData,
    currency,
  } = useChartData({
    symbol,
    instrument,
    range: controls.range,
    timeView: controls.timeView,
    position,
    resolving,
  })
  const companySymbol = companyData === COMPANY_DATA.eligible ? symbol : ''
  const fundamentals = useFundamentals(companySymbol)

  const gateOf = (key) => tabGate(TAB_NEEDS[key], companyData)
  const visibleTabs = TABS.filter(([key]) => gateOf(key) !== TAB_GATE.hidden)
  const gate = gateOf(tab)
  if (gate === TAB_GATE.hidden) {
    setTab('overview')
  }
  const shown = (key) => tab === key && gate === TAB_GATE.show
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

            <TabList label="Instrument sections" className="pb-px overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
              {visibleTabs.map(([key, label]) => (
                <TabButton
                  key={key}
                  id={`research-tab-${key}`}
                  controls={`research-panel-${key}`}
                  active={tab === key}
                  onClick={() => setTab(key)}
                  className="shrink-0 px-3! md:h-8!"
                >
                  {label}
                </TabButton>
              ))}
            </TabList>

            <div role="tabpanel" id={`research-panel-${tab}`} aria-labelledby={`research-tab-${tab}`}>
              {shown('overview') ? (
                <OverviewTab
                  symbol={symbol}
                  position={position}
                  details={details.data}
                  detailsLoading={details.isLoading}
                  bars={rangeBars}
                  allBars={allBars}
                  range={controls.range}
                  fundamentals={fundamentals}
                  note={note}
                  onSaveNote={(patch) => noteMutation.mutate(patch)}
                  onMarkReviewed={() => reviewMutation.mutate()}
                  reviewing={reviewMutation.isPending}
                  companyData={companyData}
                />
              ) : null}
              {gate === TAB_GATE.pending ? (
                <Card>
                  <p data-testid="tab-pending" className="text-[var(--fig-xs)] text-zinc-500">
                    Looking up this instrument…
                  </p>
                </Card>
              ) : null}
              {gate === TAB_GATE.refused ? (
                <Card>
                  <p data-testid="tab-refused" className="text-[var(--fig-xs)] text-zinc-500">
                    {REFUSALS[companyData]}
                  </p>
                </Card>
              ) : null}
              {shown('financials') ? <FinancialsTab symbol={symbol} fundamentals={fundamentals} /> : null}
              {shown('statistics') ? <StatisticsTab fundamentals={fundamentals} /> : null}
              {shown('peers') ? <PeersTab symbol={symbol} fundamentals={fundamentals} /> : null}
              {shown('earnings') ? (
                <EarningsTab key={symbol} symbol={symbol} earnings={earnings} fundamentals={fundamentals} />
              ) : null}
              {shown('funds') ? <FundsTab symbol={symbol} currency={currency} /> : null}
              {shown('congress') ? <CongressTab symbol={symbol} currency={currency} /> : null}
              {shown('filings') ? <FilingsTab key={symbol} symbol={symbol} /> : null}
              {shown('news') ? <NewsTab key={symbol} symbol={symbol} /> : null}
              {shown('guide') ? <GuideTab /> : null}
            </div>
          </div>

          <WatchlistRail symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </div>
    </div>
  )
}
