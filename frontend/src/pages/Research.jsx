import { useEffect, useMemo, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useFundamentals, useMarkReviewedMutation, usePortfolioSummary, useSignals, useStockSignals, useSymbolNoteMutation, useVerdict } from '../api/queries'
import { COMPANY_DATA, TAB_GATE, tabGate } from '../lib/companyData'
import { reportsWithin } from '../lib/earnings'
import { entrySentence } from '../lib/valueGuides'
import { signalsForListing } from '../lib/signals'
import { planFromPage } from '../lib/tradePlan'
import { instrumentKey } from '../lib/research'
import { Card } from '../components/ui'
import AnswerCard from '../components/research/AnswerCard'
import ChartPanel from '../components/research/ChartPanel'
import EarningsTab from '../components/research/EarningsTab'
import FundsTab from '../components/research/FundsTab'
import CongressTab from '../components/research/CongressTab'
import GuideTab from '../components/research/GuideTab'
import NewsTab from '../components/research/NewsTab'
import NotesTab from '../components/research/NotesTab'
import FilingsTab from '../components/research/FilingsTab'
import FinancialsTab from '../components/research/FinancialsTab'
import OverviewTab from '../components/research/OverviewTab'
import PricePanel, { ChartFacts } from '../components/research/PricePanel'
import PeersTab from '../components/research/PeersTab'
import OwnershipSignals from '../components/research/OwnershipSignals'
import ResearchHeader from '../components/research/ResearchHeader'
import ResearchTabs from '../components/research/ResearchTabs'
import StatisticsTab from '../components/research/StatisticsTab'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchChartView } from '../components/research/useResearchChartView'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useTradeRisk } from '../components/research/useTradeRisk'
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
  ['notes', 'Notes'],
  ['guide', 'Guide'],
]

const GROUPS = [
  ['overview', 'Overview', ['overview']],
  ['fundamentals', 'Fundamentals', ['financials', 'statistics', 'peers', 'earnings']],
  ['activity', 'Activity', ['funds', 'congress', 'filings', 'news']],
  ['notes', 'Notes and plan', ['notes', 'guide']],
]
const GROUP_OF = Object.fromEntries(GROUPS.flatMap(([group, , keys]) => keys.map((key) => [key, group])))

const TAB_ALIASES = { valuation: 'statistics' }
const TAB_NEEDS = Object.fromEntries(TABS.map(([key, , needs]) => [key, needs]))
const TAB_KEYS = new Set(Object.keys(TAB_NEEDS))

const ANSWER_NOTES = {
  [COMPANY_DATA.fund]: 'This is an ETF, so there is no company to judge: no earnings, margins or valuation ratios.',
  [COMPANY_DATA.foreign]:
    'No verdict: this is listed outside the US. Company data is looked up by ticker alone, and that ticker belongs to a US-listed company that may not be this one.',
  [COMPANY_DATA.unverified]:
    'No verdict: Saxo could not confirm where this instrument is listed, so company data is held back until it can.',
}

const REFUSALS = {
  [COMPANY_DATA.foreign]:
    'This is looked up by US ticker, which may name another company, so it is left out for a listing outside the US.',
  [COMPANY_DATA.unverified]:
    'Saxo could not confirm where this instrument is listed, so data looked up by US ticker is held back. Reload once Saxo answers.',
}

export default function Research() {
  const [params] = useSearchParams()
  const { symbol, instrument, resolving, position, positions, positionsReady, selectSymbol } = useResearchInstrument()

  const controls = useChartControls()
  const [chartView, setChartView] = useResearchChartView()
  const [hover, setHover] = useState(null)
  const panelRef = useRef(null)
  const [panelFloor, setPanelFloor] = useState(0)
  useEffect(() => {
    const release = () => setPanelFloor(0)
    window.addEventListener('resize', release)
    return () => window.removeEventListener('resize', release)
  }, [])
  const rawTab = params.get('tab')
  const requestedTab = TAB_ALIASES[rawTab] ?? rawTab
  const [tab, setTab] = useState(TAB_KEYS.has(requestedTab) ? requestedTab : 'overview')

  const shownKey = instrumentKey(instrument?.uic, instrument?.assetType)
  const [scaledKey, setScaledKey] = useState(shownKey)
  if (scaledKey !== shownKey) {
    setScaledKey(shownKey)
    setPanelFloor(0)
    controls.resetView()
  }


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
  const signals = useSignals({ enabled: Boolean(companySymbol) }).data
  const stockSignalsAnswer = useStockSignals(companySymbol).data
  const stockSignals = useMemo(
    () => signalsForListing(stockSignalsAnswer, instrument?.uic),
    [stockSignalsAnswer, instrument?.uic],
  )
  const portfolioValue = usePortfolioSummary()?.data?.total_value
  const tradePlan = useMemo(
    () => ({ positions, portfolioValue: positionsReady ? portfolioValue : null }),
    [positions, positionsReady, portfolioValue],
  )
  const chartSignals = useMemo(() => ({ stock: stockSignals, catalogue: signals }), [stockSignals, signals])
  const [riskPct] = useTradeRisk()
  const judgedVerdict = verdict?.data
  const listingUic = instrument?.uic
  const nextReport = earnings?.data?.available ? earnings.data.next : null
  const guideCurrency = details.data?.currency ?? position?.currency
  const guides = useMemo(() => {
    const shown = controls.guides
    const plan = planFromPage({
      bars: allBars, currency: guideCurrency, note: note?.data, positions, position,
      portfolioValue: tradePlan.portfolioValue, riskPct,
    })
    const judged = signalsForListing(judgedVerdict, listingUic)
    return {
      available: ['high52', 'gaps', ...(plan ? ['plan'] : [])],
      currency: guideCurrency,
      valueGuides: {
        high: shown.high52,
        gaps: shown.gaps,
        currency: guideCurrency,
        bars: allBars,
      },
      plan: shown.plan ? plan : null,
      sentence: entrySentence({ verdict: null, plan: shown.plan ? plan : null, held: Boolean(position), currency: guideCurrency }),
      answer: entrySentence({
        verdict: judged, plan: null, held: Boolean(position),
        earnings: judged ? reportsWithin(nextReport, 10) : null, currency: guideCurrency,
      }),
    }
  }, [controls.guides, allBars, guideCurrency, position, positions, note?.data, tradePlan.portfolioValue, riskPct, judgedVerdict, listingUic, nextReport])

  const gateOf = (key) => tabGate(TAB_NEEDS[key], companyData)
  const visibleGroups = GROUPS.map(([key, label, children]) => [
    key,
    label,
    children.filter((child) => gateOf(child) !== TAB_GATE.hidden),
  ]).filter(([, , children]) => children.length)
  const gate = gateOf(tab)
  if (gate === TAB_GATE.hidden) {
    setTab('overview')
  }
  const shown = (key) => tab === key && gate === TAB_GATE.show
  const activeGroup = GROUP_OF[tab]
  const activeSubTabs = visibleGroups.find(([key]) => key === activeGroup)?.[2] ?? []
  const openTab = (next) => {
    setPanelFloor(panelRef.current?.offsetHeight ?? 0)
    setTab(next)
  }
  const selectGroup = (group) => openTab(visibleGroups.find(([key]) => key === group)?.[2][0] ?? 'overview')
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
  const eligible = companyData === COMPANY_DATA.eligible

  const panelLabel = activeSubTabs.length > 1 ? `research-tab-${tab}` : `research-group-${activeGroup}`
  const panelProps = { role: 'tabpanel', id: `research-panel-${tab}`, 'aria-labelledby': panelLabel }

  const header = (
    <ResearchHeader
      symbol={symbol}
      instrument={instrument}
      details={details.data}
      position={position}
      verdict={verdict}
      quote={quote}
      bars={rangeBars}
      company={company}
      currency={currency}
      watchlists={watchlists}
      onToggleList={toggleList}
    />
  )

  const tabs = (
    <ResearchTabs
      groups={visibleGroups}
      activeGroup={activeGroup}
      onSelectGroup={selectGroup}
      subTabs={activeSubTabs.map((key) => TABS.find(([tabKey]) => tabKey === key))}
      activeTab={tab}
      onSelectTab={openTab}
    />
  )

  const showCompanyFacts = companyData === COMPANY_DATA.eligible || companyData === COMPANY_DATA.pending
  const viewSwitch = { value: chartView, onChange: setChartView }

  const priceView = (
    <PricePanel
      bars={bars}
      allBars={allBars}
      controls={controls}
      isLoading={chart.isLoading}
      error={chart.error}
      symbol={symbol}
      unresolved={!instrument && !chart.isLoading}
      currency={currency}
      pe={company?.pe_ratio}
      nextEarnings={nextReport}
      showCompany={showCompanyFacts}
      onOpenEarnings={() => openTab('earnings')}
      viewSwitch={viewSwitch}
    />
  )

  const advancedView = (
    <ChartPanel
      key={shownKey}
      bars={bars}
      ind={ind}
      timeWindow={timeWindow}
      isLoading={chart.isLoading}
      error={chart.error}
      controls={controls}
      viewSwitch={viewSwitch}
      hover={safeHover}
      setHover={setHover}
      symbol={symbol}
      unresolved={!instrument && !chart.isLoading}
      earningsMarkers={earningsMarkers}
      guides={guides}
      futureDates={futureDates}
      lines={priceLines.lines}
      onMoveLine={priceLines.move}
      onCreateLine={priceLines.create}
      onDeleteLine={priceLines.remove}
      onEditLineLabel={priceLines.setLabel}
      lineSaveFailed={priceLines.saveFailed}
      facts={<ChartFacts allBars={allBars} pe={company?.pe_ratio} nextEarnings={nextReport} currency={currency} showCompany={showCompanyFacts} onOpenEarnings={() => openTab('earnings')} className="mt-1" />}
    />
  )

  const answer = (
    <AnswerCard
      verdict={eligible ? verdict : undefined}
      sentence={eligible ? guides.answer : null}
      position={position}
      note={ANSWER_NOTES[companyData]}
    />
  )

  const body = (
    <>
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
      {shown('overview') ? (
        <OverviewTab
          details={details.data}
          detailsLoading={details.isLoading}
          bars={rangeBars}
          allBars={allBars}
          range={controls.range}
          fundamentals={fundamentals}
          verdict={verdict}
          chartSignals={chartSignals}
          companyData={companyData}
        />
      ) : null}
      {shown('notes') ? (
        <NotesTab
          note={note}
          onSaveNote={(patch) => noteMutation.mutate(patch)}
          onMarkReviewed={() => reviewMutation.mutate()}
          reviewing={reviewMutation.isPending}
          fundamentals={fundamentals}
          details={details.data}
          position={position}
          bars={allBars}
          tradePlan={tradePlan}
          verdict={verdict}
          eligible={eligible}
          earnings={earnings}
        />
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
      {shown('guide') ? <GuideTab signals={signals} /> : null}
    </>
  )

  return (
    <div className="flex flex-col gap-[var(--sd-gap,12px)]">
      {header}
      <div className="grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start">
        <div className="min-w-0 order-1 min-[1100px]:order-none min-[1100px]:col-span-8 flex flex-col gap-[var(--sd-gap,12px)]">
          {chartView === 'price' ? priceView : advancedView}
          {answer}
        </div>
        <div className="min-w-0 order-3 min-[1100px]:order-none min-[1100px]:col-span-4 flex flex-col gap-[var(--sd-gap,12px)]">
          <WatchlistRail collapsible symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
          <OwnershipSignals
            symbol={symbol}
            currency={currency}
            companyData={companyData}
            recommendation={fundamentals?.data?.available ? fundamentals.data.recommendation : null}
            onOpenTab={openTab}
          />
        </div>
        <div className="min-w-0 order-2 min-[1100px]:order-none min-[1100px]:col-span-12 flex flex-col gap-[var(--sd-gap,12px)]">
          {tabs}
          <div {...panelProps} style={{ minHeight: panelFloor }} className="min-w-0">
            <div ref={panelRef} className="flow-root">
              {body}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
