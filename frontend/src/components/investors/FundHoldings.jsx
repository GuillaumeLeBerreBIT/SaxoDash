import { Link } from 'react-router-dom'

import { fmtPct } from '../../lib/format'
import { changeLabel, fmtSharesCompact, heldLabel, sharesChange, sharesHeld } from '../../lib/ownership'
import { researchHref } from '../../lib/research'

const PCT_LIMIT = 1000
const LINK_CLASS = 'inline-flex items-baseline justify-end gap-1.5 num font-mono text-zinc-300 hover:text-blue-300'

const None = () => <span className="text-zinc-600">—</span>

export function FundShares({ ticker, stock, quarter }) {
  const shares = sharesHeld(stock)
  if (shares == null) return <None />
  const label = heldLabel(shares, quarter)
  return (
    <Link to={researchHref(ticker, 'funds')} aria-label={label} title={label} className={LINK_CLASS}>
      {fmtSharesCompact(shares)}
    </Link>
  )
}

export function FundChange({ ticker, stock, quarter }) {
  const change = sharesChange(stock)
  if (!change) return <None />
  const up = change.direction === 'up'
  const label = changeLabel(change, quarter)
  const showPct = change.pct != null && Math.abs(change.pct) < PCT_LIMIT
  return (
    <Link to={researchHref(ticker, 'funds')} aria-label={label} title={label} className={LINK_CLASS}>
      <span>{`${up ? '▲' : '▼'}\u00a0${up ? '+' : '-'}${fmtSharesCompact(change.shares)}`}</span>
      {showPct ? <span className="hidden min-[1600px]:inline text-[var(--fig-2xs)] text-zinc-500">{fmtPct(change.pct, { decimals: 1 })}</span> : null}
    </Link>
  )
}
