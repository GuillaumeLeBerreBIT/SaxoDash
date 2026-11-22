import { useId, useState } from 'react'

import { useSize } from '../../lib/chartGeometry'
import { fmtDate, fmtMoney, fmtNum } from '../../lib/format'
import { indexAtPointer, priceChartGeometry } from '../../lib/priceChart'
import { useChartColors } from '../../theme/useChartColors'

const HEIGHTS = [
  [700, 380],
  [520, 300],
  [0, 220],
]
const TIP_WIDTH = 150

export default function PriceChart({ bars, previous, showVolume, currency, symbol }) {
  const [ref, size] = useSize()
  const colors = useChartColors()
  const gradientId = useId()
  const [hover, setHover] = useState(null)

  const height = HEIGHTS.find(([minWidth]) => size.width >= minWidth)[1]
  const geometry = priceChartGeometry(bars, { width: size.width, height, showVolume, previous })
  const hovered = geometry && hover != null && hover < bars.length ? hover : null
  const price = (value) => (currency ? fmtMoney(value, currency) : fmtNum(value, 2))

  const onPointerMove = (event) => {
    if (!geometry) return
    const rect = event.currentTarget.getBoundingClientRect()
    setHover(indexAtPointer(((event.clientX - rect.left) / rect.width) * geometry.width, geometry, bars.length))
  }

  return (
    <div ref={ref} className="relative min-w-0">
      {geometry ? (
        <>
          <svg
            width={geometry.width}
            height={geometry.height}
            viewBox={`0 0 ${geometry.width} ${geometry.height}`}
            role="img"
            aria-label={`${symbol || 'Price'} price chart`}
            className="block touch-pan-y"
            onPointerMove={onPointerMove}
            onPointerLeave={() => setHover(null)}
          >
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colors.primary} stopOpacity="0.28" />
                <stop offset="100%" stopColor={colors.primary} stopOpacity="0.02" />
              </linearGradient>
            </defs>
            {geometry.ticks.map((tick) => (
              <g key={tick.value}>
                <line x1={0} x2={geometry.plotRight} y1={tick.y} y2={tick.y} stroke={colors.grid} />
                <text x={geometry.plotRight + 8} y={tick.y + 4} fontSize="11" fill={colors.axis}>
                  {fmtNum(tick.value, 2)}
                </text>
              </g>
            ))}
            {geometry.dates.map((tick) => (
              <text key={tick.x} x={tick.x} y={geometry.height - 6} fontSize="11" textAnchor={tick.anchor} fill={colors.axis}>
                {tick.text}
              </text>
            ))}
            {geometry.volume.map((bar) => (
              <rect key={bar.x} x={bar.x} y={bar.y} width={bar.width} height={bar.height} fill={colors.axis} fillOpacity="0.35" />
            ))}
            <path d={geometry.area} fill={`url(#${gradientId})`} stroke="none" />
            <path d={geometry.line} fill="none" stroke={colors.primary} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
            {geometry.previousY == null ? null : (
              <g data-testid="previous-close-line">
                <line x1={0} x2={geometry.plotRight} y1={geometry.previousY} y2={geometry.previousY} stroke={colors.primary} strokeDasharray="4 4" />
                <rect x={geometry.plotRight + 2} y={geometry.previousY - 9} width={geometry.width - geometry.plotRight - 2} height={18} rx="3" fill={colors.primary} />
                <text
                  x={geometry.plotRight + 2 + (geometry.width - geometry.plotRight - 2) / 2}
                  y={geometry.previousY + 4}
                  fontSize="11"
                  fontWeight="600"
                  textAnchor="middle"
                  fill={colors.onAccent}
                >
                  {fmtNum(previous, 2)}
                </text>
              </g>
            )}
            {hovered == null ? null : (
              <g pointerEvents="none">
                <line x1={geometry.x(hovered)} x2={geometry.x(hovered)} y1={geometry.top} y2={geometry.bottom} stroke={colors.crosshair} />
                <circle cx={geometry.x(hovered)} cy={geometry.y(bars[hovered].close)} r="4.5" fill={colors.primary} stroke={colors.tooltip.bg} strokeWidth="2" />
              </g>
            )}
          </svg>
          {hovered == null ? null : (
            <div
              data-testid="price-hover"
              className="pointer-events-none absolute top-1.5 rounded-lg border border-line bg-pane px-2.5 py-1.5 text-[13px] text-ink shadow-lg"
              style={{ width: TIP_WIDTH, left: Math.min(Math.max(geometry.x(hovered) - TIP_WIDTH / 2, 0), geometry.width - TIP_WIDTH) }}
            >
              <div className="text-[12px] text-ink-3">{fmtDate(bars[hovered].date)}</div>
              <div className="num">
                <span className="font-semibold">{symbol}</span> {price(bars[hovered].close)}
              </div>
            </div>
          )}
        </>
      ) : null}
    </div>
  )
}
