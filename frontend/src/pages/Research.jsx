import { useMemo, useState } from 'react'
import { useOutletContext, useSearchParams } from 'react-router-dom'

import { useFundamentals, useMarkReviewedMutation, useSymbolNoteMutation, useVerdict } from '../api/queries'
import { COMPANY_DATA, TAB_GATE, tabGate } from '../lib/companyData'
import { chartHref } from '../lib/research'
import { Card } from '../components/ui'
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
import OwnershipSignals from '../components/research/OwnershipSignals'
import ResearchHeader from '../components/research/ResearchHeader'
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
  const outlet = useOutletContext()
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
    futureDates,
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
  const verdict = useVerdict(companySymbol)

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

  const company = companyData === COMPANY_DATA.eligible && fundamentals.data?.available ? fundamentals.data : null
  const onOverview = shown('overview')

  const header = (
    <ResearchHeader
      symbol={symbol}
      instrument={instrument}
      details={details.data}
      position={position}
      positions={positions}
      verdict={verdict}
      quote={quote}
      bars={rangeBars}
      company={company}
      currency={currency}
      watchlists={watchlists}
      onToggleList={toggleList}
      tabs={visibleTabs}
      activeTab={tab}
      onSelectTab={setTab}
      recentSymbols={recentSymbols}
      onSelectSymbol={selectSymbol}
      onOpenPalette={outlet?.openPalette}
      showPosition={!onOverview}
    />
  )

  const chartPanel = (
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
      futureDates={futureDates}
      lines={priceLines.lines}
      onMoveLine={priceLines.move}
      onCreateLine={priceLines.create}
      onDeleteLine={priceLines.remove}
      onEditLineLabel={priceLines.setLabel}
      lineSaveFailed={priceLines.saveFailed}
      expandHref={chartHref(symbol, instrument)}
    />
  )

  const panelProps = { role: 'tabpanel', id: `research-panel-${tab}`, 'aria-labelledby': `research-tab-${tab}` }

  if (onOverview) {
    return (
      <div {...panelProps}>
        <OverviewTab
          symbol={symbol}
          position={position}
          details={details.data}
          detailsLoading={details.isLoading}
          bars={rangeBars}
          allBars={allBars}
          range={controls.range}
          fundamentals={fundamentals}
          verdict={verdict}
          note={note}
          onSaveNote={(patch) => noteMutation.mutate(patch)}
          onMarkReviewed={() => reviewMutation.mutate()}
          reviewing={reviewMutation.isPending}
          companyData={companyData}
          earnings={earnings}
          onOpenTab={setTab}
          header={header}
          lead={chartPanel}
          signals={<OwnershipSignals symbol={symbol} currency={currency} companyData={companyData} onOpenTab={setTab} />}
          rail={<WatchlistRail collapsible symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />}
        />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      {header}
      <div className="grid grid-cols-1 min-[1440px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
        <div {...panelProps} className="min-w-0 min-[1440px]:col-span-9">
          {gate === TAB_GATE.pending ? (
            <Card>
              <p data-testid="tab-pending" className="text-[13px] text-ink-3">
                Looking up this instrument…
              </p>
            </Card>
          ) : null}
          {gate === TAB_GATE.refused ? (
            <Card>
              <p data-testid="tab-refused" className="text-[13px] text-ink-3">
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
        <div className="min-w-0 min-[1440px]:col-span-3">
          <WatchlistRail collapsible symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </div>
    </div>
  )
}
