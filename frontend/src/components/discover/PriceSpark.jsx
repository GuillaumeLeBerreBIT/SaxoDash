import { withAlpha } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'

const WIDTH = 240
const HEIGHT = 64
const PAD = 3

export default function PriceSpark({ values, cheapBelow, expensiveAbove, label }) {
  const c = useChartColors()
  if (!values || values.length < 2) return <div style={{ height: HEIGHT }} aria-hidden="true" />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const y = (value) => PAD + (1 - (value - min) / span) * (HEIGHT - 2 * PAD)
  const clampY = (value) => Math.min(HEIGHT, Math.max(0, y(value)))
  const points = values.map((value, i) => `${((i / (values.length - 1)) * WIDTH).toFixed(1)},${y(value).toFixed(1)}`).join(' ')
  const cheapTop = cheapBelow == null ? null : clampY(Number(cheapBelow))
  const dearBottom = expensiveAbove == null ? null : clampY(Number(expensiveAbove))
  const last = values[values.length - 1]

  return (
    <svg role="img" aria-label={label} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none">
      {cheapTop != null && cheapTop < HEIGHT ? (
        <rect data-zone="cheap" x="0" y={cheapTop} width={WIDTH} height={HEIGHT - cheapTop} fill={withAlpha(c.axisCategory, 0.1)} />
      ) : null}
      {dearBottom != null && dearBottom > 0 ? (
        <rect data-zone="expensive" x="0" y="0" width={WIDTH} height={dearBottom} fill={withAlpha(c.axisCategory, 0.08)} />
      ) : null}
      <polyline points={points} fill="none" stroke={c.ink} strokeWidth="1.6" strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <circle cx={WIDTH} cy={y(last)} r="2.5" fill={c.ink} />
    </svg>
  )
}
