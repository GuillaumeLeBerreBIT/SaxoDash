import { fmtPct } from '../../lib/format'
import { useChartColors } from '../../theme/useChartColors'
import { Card } from '../ui'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })

export default function OwnershipCard({ fundamentals, className = '' }) {
  const c = useChartColors()
  const { shares_outstanding: shares, free_float: float } = fundamentals
  if (!shares || float == null) return null

  const free = Math.min(100, Math.max(0, (float / shares) * 100))
  const held = 100 - free

  return (
    <Card className={className} context="Shares free to trade against shares closely held" dot="ok" title="Ownership">
      <div
        role="img"
        aria-label={`Free float ${share(free)}, closely held ${share(held)}`}
        className="h-1.5 rounded-full overflow-hidden"
        style={{ backgroundColor: c.track }}
      >
        <div className="h-full" style={{ width: `${free}%`, backgroundColor: c.primary }} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-2">
        <div className="bg-tile rounded-[10px] px-3.5 py-3">
          <dt className="text-[12px] text-ink-3">Free float</dt>
          <dd className="mt-1 text-[20px] font-bold num text-ink">{share(free)}</dd>
        </div>
        <div className="bg-tile rounded-[10px] px-3.5 py-3">
          <dt className="text-[12px] text-ink-3">Closely held</dt>
          <dd className="mt-1 text-[20px] font-bold num text-ink">{share(held)}</dd>
        </div>
      </dl>
    </Card>
  )
}
