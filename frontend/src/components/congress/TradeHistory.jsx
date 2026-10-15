import { Link } from 'react-router-dom'

import { fmtRange, tradeLabel } from '../../lib/congress'
import { fmtDate } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader, Td, Th, Tr } from '../ui'

const OWNERS = { self: 'Member', SP: 'Spouse', JT: 'Joint', DC: 'Child' }

export default function TradeHistory({ trades }) {
  return (
    <Card padding={false}>
      <div className="p-4 pb-3">
        <CardHeader title="Disclosed trades" subtitle="As filed with the House Clerk. Amounts are the reported range." />
      </div>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-[var(--fig-sm)]">
          <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
            <tr>
              <Th edge>Asset</Th>
              <Th>Trade</Th>
              <Th>Owner</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Traded</Th>
              <Th edge align="right">Filed</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => (
              <Tr key={`${trade.filed_on}-${trade.traded_on}-${trade.asset}-${index}`}>
                <Td edge>
                  {trade.ticker && trade.priceable ? (
                    <Link to={researchHref(trade.ticker, 'congress')} className="font-mono text-zinc-100 hover:text-blue-300">{trade.ticker}</Link>
                  ) : (
                    <span className="text-zinc-400">{trade.asset}</span>
                  )}
                </Td>
                <Td className="text-zinc-300">{tradeLabel(trade)}</Td>
                <Td className="text-zinc-400">{OWNERS[trade.owner] ?? trade.owner}</Td>
                <Td align="right" className="num font-mono text-zinc-300">{fmtRange(trade.amount_low, trade.amount_high)}</Td>
                <Td align="right" className="num text-zinc-400">{fmtDate(trade.traded_on)}</Td>
                <Td edge align="right" className="num text-zinc-400">{fmtDate(trade.filed_on)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
