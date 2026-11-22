import { useEffect, useState } from 'react'

import { COMPARE_OFF, sameSlot } from '../../lib/chartWorkspace'

import { useSize } from '../../lib/chartGeometry'
import { fmtNum } from '../../lib/format'
import { moveCaption } from '../../lib/research'
import { matchBarByDate, resolveTimeViewChange, windowToDates } from '../../lib/timeWindow'
import { Card, InstrumentLogo, StatusDot } from '../ui'
import ChartCanvas from './ChartCanvas'
import CompareControls from './CompareControls'
import CompareLegend from './CompareLegend'
import { LineSaveAlert, MoveCaption, PeriodChange } from './chartHeader'
import { useLinkedHover } from './LinkedHover'
import { useChartData } from './useChartData'
import { useCompare } from './useCompare'

const HEADER_CLASS = 'flex items-center gap-2 px-3.5 h-10 border-b border-line min-w-0'

function PaneHeader({ symbol, quote, rangeBars, windowBars, lineSaveFailed, showIdentity }) {
  const last = rangeBars[rangeBars.length - 1]
  const price = quote?.price ?? last?.close ?? null
  const { change, suffix } = moveCaption(quote, rangeBars)
  return (
    <div className={HEADER_CLASS}>
      {showIdentity ? (
        <>
          <InstrumentLogo symbol={symbol} size={20} />
          <span className="text-[14px] font-bold text-ink">{symbol}</span>
          <span className="text-[13px] num font-semibold text-ink">{price == null ? '—' : fmtNum(price, 2)}</span>
          {change == null ? null : <MoveCaption change={change} suffix={suffix} className="text-[12px] font-semibold" />}
        </>
      ) : null}
      <LineSaveAlert failed={lineSaveFailed} />
      <div className="ml-auto">
        <PeriodChange bars={windowBars} />
      </div>
    </div>
  )
}

const emptyPaneName = (index) => (index == null ? 'Empty pane' : `Empty pane ${index + 1}`)

function EmptyPaneHeader() {
  return (
    <div className={HEADER_CLASS}>
      <StatusDot tone="off" />
      <span className="text-[13px] font-medium text-ink-2">Empty pane</span>
    </div>
  )
}

const NO_DRAWINGS = []

function toggled(set, key) {
  const next = new Set(set)
  if (next.has(key)) next.delete(key)
  else next.add(key)
  return next
}

function FilledPane({ slot, controls, view, tool, onPlaced, paneHeights, split, compare, onCompareChange }) {
  const instrument = slot.uic ? { uic: slot.uic, assetType: slot.assetType } : null
  const {
    chart,
    allBars,
    bars,
    rangeBars,
    ind,
    timeWindow,
    timeView,
    earningsMarkers,
    futureDates,
    priceLines,
    trendLines,
    trendLineActions,
    zones,
    zoneActions,
    textAnnotations,
    textAnnotationActions,
    quote,
  } = useChartData({
    symbol: slot.symbol,
    instrument,
    range: controls.range,
    timeView: view.timeView,
    followDates: view.followDates,
  })
  const shownDates = windowToDates(timeWindow, allBars)
  const reportWindow = view.reportWindow
  useEffect(() => {
    reportWindow(shownDates)
  })
  const paneView = {
    ...view,
    timeView,
    setTimeView: (next) => {
      const change = resolveTimeViewChange(next, timeView, { bars: allBars, range: controls.range })
      view.commitTimeView(change.timeView, change.dates)
    },
  }
  const linkedHover = useLinkedHover()
  const [ownHover, setOwnHover] = useState(null)
  const [canvasRef, canvasSize] = useSize()
  const ownIndex = ownHover != null && ownHover < bars.length ? ownHover : null
  const followed = ownIndex == null && linkedHover ? matchBarByDate(bars, linkedHover.date) : null
  const hover = ownIndex ?? followed?.index ?? null
  const setHover = (index) => {
    setOwnHover(index)
    linkedHover?.setDate(index == null ? null : (bars[index]?.date ?? null))
  }
  const comparing = compare.on
  const [hidden, setHidden] = useState(() => new Set())
  const comparison = useCompare({ slot, compare, bars, hidden })
  const asLine = comparing && compare.mainAs === 'line'
  const editable = !comparing
  const shownDrawings = (items) => (asLine ? NO_DRAWINGS : items)
  const canvasControls = {
    ...controls,
    ...paneView,
    type: comparing ? (asLine ? 'line' : 'candles') : controls.type,
  }
  const compareLegend = comparing
    ? (legendHover, date) => (
        <CompareLegend
          lines={comparison.lines}
          date={date}
          hover={legendHover}
          hidden={hidden}
          onToggle={(key) => setHidden((current) => toggled(current, key))}
          onRemove={(instrument) =>
            onCompareChange({ added: compare.added.filter((entry) => !sameSlot(entry, instrument)) })
          }
        />
      )
    : null

  return (
    <>
      <PaneHeader
        symbol={slot.symbol}
        quote={quote}
        rangeBars={rangeBars}
        windowBars={bars}
        lineSaveFailed={priceLines.saveFailed || trendLineActions.saveFailed || zoneActions.saveFailed || textAnnotationActions.saveFailed}
        showIdentity={split}
      />
      {comparing ? (
        <CompareControls
          symbol={slot.symbol}
          compare={compare}
          suggestions={comparison.suggestions}
          addedLeft={comparison.addedLeft}
          takenKeys={comparison.takenKeys}
          onChange={onCompareChange}
        />
      ) : null}
      <div ref={canvasRef} className="flex-1 min-h-0 overflow-hidden">
        <ChartCanvas
          bars={bars}
          ind={ind}
          timeWindow={timeWindow}
          controls={canvasControls}
          hover={hover}
          setHover={setHover}
          hoverDimmed={followed != null && !followed.exact}
          symbol={slot.symbol}
          isLoading={chart.isLoading}
          error={chart.error}
          unresolved={!instrument && !chart.isLoading}
          earningsMarkers={earningsMarkers}
          futureDates={futureDates}
          lines={shownDrawings(priceLines.lines)}
          onMoveLine={editable ? priceLines.move : undefined}
          onCreateLine={editable ? priceLines.create : undefined}
          onDeleteLine={editable ? priceLines.remove : undefined}
          onEditLineLabel={editable ? priceLines.setLabel : undefined}
          trendLines={shownDrawings(trendLines)}
          onMoveTrendLineEndpoint={editable ? trendLineActions.moveEndpoint : undefined}
          onCreateTrendLine={editable ? trendLineActions.create : undefined}
          onDeleteTrendLine={editable ? trendLineActions.remove : undefined}
          onEditTrendLineLabel={editable ? trendLineActions.setLabel : undefined}
          zones={shownDrawings(zones)}
          onCreateZone={editable ? zoneActions.create : undefined}
          onDeleteZone={editable ? zoneActions.remove : undefined}
          textAnnotations={shownDrawings(textAnnotations)}
          onMoveTextAnnotation={editable ? textAnnotationActions.move : undefined}
          onCreateTextAnnotation={editable ? textAnnotationActions.create : undefined}
          onDeleteTextAnnotation={editable ? textAnnotationActions.remove : undefined}
          onEditTextAnnotationText={editable ? textAnnotationActions.setText : undefined}
          fitHeight={canvasSize.height}
          paneHeights={paneHeights}
          shedToFit={split}
          tool={comparing ? 'crosshair' : tool}
          onPlaced={onPlaced}
          compare={comparing ? comparison.chartCompare : null}
          compareLegend={compareLegend}
        />
      </div>
      {comparing && comparison.sentence ? (
        <p className="px-3.5 py-2 border-t border-line text-[12px] leading-5 text-ink-2" data-testid="compare-sentence">
          {comparison.sentence}
        </p>
      ) : null}
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
  compare = COMPARE_OFF,
  onCompareChange,
}) {
  return (
    <section
      aria-label={slot ? `${slot.symbol} chart${compare.on ? ' in Compare' : ''}` : emptyPaneName(index)}
      aria-current={active || undefined}
      onPointerDownCapture={onActivate}
      onFocusCapture={onActivate}
      style={style}
      className={`flex-col flex-1 min-h-0 min-w-0 ${className}`}
    >
      <Card padding={false} className={`flex-1 min-h-0 flex flex-col overflow-hidden ${outlined ? 'ring-1 ring-ink-3' : ''}`}>
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
            compare={compare}
            onCompareChange={onCompareChange}
          />
        ) : (
          <>
            <EmptyPaneHeader />
            <div className="flex-1 flex items-center justify-center text-[13px] text-ink-3">
              Pick a symbol from the watchlist
            </div>
          </>
        )}
      </Card>
    </section>
  )
}
