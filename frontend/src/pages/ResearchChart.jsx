import { useMemo, useState } from 'react'

import { fmtPct } from '../lib/format'
import { ADVANCED_PANE_HEIGHTS } from '../lib/chartOptions'
import { pricePaneHeight, useSize } from '../lib/chartGeometry'
import { INTERVALS, chartHref, periodChange, researchHref } from '../lib/research'
import { Card, TBtn } from '../components/ui'
import CommandPalette from '../components/CommandPalette'
import InstrumentSearchBar from '../components/InstrumentSearchBar'
import SaxoConnectionStatus from '../components/SaxoConnectionStatus'
import { useCommandPalette } from '../components/useCommandPalette'
import ChartCanvas from '../components/research/ChartCanvas'
import ChartToolRail from '../components/research/ChartToolRail'
import SymbolBar from '../components/research/SymbolBar'
import WatchlistRail from '../components/research/WatchlistRail'
import { useChartControls } from '../components/research/useChartControls'
import { useChartData } from '../components/research/useChartData'
import { useResearchInstrument } from '../components/research/useResearchInstrument'
import { useWatchlistToggle } from '../components/research/useWatchlistToggle'

const chartResultHref = (result) => chartHref(result.symbol, { uic: result.uic, assetType: result.asset_type })

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

  const { chart, bars, ind, earningsMarkers, priceLines, quote, details } = useChartData({
    symbol,
    instrument,
    range: controls.range,
  })
  const { watchlists, toggleList } = useWatchlistToggle({ symbol, instrument, details: details.data, position })
  const heldSymbols = useMemo(() => new Set(positions.map((p) => p.ticker)), [positions])
  const palette = useCommandPalette()

  const [canvasRef, canvasSize] = useSize()
  const priceHeight = pricePaneHeight({
    total: canvasSize.height,
    panes: controls.panes,
    paneHeights: ADVANCED_PANE_HEIGHTS,
  })
  const safeHover = hover != null && hover < bars.length ? hover : null
  const period = periodChange(bars)

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
            <div className="flex items-center gap-0.5">
              {INTERVALS.map((interval) => (
                <TBtn key={interval} active={controls.range === interval} onClick={() => controls.setRange(interval)}>
                  {interval}
                </TBtn>
              ))}
            </div>
            {priceLines.saveFailed ? (
              <span role="alert" className="ml-2 text-[var(--fig-2xs)] text-red-400">
                Couldn't save line
              </span>
            ) : null}
            <div className="ml-auto flex items-center gap-3">
              {period == null ? null : (
                <span className="text-[var(--fig-2xs)] text-zinc-500">
                  Period{' '}
                  <span className={`num font-mono ${period >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {fmtPct(period)}
                  </span>
                </span>
              )}
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
              priceHeight={priceHeight}
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
          <WatchlistRail fill symbol={symbol} onSelectSymbol={selectSymbol} heldSymbols={heldSymbols} />
        </div>
      </aside>

      <CommandPalette open={palette.open} onClose={() => palette.setOpen(false)} />
    </div>
  )
}
