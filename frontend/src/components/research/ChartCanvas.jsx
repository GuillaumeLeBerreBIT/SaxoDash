import { fmtNum, fmtPct } from '../../lib/format'
import { barChange, clampTimeOffset } from '../../lib/research'
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

function OhlcLegend({ bar, change, overlays, ind, hover }) {
  const up = bar.close >= bar.open
  const rvol = valueAt(ind.rvol, hover)

  return (
    <div className="flex items-center gap-3 px-3 pt-2 text-[var(--fig-2xs)] num font-mono flex-wrap">
      <span className="text-zinc-400">{bar.date}</span>
      {[
        ['O', bar.open],
        ['H', bar.high],
        ['L', bar.low],
        ['C', bar.close],
      ].map(([key, value]) => (
        <span key={key} className="text-zinc-500">
          {key} <span className={up ? 'text-emerald-400' : 'text-red-400'}>{fmtNum(value, 2)}</span>
        </span>
      ))}
      {change == null ? null : (
        <span className={change >= 0 ? 'text-emerald-400' : 'text-red-400'}>{fmtPct(change)}</span>
      )}
      <span className="text-zinc-500">
        Vol <span className="text-zinc-300">{fmtNum(bar.volume / 1e6, 1)}M</span>
        {rvol == null ? null : <span> · {fmtNum(rvol, 1)}× {RVOL_WINDOW}d avg</span>}
      </span>
      {OVERLAY_DEFS.filter((o) => overlays[o.key] && o.key !== 'bb').map((o) => {
        const value = valueAt(ind[o.key], hover)
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
  priceHeight,
  fitHeight,
  paneHeights = DEFAULT_PANE_HEIGHTS,
  placingLine = false,
  onPlaced,
  maxTimeOffset = 0,
}) {
  const { type, overlays, panes, yScale, setYScale, yShift, setYShift, timeOffset, setTimeOffset } = controls
  const panTime = setTimeOffset
    ? (next) =>
        setTimeOffset((current) => clampTimeOffset(typeof next === 'function' ? next(current) : next, maxTimeOffset))
    : undefined
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
      <div ref={legendRef}>
        {bar && !placeholder ? (
          <OhlcLegend bar={bar} change={barChange(bars, hover)} overlays={overlays} ind={ind} hover={hover} />
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
            timeOffset={timeOffset}
            onTimeOffsetChange={panTime}
            lines={lines}
            onMoveLine={onMoveLine}
            onCreateLine={onCreateLine}
            onDeleteLine={onDeleteLine}
            placingLine={placingLine}
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
          <TimeAxis data={bars} timeOffset={timeOffset} onTimeOffsetChange={panTime} />
        </div>
      )}
    </>
  )
}
