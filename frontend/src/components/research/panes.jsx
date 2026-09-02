import { memo, useMemo } from 'react'

import {
  DOWN,
  PAD_R,
  UP,
  indexFromPointer,
  linePath,
  paneGeometry,
  useWidth,
} from '../../lib/chartGeometry'

/** The lower panes of the Research chart: volume, RSI and MACD.
 *
 *  Each follows the same shape as the price pane - a memoised body that does
 *  not take `hover`, plus a one-line crosshair drawn over it - so dragging the
 *  pointer across the chart does not rebuild several hundred SVG nodes per
 *  frame in three panes at once. They all lay bars out through paneGeometry,
 *  which is what keeps their x positions aligned with the price chart's.
 */

const paneMouseProps = (slot, length, setHover) => ({
  onMouseMove: (e) => setHover(indexFromPointer(e, slot, length)),
  onMouseLeave: () => setHover(null),
})

function HoverLine({ x, height }) {
  return <line x1={x} x2={x} y1={0} y2={height} stroke="#71717a" strokeDasharray="3 3" />
}

const volumeHeight = (volume, max, height) => (max === 0 ? 0 : (volume / max) * (height - 16))

const VolumeBars = memo(function VolumeBars({ data, slot, barWidth, height, max }) {
  return data.map((bar, i) => {
    const barHeight = volumeHeight(bar.volume, max, height)
    return (
      <rect
        key={bar.date}
        x={i * slot + (slot - barWidth) / 2}
        y={height - barHeight}
        width={barWidth}
        height={barHeight}
        fill={bar.close >= bar.open ? UP : DOWN}
        opacity={0.4}
      />
    )
  })
})

export function VolumePane({ data, hover, setHover, height = 74 }) {
  const [ref, width] = useWidth()
  const { slot, barWidth, xAt } = paneGeometry(width, data.length)

  const max = useMemo(() => {
    let highest = 0
    for (const bar of data) if (bar.volume > highest) highest = bar.volume
    return highest
  }, [data])

  if (data.length === 0) return null

  const hovered = hover != null ? data[hover] : null

  return (
    <div ref={ref} className="w-full h-full" {...paneMouseProps(slot, data.length, setHover)}>
      <svg width={width} height={height}>
        <VolumeBars data={data} slot={slot} barWidth={barWidth} height={height} max={max} />
        {hovered ? (
          <>
            <rect
              x={hover * slot + (slot - barWidth) / 2}
              y={height - volumeHeight(hovered.volume, max, height)}
              width={barWidth}
              height={volumeHeight(hovered.volume, max, height)}
              fill={hovered.close >= hovered.open ? UP : DOWN}
              opacity={0.85}
            />
            <HoverLine x={xAt(hover)} height={height} />
          </>
        ) : null}
        <text x={width - PAD_R + 8} y={14} fill="#71717a" fontSize="10" fontFamily="JetBrains Mono">
          {(max / 1e6).toFixed(max >= 1e6 ? 0 : 1)}M
        </text>
      </svg>
    </div>
  )
}

const RsiBody = memo(function RsiBody({ values, xAt, width, chartW, height }) {
  const scaleY = (value) => 8 + ((100 - value) / 100) * (height - 16)

  return (
    <g>
      <rect
        x={0}
        y={scaleY(70)}
        width={chartW}
        height={scaleY(30) - scaleY(70)}
        fill="rgba(255,255,255,0.02)"
      />
      {[70, 30].map((level) => (
        <g key={level}>
          <line
            x1={0}
            x2={chartW}
            y1={scaleY(level)}
            y2={scaleY(level)}
            stroke="rgba(255,255,255,0.08)"
            strokeDasharray="2 4"
          />
          <text
            x={width - PAD_R + 8}
            y={scaleY(level) + 3.5}
            fill="#71717a"
            fontSize="10"
            fontFamily="JetBrains Mono"
          >
            {level}
          </text>
        </g>
      ))}
      <path d={linePath(values, xAt, scaleY)} fill="none" stroke="#c084fc" strokeWidth="1.3" />
    </g>
  )
})

export function RsiPane({ values, hover, setHover, height = 92 }) {
  const [ref, width] = useWidth()
  const { slot, chartW, xAt } = paneGeometry(width, values.length)

  if (values.length === 0) return null

  return (
    <div ref={ref} className="w-full h-full" {...paneMouseProps(slot, values.length, setHover)}>
      <svg width={width} height={height}>
        <RsiBody values={values} xAt={xAt} width={width} chartW={chartW} height={height} />
        {hover != null ? <HoverLine x={xAt(hover)} height={height} /> : null}
      </svg>
    </div>
  )
}

const MacdBody = memo(function MacdBody({ macd, slot, chartW, xAt, height }) {
  const scale = useMemo(() => {
    let peak = 0
    for (const value of [...macd.line, ...macd.signal, ...macd.hist]) {
      if (value != null && Math.abs(value) > peak) peak = Math.abs(value)
    }
    return peak || 1
  }, [macd])

  const scaleY = (value) => height / 2 - (value / scale) * (height / 2 - 10)
  const barWidth = Math.max(1, Math.min(10, slot * 0.6))

  return (
    <g>
      <line x1={0} x2={chartW} y1={height / 2} y2={height / 2} stroke="rgba(255,255,255,0.08)" />
      {macd.hist.map((value, i) =>
        value == null ? null : (
          <rect
            key={i}
            x={i * slot + (slot - barWidth) / 2}
            y={Math.min(height / 2, scaleY(value))}
            width={barWidth}
            height={Math.abs(scaleY(value) - height / 2)}
            fill={value >= 0 ? UP : DOWN}
            opacity="0.5"
          />
        ),
      )}
      <path d={linePath(macd.line, xAt, scaleY)} fill="none" stroke="#60a5fa" strokeWidth="1.2" />
      <path d={linePath(macd.signal, xAt, scaleY)} fill="none" stroke="#f59e0b" strokeWidth="1.2" />
    </g>
  )
})

export function MacdPane({ macd, hover, setHover, height = 92 }) {
  const [ref, width] = useWidth()
  const { slot, chartW, xAt } = paneGeometry(width, macd.line.length)

  if (macd.line.length === 0) return null

  return (
    <div ref={ref} className="w-full h-full" {...paneMouseProps(slot, macd.line.length, setHover)}>
      <svg width={width} height={height}>
        <MacdBody macd={macd} slot={slot} chartW={chartW} xAt={xAt} height={height} />
        {hover != null ? <HoverLine x={xAt(hover)} height={height} /> : null}
      </svg>
    </div>
  )
}

export function TimeAxis({ data }) {
  const [ref, width] = useWidth()
  const { chartW, xAt } = paneGeometry(width, data.length)
  const count = Math.min(7, data.length)

  if (data.length === 0) return null

  const indexes =
    count === 1
      ? [0]
      : Array.from({ length: count }, (_, i) => Math.floor(((data.length - 1) * i) / (count - 1)))

  return (
    <div ref={ref} className="w-full border-t border-white/[0.06]" style={{ height: 22 }}>
      <svg width={width} height={22}>
        {indexes.map((i) => (
          <text
            key={i}
            x={Math.min(chartW - 24, Math.max(20, xAt(i)))}
            y={14}
            fill="#71717a"
            fontSize="10"
            textAnchor="middle"
            fontFamily="JetBrains Mono"
          >
            {new Date(data[i].date).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
          </text>
        ))}
      </svg>
    </div>
  )
}
