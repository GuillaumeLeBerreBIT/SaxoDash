import { Link } from 'react-router-dom'

import { useCongressOwnership } from '../../api/queries'
import { partyLabel } from '../../lib/congress'
import { fmtPct } from '../../lib/format'
import { ownershipTicker } from '../../lib/ownership'
import { Card, EmptyState, QueryState } from '../ui'
import TradeHistory from '../congress/TradeHistory'
import SummaryTiles from './SummaryTiles'

const US_ONLY = 'House disclosures are matched by US ticker, so only US-dollar listings are looked up.'

const BOARD = 'grid grid-cols-1 min-[1100px]:grid-cols-12 gap-[var(--sd-gap,12px)] items-start'
const SPAN_12 = 'min-[1100px]:col-span-12'

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
    return <EmptyState title={`No House member has disclosed a ${symbol} trade`} />
  }
  const note = `members, last ${windowDays} days`
  return (
    <div className={BOARD}>
      <Card
        className={SPAN_12}
        context={`House reports · trades in the last ${windowDays} days, holdings estimated`}
        dot="ok"
        title={`Congress and ${symbol}`}
      >
        <SummaryTiles
          label={`House members and ${symbol}`}
          tiles={[
            { label: 'Bought', value: String(stock.buyers), sub: note },
            { label: 'Sold', value: String(stock.sellers), sub: note },
            { label: 'Holding', value: String(stock.holders), sub: 'members (estimated)' },
          ]}
        />
      </Card>
      {members.map((member) => (
        <div key={member.slug} className={SPAN_12}>
          <TradeHistory
            trades={member.trades}
            showAsset={false}
            title={
              <Link to={`/investors/congress/${member.slug}`} className="hover:underline">
                {member.name}
              </Link>
            }
            subtitle={memberSubtitle(member)}
          />
        </div>
      ))}
    </div>
  )
}
