import { Link } from 'react-router-dom'

import { partyLabel } from '../../lib/congress'
import { fmtNum } from '../../lib/format'
import { points } from '../../lib/investors'
import { SortableTh, Td, Th, Tr } from '../ui'
import { TopLogos } from '../investors/InvestorCard'
import { FiledLine } from './CongressCard'
import InvestorAvatar from '../investors/InvestorAvatar'

const DIRECTIONS = { name: 'asc', edge: 'desc', trades: 'desc', filed: 'desc' }

export default function CongressTable({ members, sort, onSort }) {
  const active = { key: sort, direction: DIRECTIONS[sort] }
  return (
    <div className="overflow-x-auto -mx-[18px]">
      <table className="w-full min-w-[720px]">
        <thead>
          <tr>
            <SortableTh edge sortKey="name" sort={active} onSort={onSort}>Member</SortableTh>
            <Th>Party</Th>
            <Th>Top holdings</Th>
            <SortableTh align="right" sortKey="trades" sort={active} onSort={onSort}>Trades</SortableTh>
            <SortableTh align="right" sortKey="filed" sort={active} onSort={onSort}>Last filed</SortableTh>
            <SortableTh edge align="right" sortKey="edge" sort={active} onSort={onSort}>Copy edge / yr</SortableTh>
          </tr>
        </thead>
        <tbody>
          {members.map((member) => (
            <Tr key={member.slug}>
              <Td edge>
                <span className="flex items-center gap-2.5">
                  <InvestorAvatar name={member.name} photo={member.photo_url} size={28} />
                  <Link to={`/investors/congress/${member.slug}`} className="font-semibold text-ink hover:underline">{member.name}</Link>
                </span>
              </Td>
              <Td className="text-ink-2">{partyLabel(member.party, member.state_district)}</Td>
              <Td><TopLogos holdings={member.top_holdings ?? []} tab="congress" /></Td>
              <Td align="right" className="text-ink-2">{fmtNum(member.trades)}</Td>
              <Td align="right" className="text-[12px]"><FiledLine member={member} /></Td>
              <Td edge align="right" className="font-semibold text-ink">{points(member.excess_cagr_pct)}</Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
