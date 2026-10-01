import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { CATEGORY_AXIS_TEXT } from '../../lib/charts'
import { roundPrice } from '../../lib/priceLines'

const HIT_WIDTH = 10
const HANDLE_RADIUS = 4
const HANDLE_HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Handle({ line, endpoint, x, y, geometry, data, onMove }) {
  const [preview, setPreview] = useState(null)
  const drag = useRef(null)
  const point = preview ?? { x, y }

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  return (
    <g>
      <circle cx={point.x} cy={point.y} r={HANDLE_RADIUS} fill={CATEGORY_AXIS_TEXT} pointerEvents="none" />
      <circle
        data-testid={`trend-line-handle-${line.id}-${endpoint}`}
        cx={point.x}
        cy={point.y}
        r={HANDLE_HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'move' }}
        onPointerDown={(e) => {
          e.stopPropagation()
          e.currentTarget.setPointerCapture?.(e.pointerId)
          drag.current = { moved: false }
        }}
        onPointerMove={(e) => {
          if (!drag.current) return
          drag.current.moved = true
          const index = indexFromPointer(e, geometry.slot, data.length)
          setPreview({ x: geometry.xAt(index), y: svgY(e), index })
        }}
        onPointerUp={() => {
          const current = drag.current
          cancel()
          if (!current?.moved || preview == null) return
          onMove(line, endpoint, {
            barDate: data[preview.index].date,
            price: roundPrice(geometry.priceAtY(preview.y)),
          })
        }}
        onPointerCancel={cancel}
        onClick={stop}
        onDoubleClick={stop}
      />
    </g>
  )
}

function Ray({ line, geometry, data, selected, onSelect, onMove, onEdit }) {
  const x1 = geometry.xAt(line.x1)
  const y1 = geometry.scaleY(line.y1)
  const x2 = geometry.xAt(line.x2)
  const y2 = geometry.scaleY(line.y2)

  return (
    <g data-testid={`trend-line-${line.id}`}>
      <line
        x1={x1.toFixed(2)}
        x2={x2.toFixed(2)}
        y1={y1.toFixed(2)}
        y2={y2.toFixed(2)}
        stroke={CATEGORY_AXIS_TEXT}
        strokeWidth={selected ? 2 : 1}
        pointerEvents="none"
      />
      <line
        data-testid={`trend-line-hit-${line.id}`}
        x1={x1.toFixed(2)}
        x2={x2.toFixed(2)}
        y1={y1.toFixed(2)}
        y2={y2.toFixed(2)}
        stroke="transparent"
        strokeWidth={HIT_WIDTH}
        style={{ cursor: 'pointer' }}
        onClick={(e) => {
          e.stopPropagation()
          onSelect(line.id)
        }}
        onDoubleClick={(e) => {
          e.stopPropagation()
          onEdit(line.id)
        }}
      />
      {line.label ? (
        <text
          data-testid={`trend-line-label-${line.id}`}
          x={x1 + 4}
          y={y1 - 6}
          fill={CATEGORY_AXIS_TEXT}
          fontSize="10"
          fontFamily="Geist Mono"
          pointerEvents="none"
        >
          {line.label}
        </text>
      ) : null}
      <Handle line={line} endpoint={line.earlyField} x={x1} y={y1} geometry={geometry} data={data} onMove={onMove} />
      <Handle
        line={line}
        endpoint={line.earlyField === 'start' ? 'end' : 'start'}
        x={x2}
        y={y2}
        geometry={geometry}
        data={data}
        onMove={onMove}
      />
    </g>
  )
}

export default function TrendLines({ lines, geometry, data, selectedId, onSelect, onMoveEndpoint, onEdit }) {
  return lines.map((line) => (
    <Ray
      key={line.id}
      line={line}
      geometry={geometry}
      data={data}
      selected={line.id === selectedId}
      onSelect={onSelect}
      onMove={onMoveEndpoint}
      onEdit={onEdit}
    />
  ))
}

export function LabelEditor({ value, x, y, ariaLabel, onCommit, onCancel }) {
  const [draft, setDraft] = useState(value)
  const done = useRef(false)

  const close = (next) => {
    if (done.current) return
    done.current = true
    if (next == null || next === value) onCancel()
    else onCommit(next)
  }

  return (
    <input
      autoFocus
      aria-label={ariaLabel}
      value={draft}
      maxLength={60}
      onChange={(e) => setDraft(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') close(draft.trim())
        if (e.key === 'Escape') close(null)
      }}
      onBlur={() => close(draft.trim())}
      onClick={stop}
      onDoubleClick={stop}
      onPointerDown={stop}
      className="absolute h-6 px-1.5 rounded bg-zinc-900 border border-blue-500/60 text-[10px] font-mono text-zinc-100 outline-none"
      style={{ left: x, top: y - 12, width: 140 }}
    />
  )
}
