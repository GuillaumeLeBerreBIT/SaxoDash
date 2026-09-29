import { useEffect, useMemo, useState } from 'react'

import { ADVANCED_PANE_HEIGHTS } from '../lib/chartOptions'
import { useSize } from '../lib/chartGeometry'
import { isTypingTarget } from '../lib/priceLines'
import { chartHref, researchHref } from '../lib/research'
import { Card } from '../components/ui'
import CommandPalette from '../components/CommandPalette'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { useCommandPalette } from '../components/useCommandPalette'
import ChartCanvas from '../components/research/ChartCanvas'
import ChartToolRail from '../components/research/ChartToolRail'
import SymbolBar from '../components/research/SymbolBar'
import WatchlistRail from '../components/research/WatchlistRail'
import { LineSaveAlert, PeriodChange, RangeButtons } from '../components/research/chartHeader'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })
const paletteHrefFor = (symbol, instrument) => chartHref(symbol, instrument)

export default function ResearchChart() {
  const { symbol, instrument, position, positions, selectSymbol } = useResearchInstrument()
  const controls = useChartControls()
  const [hover, setHover] = useState(null)
  const [placingLine, setPlacingLine] = useState(false)

  const [shownSymbol, setShownSymbol] = useState(symbol)
  if (shownSymbol !== symbol) {
    setShownSymbol(symbol)
    controls.setYScale(1)
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

  const { chart, bars, ind, earningsMarkers, priceLines, quote, details } = useChartData({
    symbol,
    instrument,
    range: controls.range,
  })
  const { watchlists, toggleList } = useWatchlistToggle({ symbol, instrument, details: details.data, position })
  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  const palette = useCommandPalette()

  const [canvasRef, canvasSize] = useSize()
  const safeHover = hover != null && hover < bars.length ? hover : null

  return (
    <div className="h-screen overflow-hidden bg-zinc-950 text-zinc-100 grid grid-cols-[48px_minmax(0,1fr)] lg:grid-cols-[48px_minmax(0,1fr)_300px]">
      <ChartToolRail
        controls={controls}
        placingLine={placingLine}
        onPlacingLineChange={setPlacingLine}
        canPlaceLine={Boolean(priceLines.create)}
        backHref={researchHref(symbol, undefined, instrument)}
      />

      <main className="flex flex-col gap-2 p-2 min-w-0 min-h-0">
        <SymbolBar
          compact
          symbol={symbol}
          instrument={instrument}
          details={details.data}
          position={position}
          quote={quote}
          bars={bars}
          watchlists={watchlists}
          onToggleList={toggleList}
        />

        <Card padding={false} className="flex-1 min-h-0 flex flex-col overflow-hidden">
          <div className="flex items-center gap-1 px-2.5 py-2 border-b border-white/[0.06]">
            <RangeButtons controls={controls} />
            <LineSaveAlert failed={priceLines.saveFailed} />
            <div className="ml-auto flex items-center gap-3">
              <PeriodChange bars={bars} />
              <SaxoConnectionStatus />
            </div>
          </div>

          <div ref={canvasRef} className="flex-1 min-h-0 overflow-hidden">
            <ChartCanvas
              bars={bars}
              ind={ind}
              controls={controls}
              hover={safeHover}
              setHover={setHover}
              symbol={symbol}
              isLoading={chart.isLoading}
              error={chart.error}
              unresolved={!instrument && !chart.isLoading}
              earningsMarkers={earningsMarkers}
              lines={priceLines.lines}
              onMoveLine={priceLines.move}
              onCreateLine={priceLines.create}
              onDeleteLine={priceLines.remove}
              fitHeight={canvasSize.height}
              paneHeights={ADVANCED_PANE_HEIGHTS}
              placingLine={placingLine}
              onPlaced={() => setPlacingLine(false)}
            />
          </div>
        </Card>
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
