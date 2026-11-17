import { fmtClock, oldestPricedAt, weakestPriceBasis } from '../lib/pricing'

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
    <span className="flex items-center gap-1.5 text-[12px] text-ink-3 num" title={basis.note}>
      <span>{`${basis.label} prices`}</span>
      {at && <span>{`· ${at}`}</span>}
    </span>
  )
}
