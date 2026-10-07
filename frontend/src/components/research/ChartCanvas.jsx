import { fmtNum, fmtPct, pctToneClass } from '../../lib/format'
import { barChange } from '../../lib/research'
import { LATEST_TIME_VIEW, panTimeView, resolveTimeWindow, zoomTimeView } from '../../lib/timeWindow'
import { chartPlaceholderFor } from '../../lib/chartState'
import { OVERLAY_STROKES, pricePaneHeight, useSize } from '../../lib/chartGeometry'
import { DEFAULT_PANE_HEIGHTS, OVERLAY_DEFS } from '../../lib/chartOptions'
import { RVOL_WINDOW } from '../../lib/indicators'
import { MacdPane, RsiPane, TimeAxis, VolumePane } from './panes'
import { SubPane, TVChart } from './TVChart'

function valueAt(series, hover) {
  if (!series?.length) return null
  return series[hover ?? series.length - 1]
}

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

function OhlcLegend({ bar, change, overlays, values, className = '', ...rest }) {
  const up = bar.close >= bar.open

  return (
    <div className={`flex items-center gap-x-3 gap-y-0.5 md:gap-y-3 px-3 pt-2 text-[var(--fig-2xs)] num font-mono flex-wrap ${className}`} {...rest}>
      <span className="text-zinc-400">{bar.date}</span>
      {[
        ['O', bar.open],
        ['H', bar.high],
        ['L', bar.low],
        ['C', bar.close],
      ].map(([key, value]) => (
        <span key={key} className={key === 'C' ? 'text-zinc-500' : 'hidden md:inline text-zinc-500'}>
          {key} <span className={up ? 'text-emerald-400' : 'text-red-400'}>{fmtNum(value, 2)}</span>
        </span>
      ))}
      {change == null ? null : (
        <span className={pctToneClass(change)}>{fmtPct(change)}</span>
      )}
      <span className="text-zinc-500">
        Vol <span className="text-zinc-300">{fmtNum(bar.volume / 1e6, 1)}M</span>
        {values.rvol == null ? null : <span> · {fmtNum(values.rvol, 1)}× {RVOL_WINDOW}d avg</span>}
      </span>
      {OVERLAY_DEFS.filter((o) => overlays[o.key] && o.key !== 'bb').map((o) => {
        const value = values.overlays[o.key]
        return (
          <span key={o.key} style={{ color: OVERLAY_STROKES[o.key] }} className="text-[var(--fig-2xs)]">
            {o.label} {value == null ? '—' : fmtNum(value, 2)}
          </span>
        )
      })}
    </div>
  )
}

export default function ChartCanvas({
  bars,
  ind,
  controls,
  hover,
  setHover,
  symbol,
  isLoading,
  error,
  unresolved,
  earningsMarkers = [],
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
  const [legendRef, legendSize] = useSize()

  const resolvedPriceHeight =
    fitHeight != null
      ? pricePaneHeight({ total: fitHeight, legendHeight: legendSize.height, panes, paneHeights })
      : priceHeight

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
              className="invisible"
              aria-hidden="true"
            />
            <OhlcLegend
              bar={bar}
              change={barChange(bars, hover)}
              overlays={overlays}
              values={legendValues(ind, hover)}
              className="absolute inset-x-0 top-0"
            />
          </>
        ) : null}
      </div>

      {placeholder ?? (
        <div className="px-1 pb-1">
          <TVChart
            key={symbol}
            data={bars}
            ind={ind}
            type={type}
            overlays={overlays}
            hover={hover}
            setHover={setHover}
            height={resolvedPriceHeight}
            earningsMarkers={earningsMarkers}
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
          />
          {panes.volume ? (
            <SubPane title="Volume" height={paneHeights.volume}>
              <VolumePane data={bars} rvol={ind.rvol} hover={hover} setHover={setHover} />
            </SubPane>
          ) : null}
          {panes.rsi ? (
            <SubPane title={`RSI 14 ${fmtNum(valueAt(ind.rsi, hover) ?? 0, 1)}`} height={paneHeights.rsi}>
              <RsiPane values={ind.rsi} hover={hover} setHover={setHover} />
            </SubPane>
          ) : null}
          {panes.macd ? (
            <SubPane title="MACD 12 26 9" height={paneHeights.macd}>
              <MacdPane macd={ind.macd} hover={hover} setHover={setHover} />
            </SubPane>
          ) : null}
          <TimeAxis data={bars} onBarCountChange={zoomTime} onReset={resetTime} />
        </div>
      )}
    </>
  )
}
