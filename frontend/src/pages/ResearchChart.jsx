import { useEffect, useMemo, useState } from 'react'

import { ADVANCED_PANE_HEIGHTS, DEFAULT_PANE_HEIGHTS } from '../lib/chartOptions'
import { gridStyle, layoutById, paneStyle } from '../lib/chartLayouts'
import { isTypingTarget } from '../lib/priceLines'
import { chartHref, researchHref } from '../lib/research'
import CommandPalette from '../components/CommandPalette'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { useCommandPalette } from '../components/useCommandPalette'
import ChartPane from '../components/research/ChartPane'
import ChartToolRail from '../components/research/ChartToolRail'
import SymbolBar from '../components/research/SymbolBar'
import WatchlistRail from '../components/research/WatchlistRail'
import { RangeButtons } from '../components/research/chartHeader'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useChartWorkspace } from '../components/research/useChartWorkspace'
import { usePaneViews } from '../components/research/usePaneViews'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })
const paletteHrefFor = (symbol, instrument) => chartHref(symbol, instrument)

export default function ResearchChart() {
  const { symbol, instrument, position, positions, selectSymbol } = useResearchInstrument()
  const controls = useChartControls()
  const workspace = useChartWorkspace({ symbol, instrument, selectSymbol })
  const { view: paneView, rangePicked } = usePaneViews(workspace.slots, controls.range)
  const activeView = paneView(workspace.active)
  const rangeControls = {
    ...controls,
    ...activeView,
    setRange: (next) => {
      controls.setRange(next)
      rangePicked()
    },
  }
  const [placingLine, setPlacingLine] = useState(false)

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
    setPlacingLine(false)
  }

  useEffect(() => {
    if (!placingLine) return undefined
    const onKeyDown = (event) => {
      if (isTypingTarget(event.target)) return
      if (event.key === 'Escape') setPlacingLine(false)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [placingLine])

  const { rangeBars, priceLines, quote, details } = useChartData({ symbol, instrument, range: controls.range })
  const { watchlists, toggleList } = useWatchlistToggle({ symbol, instrument, details: details.data, position })
  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  const palette = useCommandPalette()

  const layout = layoutById(workspace.layout)
  const split = layout.panes > 1
  const activeSlot = workspace.slots[workspace.active]
  const paneHeights = split ? DEFAULT_PANE_HEIGHTS : ADVANCED_PANE_HEIGHTS

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100 grid grid-cols-[48px_minmax(0,1fr)] lg:grid-cols-[48px_minmax(0,1fr)_300px]">
      <ChartToolRail
        controls={rangeControls}
        placingLine={placingLine}
        onPlacingLineChange={setPlacingLine}
        canPlaceLine={Boolean(activeSlot && priceLines.create)}
        backHref={researchHref(symbol, undefined, instrument)}
        layout={workspace.layout}
        onLayoutChange={workspace.setLayout}
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

        <div className="flex items-center gap-1 px-1">
          <RangeButtons controls={rangeControls} />
          <div className="ml-auto">
            <SaxoConnectionStatus />
          </div>
        </div>

        <div className="flex-1 min-h-0 flex flex-col gap-2 lg:grid" style={gridStyle(layout)}>
          {workspace.slots.map((slot, index) => {
            const active = index === workspace.active
            return (
              <ChartPane
                key={index}
                slot={slot}
                active={active}
                outlined={split && active}
                controls={controls}
                view={paneView(index)}
                onActivate={() => workspace.activate(index)}
                placingLine={placingLine}
                onPlaced={() => setPlacingLine(false)}
                paneHeights={paneHeights}
                style={paneStyle(layout, index)}
                className={active ? 'flex' : 'hidden lg:flex'}
                split={split}
              />
            )
          })}
        </div>
      </main>

      <aside className="hidden lg:flex flex-col gap-2 p-2 pl-0 min-h-0">
        <InstrumentSearchBar hrefFor={chartResultHref} />
        <div className="flex-1 min-h-0">
          <WatchlistRail fill gridView symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </aside>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} hrefFor={paletteHrefFor} />
    </div>
  )
}
