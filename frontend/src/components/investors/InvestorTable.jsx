import { Link } from 'react-router-dom'

import { Card, Td, Th, Tr } from '../ui'
import FollowButton from './FollowButton'
import { LatestLine, TopLogos } from './InvestorCard'
import StyleChips from './StyleChips'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtCount, fmtUsdCompact } from '../../lib/investors'

export default function InvestorTable({ investors }) {
  return (
    <Card padding={false}>
      <div className="relative overflow-x-auto">
        <table className="w-full min-w-[860px] text-[var(--fig-sm)]">
          <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
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
                  <Link to={`/investors/${c.slug}`} className="block rounded focus-visible:outline-2 focus-visible:outline-blue-500">
                    <div className="font-medium text-zinc-100">{c.name}</div>
                    <div className="text-[var(--fig-xs)] text-zinc-500">{c.firm}</div>
                  </Link>
                </Td>
                <Td><StyleChips styles={c.styles} /></Td>
                <Td align="right" className="num font-mono text-zinc-200">{fmtUsdCompact(c.total_value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">{c.positions == null ? UNKNOWN : fmtNum(c.positions)}</Td>
                <Td><TopLogos holdings={c.top_holdings} /></Td>
                <Td align="right" className="num font-mono text-zinc-400">{fmtPct(c.top10_weight, { sign: false, decimals: 1 })}</Td>
                <Td className="num font-mono text-zinc-400">{c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')} · ${fmtCount(c.exited_count, '−')}`}</Td>
                <Td className="text-[var(--fig-xs)]"><LatestLine investor={c} /></Td>
                <Td edge align="right"><FollowButton investor={c} /></Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
