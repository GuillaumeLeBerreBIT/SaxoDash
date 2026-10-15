import { Link } from 'react-router-dom'

import { useCongressOwnership } from '../../api/queries'
import { partyLabel } from '../../lib/congress'
import { fmtPct } from '../../lib/format'
import { ownershipTicker } from '../../lib/ownership'
import { EmptyState, QueryState, StatRow, StatStrip } from '../ui'
import TradeHistory from '../congress/TradeHistory'

const US_ONLY = 'House disclosures are matched by US ticker, so only US-dollar listings are looked up.'

const memberSubtitle = (member) => {
  const party = partyLabel(member.party, member.state_district)
  if (member.holds_weight_pct == null) return party
  return `${party} · ${fmtPct(member.holds_weight_pct, { sign: false, decimals: 1 })} of estimated portfolio`
}

export default function CongressTab({ symbol, currency }) {
  const ticker = ownershipTicker({ ticker: symbol, currency })
  const ownership = useCongressOwnership(ticker)

  if (!ticker) return <EmptyState title={`No House data for ${symbol}`} hint={US_ONLY} />
  if (ownership.isLoading || ownership.error) {
    return <QueryState isLoading={ownership.isLoading} error={ownership.error} onRetry={ownership.refetch} label="House trades" />
  }
  const { window_days: windowDays, stock, members = [] } = ownership.data ?? {}
  if (!stock || members.length === 0) {
    return <EmptyState title={`No House member has disclosed a ${symbol} trade since 2021`} />
  }
  const note = `members, last ${windowDays} days`
  return (
    <div className="space-y-3">
      <StatStrip>
        <StatRow label="Bought" value={String(stock.buyers)} note={note} lead />
        <StatRow label="Sold" value={String(stock.sellers)} note={note} />
        <StatRow label="Holding" value={String(stock.holders)} note="members (estimated)" />
      </StatStrip>
      {members.map((member) => (
        <TradeHistory
          key={member.slug}
          trades={member.trades}
          showAsset={false}
          title={<Link to={`/investors/congress/${member.slug}`} className="hover:text-blue-300">{member.name}</Link>}
          subtitle={memberSubtitle(member)}
        />
      ))}
    </div>
  )
}
