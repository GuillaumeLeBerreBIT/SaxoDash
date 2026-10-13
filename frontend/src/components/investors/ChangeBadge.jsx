import { Badge } from '../ui'

const MULTIPLE_FROM_PCT = 1000

function wholePct(pct) {
  if (pct == null) return ''
  const size = Math.abs(pct)
  return size >= MULTIPLE_FROM_PCT ? ` ${Math.round(size / 100 + 1)}×` : ` ${Math.round(size)}%`
}

export default function ChangeBadge({ change, pct }) {
  if (change === 'new') return <Badge tone="blue">New</Badge>
  if (change === 'sold_out') return <Badge tone="amber" className="whitespace-nowrap">Sold out</Badge>
  if (change === 'added') return <Badge tone="zinc">{`▲\u00a0Added${wholePct(pct)}`}</Badge>
  if (change === 'trimmed') return <Badge tone="zinc">{`▼\u00a0Trimmed${wholePct(pct)}`}</Badge>
  if (change === 'unchanged') return <span className="text-[var(--fig-2xs)] text-zinc-500">Unchanged</span>
  return null
}
