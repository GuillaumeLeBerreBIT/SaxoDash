import { Tag } from '../ui'

const MULTIPLE_FROM_PCT = 100
const MULTIPLE_CAP = 100

function multiple(size) {
  const times = Math.round(size / 100 + 1)
  return times > MULTIPLE_CAP ? `>${MULTIPLE_CAP}×` : `${times}×`
}

function added(pct) {
  if (pct == null) return 'Added'
  const size = Math.abs(pct)
  return size >= MULTIPLE_FROM_PCT ? `Now ${multiple(size)}` : `Added ${Math.round(size)}%`
}

const trimmed = (pct) => (pct == null ? 'Trimmed' : `Trimmed ${Math.round(Math.abs(pct))}%`)

export default function ChangeBadge({ change, pct }) {
  if (change === 'new') return <Tag tone="held">New</Tag>
  if (change === 'sold_out') return <Tag tone="warn">Sold out</Tag>
  if (change === 'added') return <Tag tone="neutral" className="num">{`▲\u00a0${added(pct)}`}</Tag>
  if (change === 'trimmed') return <Tag tone="neutral" className="num">{`▼\u00a0${trimmed(pct)}`}</Tag>
  if (change === 'unchanged') return <span className="text-[12px] text-ink-3">Unchanged</span>
  return null
}
