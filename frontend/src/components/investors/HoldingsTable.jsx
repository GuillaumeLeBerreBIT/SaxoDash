import { Link, useNavigate } from 'react-router-dom'

import StockLogo from '../StockLogo'
import { Td, Th, Tr } from '../ui'
import ChangeBadge from './ChangeBadge'
import WeightBar from './WeightBar'
import { EarlierCusipBadge, OptionBadge, YouBadge } from './HoldingBadges'
import { fmtNum, fmtPct } from '../../lib/format'
import { fmtUsdCompact, holdingLabel } from '../../lib/investors'
import { researchHref } from '../../lib/research'

export default function HoldingsTable({ holdings, showChange = true, maxWeight }) {
  const navigate = useNavigate()
  const max = maxWeight ?? Math.max(0, ...holdings.map((h) => h.weight))

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[720px]">
        <thead>
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
                    <StockLogo ticker={h.ticker} label={h.issuer} size={28} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {href ? (
                          <Link
                            to={href}
                            onClick={(e) => e.stopPropagation()}
                            className="font-bold text-ink hover:underline"
                          >
                            {h.ticker}
                          </Link>
                        ) : (
                          <span className="font-semibold text-ink">{holdingLabel(h)}</span>
                        )}
                        <OptionBadge putCall={h.put_call} />
                        <EarlierCusipBadge inherited={h.ticker_inherited} />
                      </div>
                      {h.ticker && <div className="text-[12px] text-ink-3 truncate max-w-[260px]">{h.issuer}</div>}
                    </div>
                  </div>
                </Td>
                <Td align="right">
                  <div className="flex items-center justify-end gap-2">
                    <span className="num text-ink">{fmtPct(h.weight, { sign: false, decimals: 1 })}</span>
                    <WeightBar weight={h.weight} max={max} className="w-16" />
                  </div>
                </Td>
                <Td align="right" className="text-ink">{fmtUsdCompact(h.value)}</Td>
                <Td align="right" className="text-ink-2">{fmtNum(h.shares)}</Td>
                {showChange && <Td><ChangeBadge change={h.change} pct={h.shares_change_pct} /></Td>}
                <Td align="right" className="text-ink-2">{`${h.quarters_held}q`}</Td>
                <Td edge><YouBadge owned={h.owned} watched={h.watched} /></Td>
              </Tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
