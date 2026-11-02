import { Link } from 'react-router-dom'

import { Td, Th, Tr } from '../ui'
import FollowButton from './FollowButton'
import { LatestLine, TopLogos } from './InvestorCard'
import InvestorAvatar from './InvestorAvatar'
import StyleChips from './StyleChips'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtCount, fmtUsdCompact } from '../../lib/investors'

export default function InvestorTable({ investors }) {
  return (
    <div className="relative overflow-x-auto -mx-[18px]">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr>
            <Th edge>Investor</Th>
            <Th>Style</Th>
            <Th align="right">Value</Th>
            <Th align="right">Positions</Th>
            <Th>Top 3</Th>
            <Th align="right">Top 10</Th>
            <Th>vs prev. quarter</Th>
            <Th>Latest</Th>
            <Th edge align="right"><span className="sr-only">Follow</span></Th>
          </tr>
        </thead>
        <tbody>
          {investors.map((c) => (
            <Tr key={c.slug}>
              <Td edge>
                <Link to={`/investors/${c.slug}`} className="flex items-center gap-2.5 rounded focus-visible:outline-2 focus-visible:outline-focus">
                  <InvestorAvatar name={c.name} photo={c.photo_url} logo={c.logo_url} size={28} />
                  <span className="min-w-0">
                    <span className="block font-semibold text-ink">{c.name}</span>
                    {c.firm !== c.name ? <span className="block text-[12px] text-ink-3">{c.firm}</span> : null}
                  </span>
                </Link>
              </Td>
              <Td><StyleChips styles={c.styles} /></Td>
              <Td align="right" className="text-ink">{fmtUsdCompact(c.total_value)}</Td>
              <Td align="right" className="text-ink-2">{c.positions == null ? UNKNOWN : fmtNum(c.positions)}</Td>
              <Td><TopLogos holdings={c.top_holdings} /></Td>
              <Td align="right" className="text-ink-2">{fmtPct(c.top10_weight, { sign: false, decimals: 1 })}</Td>
              <Td className="num text-ink-2">{c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')} · ${fmtCount(c.exited_count, '−')}`}</Td>
              <Td className="text-[12px]"><LatestLine investor={c} /></Td>
              <Td edge align="right"><FollowButton investor={c} /></Td>
            </Tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
