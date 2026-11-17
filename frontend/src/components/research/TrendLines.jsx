import { useRef, useState } from 'react'

import { indexFromPointer, svgY } from '../../lib/chartGeometry'
import { annotationKeyCommand, NUDGE_KEYS, nudgePoint, showsKeyboardFocus } from '../../lib/chartKeys'
import { fmtDate } from '../../lib/format'
import { badgePrice, roundPrice } from '../../lib/priceLines'
import { useChartColors } from '../../theme/useChartColors'

const HIT_WIDTH = 10
const HANDLE_RADIUS = 4
const FOCUSED_HANDLE_RADIUS = 6
const HANDLE_HIT_RADIUS = 10

const stop = (event) => event.stopPropagation()

function Handle({ line, endpoint, index, x, y, geometry, data, onMove, onSelect, onEdit }) {
  const c = useChartColors()
  const [preview, setPreview] = useState(null)
  const [focused, setFocused] = useState(false)
  const drag = useRef(null)
  const keyed = useRef(false)
  const point = preview ?? { x, y }
  const shownIndex = preview?.index ?? index
  const name = `${endpoint === 'start' ? 'Start' : 'End'} of ${line.label ? `ray ${line.label}` : 'ray'}`

  const cancel = () => {
    drag.current = null
    setPreview(null)
  }

  const save = (moved) => {
    cancel()
    if (moved == null) return
    onMove(line, endpoint, { barDate: data[moved.index].date, price: roundPrice(geometry.priceAtY(moved.y)) })
  }

  const saveKeyed = () => {
    if (!keyed.current) return
    keyed.current = false
    save(preview)
  }

  return (
    <g>
      <circle
        cx={point.x}
        cy={point.y}
        r={focused ? FOCUSED_HANDLE_RADIUS : HANDLE_RADIUS}
        fill={c.axisCategory}
        stroke={focused ? c.ink : undefined}
        pointerEvents="none"
      />
      <circle
        data-testid={`trend-line-handle-${line.id}-${endpoint}`}
        cx={point.x}
        cy={point.y}
        r={HANDLE_HIT_RADIUS}
        fill="transparent"
        style={{ cursor: 'move', outline: 'none' }}
        tabIndex={0}
        role="button"
        aria-label={`${name}, ${fmtDate(data[Math.min(shownIndex, data.length - 1)]?.date)} at ${badgePrice(roundPrice(geometry.priceAtY(point.y)))}`}
        onFocus={(e) => {
          setFocused(showsKeyboardFocus(e.currentTarget))
          onSelect(line.id)
        }}
        onBlur={() => {
          setFocused(false)
          saveKeyed()
        }}
        onKeyDown={(e) => {
          const command = annotationKeyCommand(e)
          if (!command) return
          e.preventDefault()
          if (command.edit) return onEdit(line.id)
          keyed.current = true
          const next = nudgePoint({ index: Math.min(shownIndex, data.length - 1), y: point.y }, command, data.length)
          setPreview({ ...next, x: geometry.xAt(next.index) })
        }}
        onKeyUp={(e) => {
          if (NUDGE_KEYS.has(e.key)) saveKeyed()
        }}
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
          const moved = drag.current?.moved
          save(moved ? preview : null)
        }}
        onPointerCancel={cancel}
        onClick={stop}
        onDoubleClick={stop}
      />
    </g>
  )
}

function Ray({ line, geometry, data, selected, onSelect, onMove, onEdit }) {
  const c = useChartColors()
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
        stroke={c.axisCategory}
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
          fill={c.axisCategory}
          fontSize="11"
          pointerEvents="none"
        >
          {line.label}
        </text>
      ) : null}
      <Handle
        line={line}
        endpoint={line.earlyField}
        index={line.x1}
        x={x1}
        y={y1}
        geometry={geometry}
        data={data}
        onMove={onMove}
        onSelect={onSelect}
        onEdit={onEdit}
      />
      <Handle
        line={line}
        endpoint={line.earlyField === 'start' ? 'end' : 'start'}
        index={line.x2}
        x={x2}
        y={y2}
        geometry={geometry}
        data={data}
        onMove={onMove}
        onSelect={onSelect}
        onEdit={onEdit}
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
      className="absolute h-6 px-1.5 rounded bg-raised border border-accent/60 text-[var(--fig-2xs)] text-ink outline-none"
      style={{ left: x, top: y - 12, width: 140 }}
    />
  )
}
