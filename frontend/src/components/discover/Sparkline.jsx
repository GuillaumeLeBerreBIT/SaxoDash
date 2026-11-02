import { useChartColors } from '../../theme/useChartColors'

const WIDTH = 120
const DEFAULT_HEIGHT = 32

export default function Sparkline({ values, height = DEFAULT_HEIGHT }) {
  const c = useChartColors()
  if (!values || values.length < 2) return <div style={{ height }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * WIDTH).toFixed(1)},${(height - ((v - min) / span) * height).toFixed(1)}`)
    .join(' ')
  const stroke = values[values.length - 1] >= values[0] ? c.up : c.down

  return (
    <svg viewBox={`0 0 ${WIDTH} ${height}`} width="100%" height={height} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
