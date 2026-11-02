import { memo, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ChevronsRight } from 'lucide-react'

import {
  DRAG_THRESHOLD,
  PAD_R,
  PAD_T,
  PAN_THRESHOLD,
  barsFromDrag,
  indexFromPointer,
  linePath,
  overlayStrokes,
  priceGeometry,
  scaleFromDrag,
  shiftFromDrag,
  svgY,
  useWidth,
} from '../../lib/chartGeometry'
import { fmtDate } from '../../lib/format'
import { edgeOf, isTypingTarget, roundPrice } from '../../lib/priceLines'
import PriceLines, { PriceEditor } from './PriceLines'
import TextAnnotations, { TextAnnotationEditor } from './TextAnnotations'
import TrendLines, { LabelEditor } from './TrendLines'
import { useAnnotationSelection } from './useAnnotationSelection'
import { usePointerDrag } from './usePointerDrag'
import { useChartColors } from '../../theme/useChartColors'

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

function PriceAxis({ ticks, scaleY, width, colors }) {
  return ticks.map((value) => (
    <g key={value}>
      <line
        x1={0}
        x2={width - PAD_R}
        y1={scaleY(value)}
        y2={scaleY(value)}
        stroke={colors.grid}
      />
      <text
        x={width - PAD_R + 8}
        y={scaleY(value) + 3.5}
        fill={colors.axis}
        fontSize="10"
        className="num"
      >
        {value.toFixed(value > 100 ? 0 : 2)}
      </text>
    </g>
  ))
}

function Candles({ data, geometry, colors }) {
  const { xAt, scaleY, candleWidth } = geometry

  return data.map((bar, i) => {
    const color = bar.close >= bar.open ? colors.up : colors.down
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

function Bars({ data, geometry, colors }) {
  const { xAt, scaleY, candleWidth } = geometry

  return data.map((bar, i) => (
    <g key={bar.date} stroke={bar.close >= bar.open ? colors.up : colors.down} strokeWidth="1.2">
      <line x1={xAt(i)} x2={xAt(i)} y1={scaleY(bar.high)} y2={scaleY(bar.low)} />
      <line x1={xAt(i) - candleWidth / 2} x2={xAt(i)} y1={scaleY(bar.open)} y2={scaleY(bar.open)} />
      <line x1={xAt(i)} x2={xAt(i) + candleWidth / 2} y1={scaleY(bar.close)} y2={scaleY(bar.close)} />
    </g>
  ))
}

function EarningsMarkers({ markers, geometry, colors }) {
  const markerColor = [colors.down, colors.estimate, colors.up]
  const { xAt, chartH } = geometry
  const y = PAD_T + chartH - 6
  return markers.map((marker) => {
    const x = xAt(marker.index)
    const title = marker.actual != null
      ? `${fmtDate(marker.date)}: ${marker.actual} vs est ${marker.estimate}`
      : fmtDate(marker.date)
    return (
      <polygon
        key={marker.date}
        points={`${x - 4},${y + 4} ${x + 4},${y + 4} ${x},${y - 4}`}
        fill={markerColor[marker.sign + 1]}
      >
        <title>{title}</title>
      </polygon>
    )
  })
}

const ChartBody = memo(function ChartBody({ data, ind, type, overlays, geometry, width, earningsMarkers, clipId, colors }) {
  const { xAt, scaleY, chartH, chartW } = geometry
  const closes = data.map((bar) => bar.close)
  const pricePath = linePath(closes, xAt, scaleY)
  const last = closes[closes.length - 1]
  const strokes = overlayStrokes(colors)

  return (
    <g>
      <defs>
        <clipPath id={clipId}>
          <rect x={0} y={PAD_T} width={chartW} height={chartH} />
        </clipPath>
      </defs>

      <PriceAxis ticks={geometry.ticks} scaleY={scaleY} width={width} colors={colors} />

      <g clipPath={`url(#${clipId})`}>
        {type === 'area' ? (
          <g>
            <defs>
              <linearGradient id="tvArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.primary} stopOpacity="0.28" />
                <stop offset="100%" stopColor={colors.primary} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path
              d={`${pricePath} L ${xAt(data.length - 1)} ${PAD_T + chartH} L ${xAt(0)} ${PAD_T + chartH} Z`}
              fill="url(#tvArea)"
            />
            <path d={pricePath} fill="none" stroke={colors.primary} strokeWidth="1.5" />
          </g>
        ) : null}
        {type === 'line' ? <path d={pricePath} fill="none" stroke={colors.primary} strokeWidth="1.5" /> : null}
        {type === 'candles' ? <Candles data={data} geometry={geometry} colors={colors} /> : null}
        {type === 'bars' ? <Bars data={data} geometry={geometry} colors={colors} /> : null}

        {overlays.bb ? (
          <g>
            <path
              d={linePath(ind.bb.up, xAt, scaleY)}
              fill="none"
              stroke={strokes.bb}
              strokeWidth="1"
              opacity="0.55"
            />
            <path
              d={linePath(ind.bb.mid, xAt, scaleY)}
              fill="none"
              stroke={strokes.bb}
              strokeWidth="1"
              opacity="0.35"
              strokeDasharray="3 3"
            />
            <path
              d={linePath(ind.bb.lo, xAt, scaleY)}
              fill="none"
              stroke={strokes.bb}
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
              stroke={strokes[key]}
              strokeWidth="1.3"
            />
          ) : null,
        )}
        {overlays.vwap ? (
          <path
            d={linePath(ind.vwap, xAt, scaleY)}
            fill="none"
            stroke={strokes.vwap}
            strokeWidth="1.2"
            strokeDasharray="4 3"
          />
        ) : null}

        {earningsMarkers.length > 0 ? (
          <EarningsMarkers markers={earningsMarkers} geometry={geometry} colors={colors} />
        ) : null}

        <line
          x1={0}
          x2={width - PAD_R}
          y1={scaleY(last)}
          y2={scaleY(last)}
          stroke={colors.primary}
          strokeDasharray="3 3"
          opacity="0.7"
        />
      </g>

      <g>
        <rect x={width - PAD_R + 2} y={scaleY(last) - 8} width={PAD_R - 4} height={16} rx={2} fill={colors.primary} />
        <text
          x={width - PAD_R + 6}
          y={scaleY(last) + 3.5}
          fill={colors.onAccent}
          fontSize="10"
          className="num"
        >
          {last.toFixed(2)}
        </text>
      </g>
    </g>
  )
})

function Crosshair({ bar, index, geometry, width, dimmed, colors }) {
  const { xAt, scaleY, chartH } = geometry

  return (
    <g pointerEvents="none" opacity={dimmed ? 0.4 : undefined}>
      <line
        x1={xAt(index)}
        x2={xAt(index)}
        y1={PAD_T}
        y2={PAD_T + chartH}
        stroke={colors.crosshair}
        strokeDasharray="3 3"
      />
      <line
        x1={0}
        x2={width - PAD_R}
        y1={scaleY(bar.close)}
        y2={scaleY(bar.close)}
        stroke={colors.crosshair}
        strokeDasharray="3 3"
      />
      <rect x={width - PAD_R + 2} y={scaleY(bar.close) - 8} width={PAD_R - 4} height={16} rx={2} fill={colors.tooltip.bg} stroke={colors.tooltip.border} />
      <text
        x={width - PAD_R + 6}
        y={scaleY(bar.close) + 3.5}
        fill={colors.tooltip.text}
        fontSize="10"
        className="num"
      >
        {bar.close.toFixed(2)}
      </text>
    </g>
  )
}

const NO_LINES = []
const NO_TREND_LINES = []
const NO_TEXT_ANNOTATIONS = []

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
  hoverDimmed = false,
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
  onEditLineLabel,
  trendLines = NO_TREND_LINES,
  onMoveTrendLineEndpoint,
  onDeleteTrendLine,
  onEditTrendLineLabel,
  onCreateTrendLine,
  textAnnotations = NO_TEXT_ANNOTATIONS,
  onMoveTextAnnotation,
  onDeleteTextAnnotation,
  onEditTextAnnotationText,
  onCreateTextAnnotation,
  tool = 'crosshair',
  onPlaced,
}) {
  const [ref, width] = useWidth()
  const colors = useChartColors()
  const clipId = `tv-plot-${useId().replace(/[^\w-]/g, '')}`
  const placingLine = tool === 'hline'
  const [editingId, setEditingId] = useState(null)
  const placedRef = useRef(false)
  const freeLines = useMemo(() => lines.filter((line) => line.kind === 'free'), [lines])
  const freeSelection = useAnnotationSelection({ containerRef: ref, items: freeLines, onDelete: onDeleteLine })
  const [editingFreeLineId, setEditingFreeLineId] = useState(null)
  const editingFreeLine = freeLines.find((line) => line.id === editingFreeLineId) ?? null
  const trendSelection = useAnnotationSelection({ containerRef: ref, items: trendLines, onDelete: onDeleteTrendLine })
  const [editingTrendLineId, setEditingTrendLineId] = useState(null)
  const editingTrendLine = trendLines.find((line) => line.id === editingTrendLineId) ?? null
  const textSelection = useAnnotationSelection({ containerRef: ref, items: textAnnotations, onDelete: onDeleteTextAnnotation })
  const [editingTextId, setEditingTextId] = useState(null)
  const editingText = textAnnotations.find((item) => item.id === editingTextId) ?? null
  const [textDraftPoint, setTextDraftPoint] = useState(null)
  const [textTool, setTextTool] = useState(tool)
  if (tool !== textTool) {
    setTextTool(tool)
    setTextDraftPoint(null)
  }
  const [rayStart, setRayStart] = useState(null)
  const [rayPreview, setRayPreview] = useState(null)
  const [rayTool, setRayTool] = useState(tool)
  if (tool !== rayTool) {
    setRayTool(tool)
    setRayStart(null)
    setRayPreview(null)
  }

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

  const barAt = (event) => {
    const y = plotY(event)
    if (y == null) return null
    const index = indexFromPointer(event, geometry.slot, data.length)
    return { barDate: data[index].date, price: roundPrice(geometry.priceAtY(y)), x: geometry.xAt(index), y }
  }

  return (
    <div
      ref={ref}
      className="relative w-full select-none"
      style={{ height, cursor: pan.dragging ? 'grabbing' : tool !== 'crosshair' ? 'crosshair' : undefined }}
      {...pan.handlers}
      onMouseMove={(e) => {
        setHover(indexFromPointer(e, geometry.slot, data.length))
        if (tool === 'ray' && rayStart) {
          const point = barAt(e)
          if (point) setRayPreview(point)
        }
      }}
      onMouseLeave={() => setHover(null)}
      onMouseDown={(e) => {
        if (e.detail <= 1) placedRef.current = false
      }}
      onClick={(e) => {
        if (pan.consumeMoved()) return
        freeSelection.clear()
        trendSelection.clear()
        textSelection.clear()
        if (tool === 'ray' && onCreateTrendLine && e.detail === 1) {
          const point = barAt(e)
          if (point) {
            if (!rayStart) {
              setRayStart(point)
            } else if (point.barDate !== rayStart.barDate) {
              onCreateTrendLine(
                { barDate: rayStart.barDate, price: rayStart.price },
                { barDate: point.barDate, price: point.price },
              )
              setRayStart(null)
              setRayPreview(null)
              onPlaced?.()
            } else {
              setRayPreview(point)
            }
          }
          return
        }
        if (tool === 'text' && e.detail === 1) {
          const point = barAt(e)
          if (point) setTextDraftPoint(point)
          return
        }
        if (!placingLine || !onCreateLine || e.detail > 1) return
        const y = plotY(e)
        if (y == null) return
        placedRef.current = true
        onCreateLine(roundPrice(geometry.priceAtY(y)))
        onPlaced?.()
      }}
      onDoubleClick={(e) => {
        if (tool === 'ray' || tool === 'text') return
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
          colors={colors}
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
          onSelect={(id) => {
            trendSelection.clear()
            textSelection.clear()
            freeSelection.select(id)
          }}
          onEditLabel={setEditingFreeLineId}
        />
        <TrendLines
          lines={trendLines}
          geometry={geometry}
          data={data}
          selectedId={trendSelection.selected?.id ?? null}
          onSelect={(id) => {
            freeSelection.clear()
            textSelection.clear()
            trendSelection.select(id)
          }}
          onMoveEndpoint={(line, endpoint, point) => onMoveTrendLineEndpoint?.(line, endpoint, point)}
          onEdit={setEditingTrendLineId}
        />
        <TextAnnotations
          items={textAnnotations}
          geometry={geometry}
          data={data}
          selectedId={textSelection.selected?.id ?? null}
          onSelect={(id) => {
            freeSelection.clear()
            trendSelection.clear()
            textSelection.select(id)
          }}
          onMove={(item, point) => onMoveTextAnnotation?.(item, point)}
          onEdit={setEditingTextId}
        />
        {rayStart && rayPreview ? (
          <line
            data-testid="trend-line-preview"
            x1={rayStart.x}
            y1={rayStart.y}
            x2={rayPreview.x}
            y2={rayPreview.y}
            stroke={colors.axisCategory}
            strokeDasharray="3 3"
            pointerEvents="none"
          />
        ) : null}
        {hover != null && data[hover] ? (
          <Crosshair bar={data[hover]} index={hover} geometry={geometry} width={width} dimmed={hoverDimmed} colors={colors} />
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
      {editingFreeLine ? (
        <LabelEditor
          key={editingFreeLine.id}
          value={editingFreeLine.label ?? ''}
          x={width - PAD_R + 2}
          y={geometry.scaleY(editingFreeLine.price) + 20}
          ariaLabel="Line label"
          onCommit={(label) => {
            setEditingFreeLineId(null)
            onEditLineLabel?.(editingFreeLine, label)
          }}
          onCancel={() => setEditingFreeLineId(null)}
        />
      ) : null}
      {editingTrendLine ? (
        <LabelEditor
          key={editingTrendLine.id}
          value={editingTrendLine.label}
          x={geometry.xAt(editingTrendLine.x1) + 6}
          y={geometry.scaleY(editingTrendLine.y1)}
          ariaLabel="Trend line label"
          onCommit={(label) => {
            setEditingTrendLineId(null)
            onEditTrendLineLabel?.(editingTrendLine, label)
          }}
          onCancel={() => setEditingTrendLineId(null)}
        />
      ) : null}
      {editingText ? (
        <TextAnnotationEditor
          key={editingText.id}
          text={editingText.text}
          x={geometry.xAt(editingText.index) + 6}
          y={geometry.scaleY(editingText.price)}
          onCommit={(text) => {
            setEditingTextId(null)
            onEditTextAnnotationText?.(editingText, text)
          }}
          onCancel={() => setEditingTextId(null)}
        />
      ) : null}
      {textDraftPoint ? (
        <TextAnnotationEditor
          key="draft"
          text=""
          x={textDraftPoint.x + 6}
          y={textDraftPoint.y}
          onCommit={(text) => {
            onCreateTextAnnotation?.({ barDate: textDraftPoint.barDate, price: textDraftPoint.price, text })
            setTextDraftPoint(null)
            onPlaced?.()
          }}
          onCancel={() => setTextDraftPoint(null)}
        />
      ) : null}
      {timeOffset > 0 && onTimeOffsetChange ? (
        <button
          type="button"
          data-no-pan
          aria-label="Jump to latest"
          title="Jump to latest"
          className="absolute bottom-2 flex h-6 w-6 items-center justify-center rounded border border-line bg-raised/90 text-ink-2 hover:text-ink"
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
    <div className="relative border-t border-line">
      <div className="absolute z-10 px-3 pt-1.5 text-[var(--fig-2xs)] num text-ink-3 pointer-events-none">{title}</div>
      <div style={{ height }} className="relative">
        {children}
      </div>
    </div>
  )
}
