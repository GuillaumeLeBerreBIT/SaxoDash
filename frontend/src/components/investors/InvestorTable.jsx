import { Card, Td, Th, Tr } from '../ui'
import { LatestLine, TopLogos } from './InvestorCards'
import { UNKNOWN, fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact } from '../../lib/investors'

export default function InvestorTable({ investors, selected, onSelect }) {
  return (
    <Card padding={false}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[760px] text-[var(--fig-sm)]">
          <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
            <tr>
              <Th edge>Investor</Th>
              <Th align="right">Value</Th>
              <Th align="right">Positions</Th>
              <Th>Top 3</Th>
              <Th align="right">Top 10</Th>
              <Th>vs prev. quarter</Th>
              <Th edge>Latest</Th>
            </tr>
          </thead>
          <tbody>
            {investors.map((c) => (
              <Tr key={c.slug} selected={c.slug === selected} className="cursor-pointer" onClick={() => onSelect(c.slug)}>
                <Td edge>
                  <button
                    type="button"
                    aria-pressed={c.slug === selected}
                    onClick={() => onSelect(c.slug)}
                    className="text-left rounded focus-visible:outline-2 focus-visible:outline-blue-500"
                  >
                    <div className="font-medium text-zinc-100">{c.name}</div>
                    <div className="text-[var(--fig-xs)] text-zinc-500">{c.firm}</div>
                  </button>
                </Td>
                <Td align="right" className="num font-mono text-zinc-200">{fmtUsdCompact(c.total_value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">{c.positions == null ? UNKNOWN : fmtNum(c.positions)}</Td>
                <Td><TopLogos holdings={c.top_holdings} /></Td>
                <Td align="right" className="num font-mono text-zinc-400">{fmtPct(c.top10_weight, { sign: false, decimals: 1 })}</Td>
                <Td className="num font-mono text-zinc-400">{c.new_count == null ? UNKNOWN : `+${c.new_count} · −${c.exited_count}`}</Td>
                <Td edge className="text-[var(--fig-xs)]"><LatestLine investor={c} /></Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
