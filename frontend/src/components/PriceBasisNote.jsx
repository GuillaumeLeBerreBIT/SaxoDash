import { fmtClock, oldestPricedAt, weakestPriceBasis } from '../lib/pricing'
import { Badge } from './ui'

/** Says how good the prices in a table are, when they are not live.
 *
 *  Silent for a fully live book: there is nothing to disclose, and a badge on
 *  every screen trains people to stop reading it.
 */
export default function PriceBasisNote({ positions = [] }) {
  const basis = weakestPriceBasis(positions)
  if (!basis || basis.label === 'Live') return null

  const at = fmtClock(oldestPricedAt(positions))

  return (
    <span className="flex items-center gap-2" title={basis.note}>
      <Badge tone={basis.tone}>{basis.label}</Badge>
      {at && <span className="text-[11px] text-zinc-500 num font-mono">{at}</span>}
    </span>
  )
}
