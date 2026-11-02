import { useEffect, useMemo, useState } from 'react'

import { ADVANCED_PANE_HEIGHTS, DEFAULT_PANE_HEIGHTS } from '../lib/chartOptions'
import { gridStyle, layoutById, paneStyle } from '../lib/chartLayouts'
import { isTypingTarget } from '../lib/priceLines'
import { RAIL_WIDTH, WATCHLIST_HEIGHT } from '../lib/railLayout'
import { chartHref, researchHref } from '../lib/research'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import ChartPane from '../components/research/ChartPane'
import ChartToolRail from '../components/research/ChartToolRail'
import { LinkedHoverProvider } from '../components/research/LinkedHover'
import SymbolBar from '../components/research/SymbolBar'
import ResizeHandle from '../components/research/ResizeHandle'
import SymbolPanel from '../components/research/SymbolPanel'
import WatchlistRail from '../components/research/WatchlistRail'
import { RangeButtons } from '../components/research/chartHeader'
import IndicatorChips from '../components/research/IndicatorChips'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useChartWorkspace } from '../components/research/useChartWorkspace'
import { usePaneViews } from '../components/research/usePaneViews'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { usePersistedSize } from '../components/research/usePersistedSize'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })

export default function ResearchChart() {
  const { symbol, instrument, resolving, position, positions, selectSymbol } = useResearchInstrument()
  const controls = useChartControls()
  const workspace = useChartWorkspace({ symbol, instrument, selectSymbol })
  const layout = layoutById(workspace.layout)
  const linkable = layout.panes > 1
  const linked = workspace.linked && linkable
  const { view: paneView, rangePicked, alignTo } = usePaneViews(workspace.slots, controls.range, linked)
  const setLinked = (next) => {
    workspace.setLinked(next)
    if (next) alignTo(workspace.active)
  }
  const activeView = paneView(workspace.active)
  const rangeControls = {
    ...controls,
    ...activeView,
    setRange: (next) => {
      controls.setRange(next)
      rangePicked()
    },
  }
  const [tool, setTool] = useState('crosshair')

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
    setTool('crosshair')
  }

  useEffect(() => {
    if (tool === 'crosshair') return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setTool('crosshair')
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [tool])

  const { allBars, rangeBars, priceLines, quote, details, earnings, companyData } = useChartData({
    symbol,
    instrument,
    range: controls.range,
    position,
    resolving,
    requireInstrument: true,
  })
  const { watchlists, toggleList } = useWatchlistToggle({ symbol, instrument, details: details.data, position })
  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  const [railWidth, setRailWidth] = usePersistedSize(RAIL_WIDTH)
  const [watchlistHeight, setWatchlistHeight] = usePersistedSize(WATCHLIST_HEIGHT)

  const split = layout.panes > 1
  const activeSlot = workspace.slots[workspace.active]
  const paneHeights = split ? DEFAULT_PANE_HEIGHTS : ADVANCED_PANE_HEIGHTS

  return (
    <div
      className="relative h-[calc(100dvh-12rem)] min-[760px]:h-[calc(100dvh-8.5rem)] min-h-[480px] text-ink flex flex-col gap-3 lg:grid lg:grid-cols-[48px_minmax(0,1fr)_var(--rail-width)]"
      style={{ '--rail-width': `${railWidth}px` }}
    >
      <h1 className="sr-only">Chart workspace</h1>
      <ChartToolRail
        controls={rangeControls}
        tool={tool}
        onToolChange={setTool}
        canAnnotate={Boolean(activeSlot && priceLines.create)}
        backHref={researchHref(symbol, undefined, instrument)}
        layout={workspace.layout}
        onLayoutChange={workspace.setLayout}
        linkable={linkable}
        linked={linked}
        onLinkedChange={setLinked}
      />

      <div className="flex-1 flex flex-col gap-3 min-w-0 min-h-0">
        <SymbolBar
          compact
          symbol={symbol}
          instrument={instrument}
          details={details.data}
          position={position}
          quote={quote}
          bars={rangeBars}
          watchlists={watchlists}
          onToggleList={toggleList}
        />

        <div className="flex flex-wrap items-center gap-2">
          <RangeButtons controls={rangeControls} />
          <IndicatorChips controls={controls} />
          <div className="ml-auto">
            <SaxoConnectionStatus />
          </div>
        </div>

        <LinkedHoverProvider enabled={linked}>
          <div className="flex-1 min-h-0 flex flex-col gap-3 lg:grid" style={gridStyle(layout)}>
            {workspace.slots.map((slot, index) => {
              const active = index === workspace.active
              return (
                <ChartPane
                  key={index}
                  slot={slot}
                  index={index}
                  active={active}
                  outlined={split && active}
                  controls={controls}
                  view={paneView(index)}
                  onActivate={() => workspace.activate(index)}
                  tool={tool}
                  onPlaced={() => setTool('crosshair')}
                  paneHeights={paneHeights}
                  style={paneStyle(layout, index)}
                  className={active ? 'flex' : 'hidden lg:flex'}
                  split={split}
                />
              )
            })}
          </div>
        </LinkedHoverProvider>
      </div>

      <ResizeHandle
        label="Sidebar width"
        orientation="vertical"
        value={railWidth}
        limits={RAIL_WIDTH}
        onResize={setRailWidth}
        invert
        className="hidden lg:block absolute top-0 bottom-0 z-10 w-2"
        style={{ right: `calc(var(--rail-width) + 0.125rem)` }}
      />

      <aside className="hidden lg:flex flex-col gap-1.5 min-h-0 overflow-y-auto">
        <InstrumentSearchBar stacked hrefFor={chartResultHref} />
        <div className="shrink-0 mt-1.5" style={{ height: watchlistHeight }} data-testid="chart-watchlist">
          <WatchlistRail fill gridView symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
        <ResizeHandle
          label="Watchlist height"
          orientation="horizontal"
          value={watchlistHeight}
          limits={WATCHLIST_HEIGHT}
          onResize={setWatchlistHeight}
          className="h-2 shrink-0 flex"
        />
        <SymbolPanel
          symbol={symbol}
          companyData={companyData}
          bars={allBars}
          earnings={earnings}
          href={researchHref(symbol, undefined, instrument)}
          financialsHref={researchHref(symbol, 'financials', instrument)}
        />
      </aside>

    </div>
  )
}
