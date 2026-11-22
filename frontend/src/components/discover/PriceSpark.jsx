import { useId } from 'react'
import { hasPriceRange } from '../../lib/priceBar'
import { useChartColors } from '../../theme/useChartColors'

const WIDTH = 240
const HEIGHT = 64
const PAD = 3

export default function PriceSpark({ values, cheapBelow, expensiveAbove, label }) {
  const c = useChartColors()
  const id = useId()
  if (!values || values.length < 2) return <p className="text-[12px] text-ink-3">Price history unavailable</p>
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || Math.max(Math.abs(min) * 0.01, 0.01)
  const y = (value) => HEIGHT / 2 - ((value - (min + max) / 2) / span) * (HEIGHT - 2 * PAD)
  const clampY = (value) => Math.min(HEIGHT, Math.max(0, y(value)))
  const points = values.map((value, i) => `${(PAD + (i / (values.length - 1)) * (WIDTH - 2 * PAD)).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const hasRange = hasPriceRange(cheapBelow, expensiveAbove)
  const cheapTop = hasRange ? clampY(Number(cheapBelow)) : null
  const dearBottom = hasRange ? clampY(Number(expensiveAbove)) : null
  const last = values[values.length - 1]

  const showLower = hasRange && min < cheapBelow
  const showUpper = hasRange && max > expensiveAbove
  const bands = [
    showLower && 'Lower band: prices below the usual P/E range',
    showUpper && 'Upper band: prices above the usual P/E range',
  ].filter(Boolean)

  return (
    <svg role="img" aria-label={[label, ...bands].join('. ')} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none">
      <defs>
        {showLower && (
          <linearGradient id={`${id}-lower`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor={c.up} stopOpacity={0.36} />
            <stop offset="100%" stopColor={c.up} stopOpacity={0.05} />
          </linearGradient>
        )}
        {showUpper && (
          <linearGradient id={`${id}-upper`} x1="0%" y1="100%" x2="0%" y2="0%">
            <stop offset="0%" stopColor={c.down} stopOpacity={0.36} />
            <stop offset="100%" stopColor={c.down} stopOpacity={0.05} />
          </linearGradient>
        )}
      </defs>
      {showLower && (
        <rect data-zone="cheap" x="0" y={cheapTop} width={WIDTH} height={HEIGHT - cheapTop} fill={`url(#${id}-lower)`} />
      )}
      {showUpper && (
        <rect data-zone="expensive" x="0" y="0" width={WIDTH} height={dearBottom} fill={`url(#${id}-upper)`} />
      )}
      <polyline points={points} fill="none" stroke={c.ink} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={WIDTH - PAD} cy={y(last)} r="2.5" fill={c.ink} />
    </svg>
  )
}
