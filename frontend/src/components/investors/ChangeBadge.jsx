import { Tag } from '../ui'

const MULTIPLE_FROM_PCT = 1000
const MULTIPLE_CAP = '>10×'

function wholePct(pct) {
  if (pct == null) return ''
  const size = Math.abs(pct)
  return size >= MULTIPLE_FROM_PCT ? ` ${MULTIPLE_CAP}` : ` ${Math.round(size)}%`
}

export default function ChangeBadge({ change, pct }) {
  if (change === 'new') return <Tag tone="held">New</Tag>
  if (change === 'sold_out') return <Tag tone="warn">Sold out</Tag>
  if (change === 'added') return <Tag tone="neutral" className="num">{`▲\u00a0Added${wholePct(pct)}`}</Tag>
  if (change === 'trimmed') return <Tag tone="neutral" className="num">{`▼\u00a0Trimmed${wholePct(pct)}`}</Tag>
  if (change === 'unchanged') return <span className="text-[12px] text-ink-3">Unchanged</span>
  return null
}
