import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import {
  useChart,
  useInstrumentDetails,
  useInstrumentSearch,
  usePositions,
  useQuotes,
  useWatchlistMutations,
  useWatchlists,
} from '../api/queries'
import { computeIndicators } from '../lib/indicators'
import { DAILY_HORIZON, RANGE_COUNTS, resolveInstrument } from '../lib/research'
import { PageHeader } from '../components/ui'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import ChartPanel from '../components/research/ChartPanel'
import ComingSoon from '../components/research/ComingSoon'
import OverviewTab from '../components/research/OverviewTab'
import SymbolBar from '../components/research/SymbolBar'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'

const TABS = [
  ['overview', 'Overview'],
  ['valuation', 'Valuation'],
  ['market', 'Market context'],
]

const FALLBACK_SYMBOL = 'NVDA'

// Hoisted so an empty result keeps a stable identity and the memos below do
// not recompute on every render.
const NO_BARS = []

export default function Research() {
  const [params, setParams] = useSearchParams()

  const controls = useChartControls()
  const [hover, setHover] = useState(null)
  const [tab, setTab] = useState('overview')

  const { data: positions = [] } = usePositions()
  const symbol = params.get('symbol') ?? positions[0]?.ticker ?? FALLBACK_SYMBOL
  const selectSymbol = (next) => setParams({ symbol: next }, { replace: true })

  const position = positions.find((p) => p.ticker === symbol) ?? null

  // Only searched for when the portfolio cannot answer: a held instrument
  // already knows its own uic.
  const { data: searchResults = [] } = useInstrumentSearch(position?.uic ? '' : symbol)
  const instrument = useMemo(
    () => resolveInstrument({ symbol, positions, results: searchResults }),
    [symbol, positions, searchResults],
  )

  const chart = useChart({
    uic: instrument?.uic,
    assetType: instrument?.assetType,
    horizon: DAILY_HORIZON,
    count: RANGE_COUNTS[controls.range],
  })
  const bars = chart.data ?? NO_BARS
  const ind = useMemo(() => computeIndicators(bars), [bars])

  const details = useInstrumentDetails({
    uic: instrument?.uic,
    assetType: instrument?.assetType,
  })
  const liveQuotes = useQuotes(instrument?.uic ? [instrument.uic] : [], instrument?.assetType)

  const { data: watchlists = [] } = useWatchlists()
  const { addItem, removeItem } = useWatchlistMutations()

  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])

  // A stale hover index outlives its dataset when the range or symbol changes;
  // clamping here beats an effect that fires after a bad render.
  const safeHover = hover != null && hover < bars.length ? hover : null

  const toggleList = (list) => {
    const existing = list.items.find((item) => item.uic === instrument?.uic)
    if (existing) {
      removeItem.mutate({ id: list.id, itemId: existing.id })
      return
    }
    if (!instrument) return
    addItem.mutate({
      id: list.id,
      item: {
        symbol,
        uic: instrument.uic,
        asset_type: instrument.assetType,
        description: details.data?.description ?? position?.name ?? '',
        exchange: details.data?.exchange ?? '',
      },
    })
  }

  return (
    <div>
      <PageHeader
        title="Research"
        subtitle="Prices, indicators and watchlists, straight from Saxo"
        right={<SaxoConnectionStatus />}
      />

      <div className="space-y-4">
        <SymbolBar
          symbol={symbol}
          instrument={instrument}
          details={details.data}
          position={position}
          quote={liveQuotes.data?.[0]}
          bars={bars}
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
              isLoading={chart.isLoading}
              error={chart.error}
              controls={controls}
              hover={safeHover}
              setHover={setHover}
            />

            <div className="flex items-center gap-1 border-b border-white/[0.06] pb-px">
              {TABS.map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  aria-current={tab === key}
                  className={`h-8 px-3 text-[12.5px] font-medium border-b-2 -mb-px transition-colors ${
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
                bars={bars}
                range={controls.range}
              />
            ) : null}
            {tab === 'valuation' ? <ComingSoon feature="Valuation" /> : null}
            {tab === 'market' ? <ComingSoon feature="Market context" /> : null}
          </div>

          <WatchlistRail symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </div>
    </div>
  )
}
