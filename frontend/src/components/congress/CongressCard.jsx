import { Link } from 'react-router-dom'

import { filedLine, partyLabel } from '../../lib/congress'
import { fmtNum } from '../../lib/format'
import { points } from '../../lib/investors'
import { TopLogos } from '../investors/InvestorCard'
import InvestorAvatar from '../investors/InvestorAvatar'

export function FiledLine({ member }) {
  return <span className="text-ink-3 whitespace-nowrap">{filedLine(member.last_filed)}</span>
}

export default function CongressCard({ member }) {
  return (
    <div className="relative h-full flex flex-col gap-2 bg-tile rounded-[10px] px-3.5 py-3 hover:bg-hover transition-colors">
      <div data-testid="congress-card" className="contents">
        <div className="flex items-start gap-2.5">
          <InvestorAvatar name={member.name} photo={member.photo_url} />
          <div className="min-w-0 flex-1">
            <Link
              to={`/investors/congress/${member.slug}`}
              className="block truncate text-[14px] font-bold text-ink after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
            >
              {member.name}
            </Link>
            <div className="text-[12px] text-ink-3 truncate">{`${partyLabel(member.party, member.state_district)} · ${fmtNum(member.trades)} trades`}</div>
          </div>
        </div>
        <div className="flex items-baseline gap-1.5 whitespace-nowrap">
          <span className="text-[17px] font-bold num text-ink">{points(member.excess_cagr_pct)}</span>
          <span className="text-[12px] text-ink-3">copy edge / yr</span>
        </div>
        <div className="min-h-[22px]">
          {member.top_holdings?.length ? <TopLogos holdings={member.top_holdings} tab="congress" /> : <span className="text-[12px] text-ink-3">No priced holdings</span>}
        </div>
        <div className="mt-auto text-[12px]"><FiledLine member={member} /></div>
      </div>
    </div>
  )
}
