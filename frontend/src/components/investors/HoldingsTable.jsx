import { Link, useNavigate } from 'react-router-dom'

import { InstrumentLogo, Td, Th, Tr } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import ChangeBadge from './ChangeBadge'
import WeightBar from './WeightBar'
import { OptionBadge, YouBadge } from './HoldingBadges'
import { fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact, holdingLabel } from '../../lib/investors'
import { researchHref } from '../../lib/research'

export default function HoldingsTable({ holdings, showChange = true, maxWeight }) {
  const navigate = useNavigate()
  const max = maxWeight ?? Math.max(0, ...holdings.map((h) => h.weight))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
        <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
          <tr>
            <Th edge>Holding</Th>
            <Th align="right">% of portfolio</Th>
            <Th align="right">Value</Th>
            <Th align="right">Shares</Th>
            {showChange && <Th>Change</Th>}
            <Th align="right">Held</Th>
            <Th edge>You</Th>
          </tr>
        </thead>
        <tbody>
          {holdings.map((h) => {
            const href = h.ticker ? researchHref(h.ticker, 'overview') : null
            return (
              <Tr
                key={`${h.cusip}-${h.put_call}`}
                className={href ? 'cursor-pointer' : ''}
                onClick={href ? () => navigate(href) : undefined}
              >
                <Td edge>
                  <div className="flex items-center gap-2.5">
                    <InstrumentLogo
                      symbol={h.ticker}
                      size={24}
                      className="rounded"
                      fallback={<TickerInitial ticker={h.ticker ?? h.issuer} size={24} />}
                    />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {href ? (
                          <Link
                            to={href}
                            onClick={(e) => e.stopPropagation()}
                            className="font-mono font-semibold text-zinc-100 hover:text-blue-300"
                          >
                            {h.ticker}
                          </Link>
                        ) : (
                          <span className="text-zinc-200">{holdingLabel(h)}</span>
                        )}
                        <OptionBadge putCall={h.put_call} />
                      </div>
                      {h.ticker && <div className="text-[var(--fig-xs)] text-zinc-500 truncate max-w-[260px]">{h.issuer}</div>}
                    </div>
                  </div>
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="num font-mono text-zinc-200">{fmtPct(h.weight, { sign: false, decimals: 1 })}</span>
                    <WeightBar weight={h.weight} max={max} className="w-16" />
                  </div>
                </Td>
                <Td align="right" className="num font-mono text-zinc-300">{fmtUsdCompact(h.value)}</Td>
                <Td align="right" className="num font-mono text-zinc-400">{fmtNum(h.shares)}</Td>
                {showChange && <Td><ChangeBadge change={h.change} pct={h.shares_change_pct} /></Td>}
                <Td align="right" className="num font-mono text-zinc-400">{`${h.quarters_held}q`}</Td>
                <Td edge><YouBadge owned={h.owned} watched={h.watched} /></Td>
              </Tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
