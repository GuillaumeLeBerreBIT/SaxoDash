import { Badge } from '../ui'

const wholePct = (pct) => (pct == null ? '' : ` ${Math.round(Math.abs(pct))}%`)

export default function ChangeBadge({ change, pct }) {
  if (change === 'new') return <Badge tone="blue">New</Badge>
  if (change === 'sold_out') return <Badge tone="amber">Sold out</Badge>
  if (change === 'added') return <Badge tone="zinc">{`▲ Added${wholePct(pct)}`}</Badge>
  if (change === 'trimmed') return <Badge tone="zinc">{`▼ Trimmed${wholePct(pct)}`}</Badge>
  if (change === 'unchanged') return <span className="text-[var(--fig-2xs)] text-zinc-500">Unchanged</span>
  return null
}
