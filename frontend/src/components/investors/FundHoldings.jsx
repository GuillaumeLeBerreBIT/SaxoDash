import { fmtPct } from '../../lib/format'
import { changeLabel, fmtSharesCompact, heldLabel, sharesChange, sharesHeld } from '../../lib/ownership'
import { researchHref } from '../../lib/research'
import { None, OwnershipLink } from './OwnershipLink'

const PCT_LIMIT = 1000

export function FundShares({ ticker, stock, quarter }) {
  const shares = sharesHeld(stock)
  if (shares == null) return <None />
  const label = heldLabel(shares, quarter)
  return (
    <OwnershipLink to={researchHref(ticker, 'funds')} label={label}>
      {fmtSharesCompact(shares)}
    </OwnershipLink>
  )
}

export function FundChange({ ticker, stock, quarter }) {
  const change = sharesChange(stock)
  if (!change) return <None />
  const up = change.direction === 'up'
  const label = changeLabel(change, quarter)
  const showPct = change.pct != null && Math.abs(change.pct) < PCT_LIMIT
  return (
    <OwnershipLink to={researchHref(ticker, 'funds')} label={label}>
      <span>{`${up ? '▲' : '▼'}\u00a0${up ? '+' : '-'}${fmtSharesCompact(change.shares)}`}</span>
      {showPct ? <span className="hidden min-[1600px]:inline text-[var(--fig-2xs)] text-zinc-500">{fmtPct(change.pct, { decimals: 1 })}</span> : null}
    </OwnershipLink>
  )
}
