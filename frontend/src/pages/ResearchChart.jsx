import { useEffect, useMemo, useState } from 'react'

import { ADVANCED_PANE_HEIGHTS, DEFAULT_PANE_HEIGHTS } from '../lib/chartOptions'
import { gridStyle, layoutById, paneStyle } from '../lib/chartLayouts'
import { isTypingTarget } from '../lib/priceLines'
import { RAIL_WIDTH, WATCHLIST_HEIGHT } from '../lib/railLayout'
import { chartHref, researchHref } from '../lib/research'
import CommandPalette from '../components/CommandPalette'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { useCommandPalette } from '../components/useCommandPalette'
import ChartPane from '../components/research/ChartPane'
import ChartToolRail from '../components/research/ChartToolRail'
import { LinkedHoverProvider } from '../components/research/LinkedHover'
import SymbolBar from '../components/research/SymbolBar'
import ResizeHandle from '../components/research/ResizeHandle'
import SymbolPanel from '../components/research/SymbolPanel'
import WatchlistRail from '../components/research/WatchlistRail'
import { RangeButtons } from '../components/research/chartHeader'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useChartWorkspace } from '../components/research/useChartWorkspace'
import { usePaneViews } from '../components/research/usePaneViews'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { usePersistedSize } from '../components/research/usePersistedSize'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })
const paletteHrefFor = (symbol, instrument) => chartHref(symbol, instrument)

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
  const palette = useCommandPalette()
  const [railWidth, setRailWidth] = usePersistedSize(RAIL_WIDTH)
  const [watchlistHeight, setWatchlistHeight] = usePersistedSize(WATCHLIST_HEIGHT)

  const split = layout.panes > 1
  const activeSlot = workspace.slots[workspace.active]
  const paneHeights = split ? DEFAULT_PANE_HEIGHTS : ADVANCED_PANE_HEIGHTS

  return (
    <div
      className="relative h-dvh overflow-hidden bg-zinc-950 text-zinc-100 grid grid-cols-[48px_minmax(0,1fr)] lg:grid-cols-[48px_minmax(0,1fr)_var(--rail-width)]"
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

      <main className="flex flex-col gap-2 p-2 min-w-0 min-h-0">
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

        <div className="flex flex-wrap items-center gap-x-1 gap-y-1 px-1">
          <RangeButtons controls={rangeControls} />
          <div className="ml-auto">
            <SaxoConnectionStatus />
          </div>
        </div>

        <LinkedHoverProvider enabled={linked}>
          <div className="flex-1 min-h-0 flex flex-col gap-2 lg:grid" style={gridStyle(layout)}>
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
      </main>

      <ResizeHandle
        label="Sidebar width"
        orientation="vertical"
        value={railWidth}
        limits={RAIL_WIDTH}
        onResize={setRailWidth}
        invert
        className="hidden lg:block absolute top-0 bottom-0 z-10 w-2 py-2"
        style={{ right: `calc(var(--rail-width) - 0.25rem)` }}
      />

      <aside className="hidden lg:flex flex-col gap-1 p-2 pl-0 min-h-0 overflow-y-auto">
        <InstrumentSearchBar hrefFor={chartResultHref} />
        <div className="shrink-0 mt-1" style={{ height: watchlistHeight }} data-testid="chart-watchlist">
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

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} hrefFor={paletteHrefFor} />
    </div>
  )
}
