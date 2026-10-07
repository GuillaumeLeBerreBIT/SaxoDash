import { useState } from 'react'

import { useSize } from '../../lib/chartGeometry'
import { fmtNum, fmtPct, pctToneClass } from '../../lib/format'
import { moveCaption } from '../../lib/research'
import { Card, InstrumentLogo } from '../ui'
import ChartCanvas from './ChartCanvas'
import { LineSaveAlert, PeriodChange } from './chartHeader'
import { useChartData } from './useChartData'

const HEADER_CLASS = 'flex items-center gap-2 px-2.5 h-8 border-b border-white/[0.06] min-w-0'

function PaneHeader({ symbol, quote, rangeBars, windowBars, lineSaveFailed, showIdentity }) {
  const last = rangeBars[rangeBars.length - 1]
  const price = quote?.price ?? last?.close ?? null
  const { change, suffix } = moveCaption(quote, rangeBars)
  return (
    <div className={HEADER_CLASS}>
      {showIdentity ? (
        <>
          <InstrumentLogo
            symbol={symbol}
            size={14}
            className="rounded-sm"
            fallback={<span className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-700" />}
          />
          <span className="text-[var(--fig-xs)] font-medium text-zinc-100">{symbol}</span>
          <span className="text-[var(--fig-xs)] num font-mono text-zinc-300">{price == null ? '—' : fmtNum(price, 2)}</span>
          {change == null ? null : (
            <span
              className={`text-[var(--fig-2xs)] num font-mono whitespace-nowrap ${
                pctToneClass(change)
              }`}
            >
              {fmtPct(change)}{suffix ? ` ${suffix}` : ''}
            </span>
          )}
        </>
      ) : null}
      <LineSaveAlert failed={lineSaveFailed} />
      <div className="ml-auto">
        <PeriodChange bars={windowBars} />
      </div>
    </div>
  )
}

function EmptyPaneHeader({ index }) {
  return (
    <div
      role="region"
      aria-label={index == null ? 'Empty pane' : `Empty pane ${index + 1}`}
      className={HEADER_CLASS}
    >
      <span className="w-1.5 h-1.5 rounded-full shrink-0 bg-zinc-700" />
      <span className="text-[var(--fig-xs)] font-medium text-zinc-400">Empty pane</span>
      <span className="text-[var(--fig-2xs)] text-zinc-500 truncate">Pick a symbol to start</span>
    </div>
  )
}

function FilledPane({ slot, controls, view, tool, onPlaced, paneHeights, split }) {
  const instrument = slot.uic ? { uic: slot.uic, assetType: slot.assetType } : null
  const {
    chart,
    bars,
    rangeBars,
    ind,
    timeWindow,
    earningsMarkers,
    priceLines,
    trendLines,
    trendLineActions,
    textAnnotations,
    textAnnotationActions,
    quote,
  } = useChartData({
    symbol: slot.symbol,
    instrument,
    range: controls.range,
    timeView: view.timeView,
  })
  const [hover, setHover] = useState(null)
  const [canvasRef, canvasSize] = useSize()
  const safeHover = hover != null && hover < bars.length ? hover : null

  return (
    <>
      <PaneHeader
        symbol={slot.symbol}
        quote={quote}
        rangeBars={rangeBars}
        windowBars={bars}
        lineSaveFailed={priceLines.saveFailed || trendLineActions.saveFailed || textAnnotationActions.saveFailed}
        showIdentity={split}
      />
      <div ref={canvasRef} className="flex-1 min-h-0 overflow-hidden">
        <ChartCanvas
          bars={bars}
          ind={ind}
          timeWindow={timeWindow}
          controls={{ ...controls, ...view }}
          hover={safeHover}
          setHover={setHover}
          symbol={slot.symbol}
          isLoading={chart.isLoading}
          error={chart.error}
          unresolved={!instrument && !chart.isLoading}
          earningsMarkers={earningsMarkers}
          lines={priceLines.lines}
          onMoveLine={priceLines.move}
          onCreateLine={priceLines.create}
          onDeleteLine={priceLines.remove}
          onEditLineLabel={priceLines.setLabel}
          trendLines={trendLines}
          onMoveTrendLineEndpoint={trendLineActions.moveEndpoint}
          onCreateTrendLine={trendLineActions.create}
          onDeleteTrendLine={trendLineActions.remove}
          onEditTrendLineLabel={trendLineActions.setLabel}
          textAnnotations={textAnnotations}
          onMoveTextAnnotation={textAnnotationActions.move}
          onCreateTextAnnotation={textAnnotationActions.create}
          onDeleteTextAnnotation={textAnnotationActions.remove}
          onEditTextAnnotationText={textAnnotationActions.setText}
          fitHeight={canvasSize.height}
          paneHeights={paneHeights}
          tool={tool}
          onPlaced={onPlaced}
        />
      </div>
    </>
  )
}

export default function ChartPane({
  slot,
  index,
  active,
  outlined,
  controls,
  view,
  onActivate,
  tool,
  onPlaced,
  paneHeights,
  style,
  className = 'flex',
  split = true,
}) {
  return (
    <section
      aria-label={slot ? `${slot.symbol} chart` : 'Empty chart'}
      aria-current={active || undefined}
      onMouseDown={onActivate}
      style={style}
      className={`flex-col flex-1 min-h-0 min-w-0 ${className}`}
    >
      <Card padding={false} className={`flex-1 min-h-0 flex flex-col overflow-hidden ${outlined ? 'ring-1 ring-blue-500' : ''}`}>
        {slot ? (
          <FilledPane
            key={`${slot.symbol}:${slot.uic}:${slot.assetType}`}
            slot={slot}
            controls={controls}
            view={view}
            tool={active ? tool : 'crosshair'}
            onPlaced={onPlaced}
            paneHeights={paneHeights}
            split={split}
          />
        ) : (
          <>
            <EmptyPaneHeader index={index} />
            <div className="flex-1 flex items-center justify-center text-[var(--fig-xs)] text-zinc-500">
              Pick a symbol from the watchlist
            </div>
          </>
        )}
      </Card>
    </section>
  )
}
