import { useNavigate } from 'react-router-dom'

import { Th, Td, Tr } from '../ui'
import { fmtPct, fmtNum } from '../../lib/format'
import { fmtUsdCompact } from '../../lib/investors'
import { researchHref } from '../../lib/research'
import TickerInitial from '../discover/TickerInitial'
import ChangeBadge from './ChangeBadge'
import OptionBadge from './OptionBadge'
import YouBadge from './YouBadge'
import WeightBar from './WeightBar'

export default function HoldingsTable({ holdings, showChange = true }) {
  const navigate = useNavigate()
  const max = Math.max(0, ...holdings.map((h) => h.weight))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
        <thead className="text-[var(--fig-xs)] text-zinc-500 font-medium uppercase tracking-wider">
          <tr className="border-b border-white/[0.06]">
            <Th edge>Holding</Th>
            <Th align="right">% of portfolio</Th>
            <Th align="right">Value</Th>
            <Th align="right">Shares</Th>
            {showChange && <Th>Change</Th>}
            <Th>Held</Th>
            <Th edge>You</Th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const isResolved = Boolean(h.ticker)
            const handleRowClick = () => {
              if (isResolved) {
                navigate(researchHref(h.ticker, 'overview'))
              }
            }

            return (
              <Tr
                key={`${h.cusip}-${h.put_call}`}
                className={isResolved ? 'cursor-pointer' : ''}
                onClick={handleRowClick}
              >
                <Td edge>
                  {isResolved ? (
                    <a
                      href={researchHref(h.ticker, 'overview')}
                      onClick={(e) => e.stopPropagation()}
                      className="text-blue-400 hover:text-blue-300"
                    >
                      <div className="flex items-center gap-2">
                        <TickerInitial ticker={h.ticker} />
                        {h.ticker}
                      </div>
                    </a>
                  ) : (
                    <span className="text-zinc-400">{h.issuer}</span>
                  )}
                </Td>
                <Td align="right">
                  <div className="flex flex-col items-end gap-1">
                    <span>{fmtPct(h.weight, { sign: false, decimals: 1 })}</span>
                    <WeightBar weight={h.weight} max={max} />
                  </div>
                </Td>
                <Td align="right">{fmtUsdCompact(h.value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">
                  {fmtNum(h.shares)}
                </Td>
                {showChange && (
                  <Td>
                    <ChangeBadge change={h.change} pct={h.shares_change_pct} />
                  </Td>
                )}
                <Td className="num font-mono text-zinc-400">{`${h.quarters_held}q`}</Td>
                <Td edge>
                  <YouBadge owned={h.owned} watched={h.watched} />
                  {h.put_call && <OptionBadge putCall={h.put_call} />}
                </Td>
              </Tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
