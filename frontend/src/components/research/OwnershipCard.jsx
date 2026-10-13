import { SERIES_TOTAL, TRACK } from '../../lib/charts'
import { fmtPct } from '../../lib/format'
import { Card, CardHeader } from '../ui'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

export default function OwnershipCard({ fundamentals }) {
  const { shares_outstanding: shares, free_float: float } = fundamentals
  if (!shares || float == null) return null

  const free = Math.min(100, Math.max(0, (float / shares) * 100))
  const held = 100 - free

  return (
    <Card>
      <CardHeader title="Ownership" subtitle="Shares free to trade against shares closely held" />
      <div
        role="img"
        aria-label={`Free float ${share(free)}, closely held ${share(held)}`}
        className="mt-4 h-2.5 rounded-full overflow-hidden"
        style={{ backgroundColor: TRACK }}
      >
        <div className="h-full" style={{ width: `${free}%`, backgroundColor: SERIES_TOTAL }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-4 text-[var(--fig-xs)]">
        <div>
          <dt className="text-zinc-500">Free float</dt>
          <dd className="num font-mono text-[var(--fig-md)] text-zinc-100">{share(free)}</dd>
        </div>
        <div>
          <dt className="text-zinc-500">Closely held</dt>
          <dd className="num font-mono text-[var(--fig-md)] text-zinc-100">{share(held)}</dd>
        </div>
      </dl>
    </Card>
  )
}
