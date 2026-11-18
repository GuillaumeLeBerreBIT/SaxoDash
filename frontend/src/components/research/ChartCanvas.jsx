import { useId, useMemo, useRef, useState } from 'react'

import { CHART_KEYS_HELP, chartKeyCommand } from '../../lib/chartKeys'
import { fmtDate, fmtNum, fmtPct, pctToneClass } from '../../lib/format'
import { barChange } from '../../lib/research'
import { LATEST_TIME_VIEW, panTimeView, resolveTimeWindow, zoomTimeView } from '../../lib/timeWindow'
import { chartPlaceholderFor } from '../../lib/chartState'
import { fitChartPanes, overlayStrokes, pricePaneHeight, useSize } from '../../lib/chartGeometry'
import { DEFAULT_PANE_HEIGHTS, OVERLAY_DEFS } from '../../lib/chartOptions'
import { RVOL_WINDOW } from '../../lib/indicators'
import { guideSeries, visibleGuides } from '../../lib/valueGuides'
import { MacdPane, RsiPane, TimeAxis, VolumePane } from './panes'
import { SubPane, TVChart } from './TVChart'
import { useChartColors } from '../../theme/useChartColors'

function valueAt(series, hover) {
  if (!series?.length) return null
  return series[hover ?? series.length - 1]
}

const NO_DATES = []

const WIDEST_BAR = { date: '0000-00-00', open: 99999.99, high: 99999.99, low: 99999.99, close: 99999.99, volume: 99999.9e6 }
const WIDEST_VALUE = 99999.99
const WIDEST_CHANGE = -999.99
const WIDEST_RVOL = 99.9

function legendValues(ind, hover) {
  const overlays = {}
  for (const { key } of OVERLAY_DEFS) overlays[key] = valueAt(ind[key], hover)
  return { rvol: valueAt(ind.rvol, hover), overlays }
}

const WIDEST_VALUES = {
  rvol: WIDEST_RVOL,
  overlays: Object.fromEntries(OVERLAY_DEFS.map(({ key }) => [key, WIDEST_VALUE])),
}

const gapLegend = (gap) =>
  [
    `Gap ${gap.up ? 'up' : 'down'}`,
    `${fmtNum(Math.abs(gap.to / gap.from - 1) * 100, 1)}% · ${fmtNum(gap.rvol, 1)}x vol · ${gap.filled ? `filled ${fmtDate(gap.filledOn)}` : 'open'}`,
  ]

function guideLegend(gaps, index) {
  const items = []
  const gap = gaps.find((candidate) => candidate.index === index)
  if (gap) items.push(gapLegend(gap))
  return items
}

function widestGuideLegend(gaps) {
  const items = []
  if (gaps.length) items.push(gapLegend({ up: false, from: 1, to: 0.001, rvol: WIDEST_RVOL, filled: true, filledOn: '2026-09-30' }))
  return items
}

function OhlcLegend({ bar, change, overlays, values, guides = [], className = '', ...rest }) {
  const strokes = overlayStrokes(useChartColors())

  return (
    <div className={`flex items-center gap-x-3 gap-y-0.5 md:gap-y-3 px-3 pt-2 text-[13px] num flex-wrap ${className}`} {...rest}>
      <span className="text-ink-2">{fmtDate(bar.date)}</span>
      {[
        ['O', bar.open],
        ['H', bar.high],
        ['L', bar.low],
        ['C', bar.close],
      ].map(([key, value]) => (
        <span key={key} className={key === 'C' ? 'text-ink-3' : 'hidden md:inline text-ink-3'}>
          {key} <span className="text-ink">{fmtNum(value, 2)}</span>
        </span>
      ))}
      {change == null ? null : (
        <span className={pctToneClass(change)}>{fmtPct(change)}</span>
      )}
      <span className="text-ink-3">
        Vol <span className="text-ink">{fmtNum(bar.volume / 1e6, 1)}M</span>
        {values.rvol == null ? null : <span> · {fmtNum(values.rvol, 1)}× {RVOL_WINDOW}d avg</span>}
      </span>
      {OVERLAY_DEFS.filter((o) => overlays[o.key] && o.key !== 'bb').map((o) => {
        const value = values.overlays[o.key]
        return (
          <span key={o.key} style={{ color: strokes[o.key] }}>
            {o.label} {value == null ? '—' : fmtNum(value, 2)}
          </span>
        )
      })}
      {guides.map(([label, value]) =>
        label ? (
          <span key={label} className="text-ink-3">
            {label} <span className="text-ink">{value}</span>
          </span>
        ) : (
          <span key="reading" className="text-ink">
            {value}
          </span>
        ),
      )}
    </div>
  )
}

export default function ChartCanvas({
  bars,
  ind,
  controls,
  hover,
  setHover,
  hoverDimmed = false,
  symbol,
  isLoading,
  error,
  unresolved,
  earningsMarkers = [],
  valueGuides = null,
  tradePlan,
  futureDates = NO_DATES,
  lines,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
  onEditLineLabel,
  trendLines,
  onMoveTrendLineEndpoint,
  onCreateTrendLine,
  onDeleteTrendLine,
  onEditTrendLineLabel,
  textAnnotations,
  onMoveTextAnnotation,
  onCreateTextAnnotation,
  onDeleteTextAnnotation,
  onEditTextAnnotationText,
  priceHeight,
  fitHeight,
  paneHeights = DEFAULT_PANE_HEIGHTS,
  tool = 'crosshair',
  onPlaced,
  timeWindow,
  shedToFit = false,
}) {
  const { type, overlays, panes, range, yScale, setYScale, yShift, setYShift, setTimeView } = controls
  const shown = timeWindow ?? resolveTimeWindow(LATEST_TIME_VIEW, { total: bars.length, range })
  const history = { total: shown.total, range }
  const panTime = setTimeView ? (next) => setTimeView((view) => panTimeView(view, history, next)) : undefined
  const zoomTime = setTimeView ? (count) => setTimeView((view) => zoomTimeView(view, history, count)) : undefined
  const resetTime = setTimeView ? () => setTimeView(LATEST_TIME_VIEW) : undefined
  const resetPriceScale = setYScale
    ? () => {
        setYScale(1)
        setYShift?.(0)
      }
    : undefined
  const bar = bars[hover ?? bars.length - 1]
  const guideBars = valueGuides?.bars ?? bars
  const showGaps = Boolean(valueGuides?.gaps)
  const gapSeries = useMemo(() => guideSeries(guideBars, { high: false, gaps: showGaps }), [guideBars, showGaps])
  const shownGaps = useMemo(() => visibleGuides(gapSeries, guideBars, bars).gaps, [gapSeries, guideBars, bars])
  const slots = bars.length + futureDates.length
  const [legendRef, legendSize] = useSize()
  const [keyed, setKeyed] = useState(false)
  const [placedNote, setPlacedNote] = useState('')
  const placerRef = useRef(null)
  const helpId = useId()

  const onKeyDown = (event) => {
    if (event.target !== event.currentTarget || event.metaKey || event.ctrlKey || event.altKey) return
    const command = chartKeyCommand(event, { hover, count: bars.length, slots: shown.slots })
    if (!command) return
    if (command.place != null) {
      if (tool === 'crosshair') return
      event.preventDefault()
      setPlacedNote(placerRef.current?.(command.place) ?? '')
      return
    }
    event.preventDefault()
    setPlacedNote('')
    if ('hover' in command) {
      setHover?.(command.hover)
      setKeyed(command.hover != null)
    }
    if (command.pan != null) panTime?.((offset) => offset + command.pan)
    if (command.zoom != null) zoomTime?.(command.zoom)
    if (command.reset) resetTime?.()
  }

  const layout = { total: fitHeight, legendHeight: legendSize.height, panes, paneHeights }
  const fitted = fitHeight != null && shedToFit ? fitChartPanes(layout) : null
  const shownPanes = fitted?.panes ?? panes
  const resolvedPriceHeight = fitted?.priceHeight ?? (fitHeight != null ? pricePaneHeight(layout) : priceHeight)

  const placeholder = chartPlaceholderFor({
    isLoading,
    error,
    data: bars,
    minPoints: 2,
    height: resolvedPriceHeight,
    symbol,
    unresolved,
  })

  return (
    <>
      <div ref={legendRef} className="relative">
        {bar && !placeholder ? (
          <>
            <OhlcLegend
              bar={WIDEST_BAR}
              change={WIDEST_CHANGE}
              overlays={overlays}
              values={WIDEST_VALUES}
              guides={widestGuideLegend(shownGaps)}
              className="invisible"
              aria-hidden="true"
            />
            <OhlcLegend
              bar={bar}
              change={barChange(bars, hover)}
              overlays={overlays}
              values={legendValues(ind, hover)}
              guides={guideLegend(shownGaps, hover ?? bars.length - 1)}
              className="absolute inset-x-0 top-0"
            />
          </>
        ) : null}
      </div>

      {placeholder ?? (
        <div
          tabIndex={0}
          role="group"
          aria-label={`${symbol || 'Price'} chart`}
          aria-describedby={helpId}
          onKeyDown={onKeyDown}
          onBlur={() => setKeyed(false)}
          className="rounded-lg px-1 pb-1 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          <span id={helpId} className="sr-only">
            {CHART_KEYS_HELP}
          </span>
          <span className="sr-only" aria-live="polite">
            {keyed && bar ? `${fmtDate(bar.date)}: open ${fmtNum(bar.open, 2)}, high ${fmtNum(bar.high, 2)}, low ${fmtNum(bar.low, 2)}, close ${fmtNum(bar.close, 2)}` : ''}
          </span>
          <span className="sr-only" role="status">
            {placedNote}
          </span>
          <TVChart
            key={symbol}
            data={bars}
            ind={ind}
            type={type}
            overlays={overlays}
            hover={hover}
            setHover={setHover}
            hoverDimmed={hoverDimmed}
            height={resolvedPriceHeight}
            earningsMarkers={earningsMarkers}
            valueGuides={valueGuides}
            tradePlan={tradePlan}
            slots={slots}
            yScale={yScale}
            onYScaleChange={setYScale}
            onPriceScaleReset={resetPriceScale}
            yShift={yShift}
            onYShiftChange={setYShift}
            timeOffset={shown.offset}
            onTimeOffsetChange={panTime}
            lines={lines}
            onMoveLine={onMoveLine}
            onCreateLine={onCreateLine}
            onDeleteLine={onDeleteLine}
            onEditLineLabel={onEditLineLabel}
            trendLines={trendLines}
            onMoveTrendLineEndpoint={onMoveTrendLineEndpoint}
            onCreateTrendLine={onCreateTrendLine}
            onDeleteTrendLine={onDeleteTrendLine}
            onEditTrendLineLabel={onEditTrendLineLabel}
            textAnnotations={textAnnotations}
            onMoveTextAnnotation={onMoveTextAnnotation}
            onCreateTextAnnotation={onCreateTextAnnotation}
            onDeleteTextAnnotation={onDeleteTextAnnotation}
            onEditTextAnnotationText={onEditTextAnnotationText}
            tool={tool}
            onPlaced={onPlaced}
            placerRef={placerRef}
          />
          {shownPanes.volume ? (
            <SubPane title="Volume" height={paneHeights.volume}>
              <VolumePane data={bars} rvol={ind.rvol} hover={hover} setHover={setHover} hoverDimmed={hoverDimmed} slots={slots} />
            </SubPane>
          ) : null}
          {shownPanes.rsi ? (
            <SubPane title={`RSI 14 ${fmtNum(valueAt(ind.rsi, hover) ?? 0, 1)}`} height={paneHeights.rsi}>
              <RsiPane values={ind.rsi} hover={hover} setHover={setHover} hoverDimmed={hoverDimmed} slots={slots} />
            </SubPane>
          ) : null}
          {shownPanes.macd ? (
            <SubPane title="MACD 12 26 9" height={paneHeights.macd}>
              <MacdPane macd={ind.macd} hover={hover} setHover={setHover} hoverDimmed={hoverDimmed} slots={slots} />
            </SubPane>
          ) : null}
          <TimeAxis data={bars} futureDates={futureDates} onBarCountChange={zoomTime} onReset={resetTime} />
        </div>
      )}
    </>
  )
}
