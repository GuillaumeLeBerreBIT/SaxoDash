import { Link } from 'react-router-dom'

import { filedLine, partyLabel } from '../../lib/congress'
import { fmtNum } from '../../lib/format'
import { points } from '../../lib/investors'
import { Card } from '../ui'
import { TopLogos } from '../investors/InvestorCard'
import MemberPhoto from './MemberPhoto'

export function FiledLine({ member }) {
  return <span className="text-zinc-500">{filedLine(member.last_filed)}</span>
}

export default function CongressCard({ member }) {
  return (
    <Card interactive className="relative h-full flex flex-col gap-2">
      <div data-testid="congress-card" className="contents">
        <div className="flex items-start gap-2.5">
          <MemberPhoto member={member} />
          <div className="min-w-0 flex-1">
            <Link
              to={`/investors/congress/${member.slug}`}
              className="block truncate text-[var(--fig-sm)] font-medium text-zinc-100 after:absolute after:inset-0 after:rounded-lg focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-blue-500"
            >
              {member.name}
            </Link>
            <div className="text-[var(--fig-xs)] text-zinc-500">{partyLabel(member.party, member.state_district)}</div>
          </div>
        </div>
        <div className="flex items-baseline justify-between gap-2">
          <span className="flex items-baseline gap-1.5">
            <span className="text-[var(--fig-md)] num font-mono text-zinc-50">{points(member.excess_cagr_pct)}</span>
            <span className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500">edge / yr</span>
          </span>
          <span className="text-[var(--fig-xs)] num font-mono text-zinc-500">{`${fmtNum(member.trades)} trades`}</span>
        </div>
        <div className="min-h-[22px]">
          {member.top_holdings?.length ? <TopLogos holdings={member.top_holdings} /> : <span className="text-[var(--fig-xs)] text-zinc-600">No priced holdings</span>}
        </div>
        <div className="mt-auto text-[var(--fig-xs)]"><FiledLine member={member} /></div>
      </div>
    </Card>
  )
}
