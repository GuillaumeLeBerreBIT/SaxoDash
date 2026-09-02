import { memo, useMemo } from 'react'

import {
  DOWN,
  OVERLAY_STROKES,
  PAD_R,
  PAD_T,
  UP,
  indexFromPointer,
  linePath,
  priceGeometry,
  useWidth,
} from '../../lib/chartGeometry'

/** The price pane of the Research chart: candles/bars/line/area plus overlays.
 *
 *  Unlike the recharts `*Chart.jsx` components, this one is prop-driven and
 *  fetches nothing: the price pane and the lower panes share one dataset and
 *  one hovered index, which only the parent can own.
 *
 *  Hovering moves the crosshair many times a second while the candles stay
 *  put, so the body is memoised and never sees `hover`; the crosshair is a
 *  separate component. Passing precomputed geometry to both is what keeps the
 *  body's props stable enough for memo to bite.
 */

function PriceAxis({ ticks, scaleY, width }) {
  return ticks.map((value) => (
    <g key={value}>
      <line
        x1={0}
        x2={width - PAD_R}
        y1={scaleY(value)}
        y2={scaleY(value)}
        stroke="rgba(255,255,255,0.05)"
      />
      <text
        x={width - PAD_R + 8}
        y={scaleY(value) + 3.5}
        fill="#71717a"
        fontSize="10"
        fontFamily="JetBrains Mono"
      >
        {value.toFixed(value > 100 ? 0 : 2)}
      </text>
    </g>
  ))
}

function Candles({ data, geometry }) {
  const { xAt, scaleY, candleWidth } = geometry

  return data.map((bar, i) => {
    const color = bar.close >= bar.open ? UP : DOWN
    const bodyTop = Math.min(scaleY(bar.open), scaleY(bar.close))
    const bodyHeight = Math.max(1, Math.abs(scaleY(bar.open) - scaleY(bar.close)))

    return (
      <g key={bar.date}>
        <line
          x1={xAt(i)}
          x2={xAt(i)}
          y1={scaleY(bar.high)}
          y2={scaleY(bar.low)}
          stroke={color}
          strokeWidth="1"
        />
        <rect
          x={xAt(i) - candleWidth / 2}
          y={bodyTop}
          width={candleWidth}
          height={bodyHeight}
          fill={color}
        />
      </g>
    )
  })
}

function Bars({ data, geometry }) {
  const { xAt, scaleY, candleWidth } = geometry

  return data.map((bar, i) => (
    <g key={bar.date} stroke={bar.close >= bar.open ? UP : DOWN} strokeWidth="1.2">
      <line x1={xAt(i)} x2={xAt(i)} y1={scaleY(bar.high)} y2={scaleY(bar.low)} />
      <line x1={xAt(i) - candleWidth / 2} x2={xAt(i)} y1={scaleY(bar.open)} y2={scaleY(bar.open)} />
      <line x1={xAt(i)} x2={xAt(i) + candleWidth / 2} y1={scaleY(bar.close)} y2={scaleY(bar.close)} />
    </g>
  ))
}

const ChartBody = memo(function ChartBody({ data, ind, type, overlays, geometry, width }) {
  const { xAt, scaleY, chartH } = geometry
  const closes = data.map((bar) => bar.close)
  const pricePath = linePath(closes, xAt, scaleY)
  const last = closes[closes.length - 1]

  return (
    <g>
      <PriceAxis ticks={geometry.ticks} scaleY={scaleY} width={width} />

      {type === 'area' ? (
        <g>
          <defs>
            <linearGradient id="tvArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.28" />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity="0" />
            </linearGradient>
          </defs>
          <path
            d={`${pricePath} L ${xAt(data.length - 1)} ${PAD_T + chartH} L ${xAt(0)} ${PAD_T + chartH} Z`}
            fill="url(#tvArea)"
          />
          <path d={pricePath} fill="none" stroke="#60a5fa" strokeWidth="1.5" />
        </g>
      ) : null}
      {type === 'line' ? <path d={pricePath} fill="none" stroke="#60a5fa" strokeWidth="1.5" /> : null}
      {type === 'candles' ? <Candles data={data} geometry={geometry} /> : null}
      {type === 'bars' ? <Bars data={data} geometry={geometry} /> : null}

      {overlays.bb ? (
        <g>
          <path
            d={linePath(ind.bb.up, xAt, scaleY)}
            fill="none"
            stroke={OVERLAY_STROKES.bb}
            strokeWidth="1"
            opacity="0.55"
          />
          <path
            d={linePath(ind.bb.mid, xAt, scaleY)}
            fill="none"
            stroke={OVERLAY_STROKES.bb}
            strokeWidth="1"
            opacity="0.35"
            strokeDasharray="3 3"
          />
          <path
            d={linePath(ind.bb.lo, xAt, scaleY)}
            fill="none"
            stroke={OVERLAY_STROKES.bb}
            strokeWidth="1"
            opacity="0.55"
          />
        </g>
      ) : null}
      {['ma20', 'ma50', 'ema9'].map((key) =>
        overlays[key] ? (
          <path
            key={key}
            d={linePath(ind[key], xAt, scaleY)}
            fill="none"
            stroke={OVERLAY_STROKES[key]}
            strokeWidth="1.3"
          />
        ) : null,
      )}
      {overlays.vwap ? (
        <path
          d={linePath(ind.vwap, xAt, scaleY)}
          fill="none"
          stroke={OVERLAY_STROKES.vwap}
          strokeWidth="1.2"
          strokeDasharray="4 3"
        />
      ) : null}

      <g>
        <line
          x1={0}
          x2={width - PAD_R}
          y1={scaleY(last)}
          y2={scaleY(last)}
          stroke="#3f7fd8"
          strokeDasharray="3 3"
          opacity="0.7"
        />
        <rect x={width - PAD_R + 2} y={scaleY(last) - 8} width={PAD_R - 4} height={16} rx={2} fill="#3b82f6" />
        <text
          x={width - PAD_R + 6}
          y={scaleY(last) + 3.5}
          fill="#fff"
          fontSize="10"
          fontFamily="JetBrains Mono"
        >
          {last.toFixed(2)}
        </text>
      </g>
    </g>
  )
})

function Crosshair({ bar, index, geometry, width }) {
  const { xAt, scaleY, chartH } = geometry

  return (
    <g>
      <line
        x1={xAt(index)}
        x2={xAt(index)}
        y1={PAD_T}
        y2={PAD_T + chartH}
        stroke="#71717a"
        strokeDasharray="3 3"
      />
      <line
        x1={0}
        x2={width - PAD_R}
        y1={scaleY(bar.close)}
        y2={scaleY(bar.close)}
        stroke="#71717a"
        strokeDasharray="3 3"
      />
      <rect x={width - PAD_R + 2} y={scaleY(bar.close) - 8} width={PAD_R - 4} height={16} rx={2} fill="#3f3f46" />
      <text
        x={width - PAD_R + 6}
        y={scaleY(bar.close) + 3.5}
        fill="#e4e4e7"
        fontSize="10"
        fontFamily="JetBrains Mono"
      >
        {bar.close.toFixed(2)}
      </text>
    </g>
  )
}

export function TVChart({ data, ind, type, overlays, hover, setHover, height = 360 }) {
  const [ref, width] = useWidth()

  const geometry = useMemo(
    () => priceGeometry({ data, ind, width, height, withBands: overlays.bb }),
    [data, ind, width, height, overlays.bb],
  )

  if (data.length === 0) return null

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height }}
      onMouseMove={(e) => setHover(indexFromPointer(e, geometry.slot, data.length))}
      onMouseLeave={() => setHover(null)}
    >
      <svg width={width} height={height}>
        <ChartBody
          data={data}
          ind={ind}
          type={type}
          overlays={overlays}
          geometry={geometry}
          width={width}
        />
        {hover != null && data[hover] ? (
          <Crosshair bar={data[hover]} index={hover} geometry={geometry} width={width} />
        ) : null}
      </svg>
    </div>
  )
}

export function SubPane({ title, height, children }) {
  return (
    <div className="border-t border-white/[0.06]">
      <div className="absolute z-10 px-3 pt-1.5 text-[10px] num text-zinc-500 pointer-events-none">{title}</div>
      <div style={{ height }} className="relative">
        {children}
      </div>
    </div>
  )
}
