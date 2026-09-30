import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronsRight } from 'lucide-react'

import {
  DOWN,
  DRAG_THRESHOLD,
  OVERLAY_STROKES,
  PAD_R,
  PAD_T,
  PAN_THRESHOLD,
  UP,
  barsFromDrag,
  indexFromPointer,
  linePath,
  priceGeometry,
  scaleFromDrag,
  shiftFromDrag,
  svgY,
  useWidth,
} from '../../lib/chartGeometry'
import { AXIS_TEXT, BEAT, MISS, REPORTED, SERIES_TOTAL } from '../../lib/charts'
import { edgeOf, isTypingTarget, roundPrice } from '../../lib/priceLines'
import PriceLines, { PriceEditor } from './PriceLines'
import TrendLines, { TrendLineLabelEditor } from './TrendLines'
import { useAnnotationSelection } from './useAnnotationSelection'
import { usePointerDrag } from './usePointerDrag'

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
        fill={AXIS_TEXT}
        fontSize="10"
        fontFamily="Geist Mono"
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

const MARKER_COLOR = [MISS, REPORTED, BEAT]

function EarningsMarkers({ markers, geometry }) {
  const { xAt, chartH } = geometry
  const y = PAD_T + chartH - 6
  return markers.map((marker) => {
    const x = xAt(marker.index)
    const title = marker.actual != null
      ? `${marker.date}: ${marker.actual} vs est ${marker.estimate}`
      : marker.date
    return (
      <polygon
        key={marker.date}
        points={`${x - 4},${y + 4} ${x + 4},${y + 4} ${x},${y - 4}`}
        fill={MARKER_COLOR[marker.sign + 1]}
      >
        <title>{title}</title>
      </polygon>
    )
  })
}

const ChartBody = memo(function ChartBody({ data, ind, type, overlays, geometry, width, earningsMarkers, clipId }) {
  const { xAt, scaleY, chartH, chartW } = geometry
  const closes = data.map((bar) => bar.close)
  const pricePath = linePath(closes, xAt, scaleY)
  const last = closes[closes.length - 1]

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={PAD_T} width={chartW} height={chartH} />
        </clipPath>
      </defs>

      <PriceAxis ticks={geometry.ticks} scaleY={scaleY} width={width} />

      <g clipPath={`url(#${clipId})`}>
        {/* SERIES_TOTAL is named for the net-worth chart's "Total" line, but is
            really just the app's one accent blue for "the headline line" in
            any chart - reused here for the price line itself. */}
        {type === 'area' ? (
          <g>
            <defs>
              <linearGradient id="tvArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={SERIES_TOTAL} stopOpacity="0.28" />
                <stop offset="100%" stopColor={SERIES_TOTAL} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${pricePath} L ${xAt(data.length - 1)} ${PAD_T + chartH} L ${xAt(0)} ${PAD_T + chartH} Z`}
              fill="url(#tvArea)"
            />
            <path d={pricePath} fill="none" stroke={SERIES_TOTAL} strokeWidth="1.5" />
          </g>
        ) : null}
        {type === 'line' ? <path d={pricePath} fill="none" stroke={SERIES_TOTAL} strokeWidth="1.5" /> : null}
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
        {['ma20', 'ma50', 'ma200', 'ema9'].map((key) =>
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

        {earningsMarkers.length > 0 ? (
          <EarningsMarkers markers={earningsMarkers} geometry={geometry} />
        ) : null}

        <line
          x1={0}
          x2={width - PAD_R}
          y1={scaleY(last)}
          y2={scaleY(last)}
          stroke="#3f7fd8"
          strokeDasharray="3 3"
          opacity="0.7"
        />
      </g>

      <g>
        <rect x={width - PAD_R + 2} y={scaleY(last) - 8} width={PAD_R - 4} height={16} rx={2} fill={REPORTED} />
        <text
          x={width - PAD_R + 6}
          y={scaleY(last) + 3.5}
          fill="#fff"
          fontSize="10"
          fontFamily="Geist Mono"
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
    <g pointerEvents="none">
      <line
        x1={xAt(index)}
        x2={xAt(index)}
        y1={PAD_T}
        y2={PAD_T + chartH}
        stroke={AXIS_TEXT}
        strokeDasharray="3 3"
      />
      <line
        x1={0}
        x2={width - PAD_R}
        y1={scaleY(bar.close)}
        y2={scaleY(bar.close)}
        stroke={AXIS_TEXT}
        strokeDasharray="3 3"
      />
      <rect x={width - PAD_R + 2} y={scaleY(bar.close) - 8} width={PAD_R - 4} height={16} rx={2} fill="#3f3f46" />
      <text
        x={width - PAD_R + 6}
        y={scaleY(bar.close) + 3.5}
        fill="#e4e4e7"
        fontSize="10"
        fontFamily="Geist Mono"
      >
        {bar.close.toFixed(2)}
      </text>
    </g>
  )
}

const NO_LINES = []
const NO_TREND_LINES = []

function ScaleHandle({ width, height, yScale, onChange, onClickAt, onReset }) {
  const drag = useRef(null)

  if (!onChange && !onClickAt && !onReset) return null

  const end = () => {
    drag.current = null
  }

  return (
    <rect
      data-testid="price-scale"
      data-no-pan
      x={width - PAD_R}
      y={0}
      width={PAD_R}
      height={height}
      fill="transparent"
      style={{ cursor: 'ns-resize' }}
      onPointerDown={(e) => {
        if (e.button !== 0) return
        e.currentTarget.setPointerCapture?.(e.pointerId)
        drag.current = { y: e.clientY, scale: yScale, moved: false }
      }}
      onPointerMove={(e) => {
        if (!drag.current) return
        const dy = e.clientY - drag.current.y
        if (!drag.current.moved && Math.abs(dy) < DRAG_THRESHOLD) return
        drag.current.moved = true
        if (onChange) onChange(scaleFromDrag(drag.current.scale, dy))
      }}
      onPointerUp={(e) => {
        const current = drag.current
        drag.current = null
        if (current && !current.moved && onClickAt) {
          onClickAt(svgY(e))
        }
      }}
      onPointerCancel={end}
      onDoubleClick={(e) => {
        e.stopPropagation()
        if (onReset) onReset()
        else if (onChange) onChange(1)
      }}
    />
  )
}

export function TVChart({
  data,
  ind,
  type,
  overlays,
  hover,
  setHover,
  height = 360,
  earningsMarkers = [],
  yScale = 1,
  onYScaleChange,
  onPriceScaleReset,
  yShift = 0,
  onYShiftChange,
  timeOffset = 0,
  onTimeOffsetChange,
  lines = NO_LINES,
  onMoveLine,
  onCreateLine,
  onDeleteLine,
  trendLines = NO_TREND_LINES,
  onMoveTrendLineEndpoint,
  onDeleteTrendLine,
  onEditTrendLineLabel,
  onSelectTrendLine,
  tool = 'crosshair',
  onPlaced,
}) {
  const [ref, width] = useWidth()
  const clipId = `tv-plot-${useId().replace(/[^\w-]/g, '')}`
  const placingLine = tool === 'hline'
  const [editingId, setEditingId] = useState(null)
  const placedRef = useRef(false)
  const freeLines = useMemo(() => lines.filter((line) => line.kind === 'free'), [lines])
  const freeSelection = useAnnotationSelection({ containerRef: ref, items: freeLines, onDelete: onDeleteLine })
  const trendSelection = useAnnotationSelection({ containerRef: ref, items: trendLines, onDelete: onDeleteTrendLine })
  const [editingTrendLineId, setEditingTrendLineId] = useState(null)
  const editingTrendLine = trendLines.find((line) => line.id === editingTrendLineId) ?? null

  const geometry = useMemo(
    () => priceGeometry({ data, ind, width, height, withBands: overlays.bb, yScale, yShift }),
    [data, ind, width, height, overlays.bb, yScale, yShift],
  )

  const canPan = Boolean(onTimeOffsetChange || onYShiftChange)
  const pan = usePointerDrag({
    threshold: PAN_THRESHOLD,
    onStart: (event) => {
      if (!canPan || isTypingTarget(event.target) || event.target.closest?.('[data-no-pan]')) return null
      const x = event.clientX - event.currentTarget.getBoundingClientRect().left
      return x < width - PAD_R ? { offset: timeOffset, shift: yShift } : null
    },
    onDrag: ({ dx, dy, context }) => {
      onTimeOffsetChange?.(context.offset + barsFromDrag(dx, geometry.slot))
      onYShiftChange?.(shiftFromDrag(context.shift, dy, geometry.chartH))
    },
  })

  const wheelTarget = useRef({ slot: geometry.slot, onTimeOffsetChange })
  useLayoutEffect(() => {
    wheelTarget.current = { slot: geometry.slot, onTimeOffsetChange }
  })

  const hasData = data.length > 0
  useEffect(() => {
    const element = ref.current
    if (!element) return undefined
    let carry = 0
    const onWheel = (event) => {
      const { slot, onTimeOffsetChange: change } = wheelTarget.current
      if (!change || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return
      event.preventDefault()
      carry += event.deltaX
      const steps = Math.trunc(carry / slot)
      if (steps === 0) return
      carry -= steps * slot
      change((current) => current - steps)
    }
    element.addEventListener('wheel', onWheel, { passive: false })
    return () => element.removeEventListener('wheel', onWheel)
  }, [ref, hasData])

  const editing = lines.find((line) => line.id === editingId) ?? null

  if (data.length === 0) return null

  const plotY = (event) => {
    const box = event.currentTarget.getBoundingClientRect()
    const x = event.clientX - box.left
    const y = event.clientY - box.top
    return x < width - PAD_R && y >= PAD_T && y <= PAD_T + geometry.chartH ? y : null
  }

  const editAt = (y) => {
    let nearest = null
    for (const line of lines) {
      if (edgeOf(line.price, geometry)) continue
      const distance = Math.abs(geometry.scaleY(line.price) - y)
      if (distance <= 8 && (!nearest || distance < nearest.distance)) nearest = { line, distance }
    }
    if (nearest) setEditingId(nearest.line.id)
  }

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height, cursor: pan.dragging ? 'grabbing' : tool !== 'crosshair' ? 'crosshair' : undefined }}
      {...pan.handlers}
      onMouseMove={(e) => setHover(indexFromPointer(e, geometry.slot, data.length))}
      onMouseLeave={() => setHover(null)}
      onMouseDown={(e) => {
        if (e.detail <= 1) placedRef.current = false
      }}
      onClick={(e) => {
        if (pan.consumeMoved()) return
        freeSelection.clear()
        trendSelection.clear()
        if (!placingLine || !onCreateLine || e.detail > 1) return
        const y = plotY(e)
        if (y == null) return
        placedRef.current = true
        onCreateLine(roundPrice(geometry.priceAtY(y)))
        onPlaced?.()
      }}
      onDoubleClick={(e) => {
        if (placedRef.current) {
          placedRef.current = false
          return
        }
        if (!onCreateLine) return
        const y = plotY(e)
        if (y != null) onCreateLine(roundPrice(geometry.priceAtY(y)))
      }}
    >
      <svg width={width} height={height}>
        <ChartBody
          data={data}
          ind={ind}
          type={type}
          overlays={overlays}
          geometry={geometry}
          width={width}
          earningsMarkers={earningsMarkers}
          clipId={clipId}
        />
        <ScaleHandle
          width={width}
          height={height}
          yScale={yScale}
          onChange={onYScaleChange}
          onClickAt={lines.length > 0 ? editAt : undefined}
          onReset={onPriceScaleReset}
        />
        <PriceLines
          lines={lines}
          geometry={geometry}
          width={width}
          selectedId={freeSelection.selected?.id ?? null}
          onMove={(line, price) => onMoveLine?.(line, price)}
          onSelect={freeSelection.select}
        />
        <TrendLines
          lines={trendLines}
          geometry={geometry}
          data={data}
          selectedId={trendSelection.selected?.id ?? null}
          onSelect={(id) => {
            trendSelection.select(id)
            onSelectTrendLine?.(id)
          }}
          onMoveEndpoint={(line, endpoint, point) => onMoveTrendLineEndpoint?.(line, endpoint, point)}
          onEdit={setEditingTrendLineId}
        />
        {hover != null && data[hover] ? (
          <Crosshair bar={data[hover]} index={hover} geometry={geometry} width={width} />
        ) : null}
      </svg>
      {editing ? (
        <PriceEditor
          key={editing.id}
          line={editing}
          y={geometry.scaleY(editing.price)}
          width={width}
          onCommit={(line, price) => {
            setEditingId(null)
            onMoveLine?.(line, price)
          }}
          onCancel={() => setEditingId(null)}
        />
      ) : null}
      {editingTrendLine ? (
        <TrendLineLabelEditor
          key={editingTrendLine.id}
          line={editingTrendLine}
          x={geometry.xAt(editingTrendLine.x1) + 6}
          y={geometry.scaleY(editingTrendLine.y1)}
          onCommit={(line, label) => {
            setEditingTrendLineId(null)
            onEditTrendLineLabel?.(line, label)
          }}
          onCancel={() => setEditingTrendLineId(null)}
        />
      ) : null}
      {timeOffset > 0 && onTimeOffsetChange ? (
        <button
          type="button"
          data-no-pan
          aria-label="Jump to latest"
          title="Jump to latest"
          className="absolute bottom-2 flex h-6 w-6 items-center justify-center rounded border border-white/10 bg-zinc-900/90 text-zinc-300 hover:text-white"
          style={{ right: PAD_R + 8 }}
          onClick={(e) => {
            e.stopPropagation()
            onTimeOffsetChange(0)
          }}
          onDoubleClick={(e) => e.stopPropagation()}
        >
          <ChevronsRight size={14} aria-hidden="true" />
        </button>
      ) : null}
    </div>
  )
}

export function SubPane({ title, height, children }) {
  return (
    <div className="border-t border-white/[0.06]">
      <div className="absolute z-10 px-3 pt-1.5 text-[var(--fig-2xs)] num text-zinc-500 pointer-events-none">{title}</div>
      <div style={{ height }} className="relative">
        {children}
      </div>
    </div>
  )
}
