import { NEGATIVE, POSITIVE } from '../../lib/charts'

const WIDTH = 120
const HEIGHT = 32

export default function Sparkline({ values }) {
  if (!values || values.length < 2) return <div style={{ height: HEIGHT }} />
  const min = Math.min(...values)
  const max = Math.max(...values)
  const span = max - min || 1
  const points = values
    .map((v, i) => `${((i / (values.length - 1)) * WIDTH).toFixed(1)},${(HEIGHT - ((v - min) / span) * HEIGHT).toFixed(1)}`)
    .join(' ')
  const stroke = values[values.length - 1] >= values[0] ? POSITIVE : NEGATIVE

  return (
    <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT} preserveAspectRatio="none" aria-hidden="true">
      <polyline points={points} fill="none" stroke={stroke} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
    </svg>
  )
}
