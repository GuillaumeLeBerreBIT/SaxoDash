import { Link } from 'react-router-dom'

import { fmtRange, tradeLabel } from '../../lib/congress'
import { fmtDate } from '../../lib/format'
import { researchHref } from '../../lib/research'
import StockLogo from '../StockLogo'
import { Card, Tag, Td, Th, Tr } from '../ui'

const OWNERS = { self: 'Member', SP: 'Spouse', JT: 'Joint', DC: 'Child' }

export default function TradeHistory({
  trades,
  title = 'Disclosed trades',
  subtitle = 'As filed with the House Clerk. Amounts are the reported range.',
  showAsset = true,
}) {
  return (
    <Card flush context={subtitle} title={title}>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px]">
          <thead>
            <tr>
              {showAsset ? <Th edge>Asset</Th> : null}
              <Th edge={!showAsset}>Trade</Th>
              <Th>Owner</Th>
              <Th align="right">Amount</Th>
              <Th align="right">Traded</Th>
              <Th edge align="right">Filed</Th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade, index) => (
              <Tr key={`${trade.filed_on}-${trade.traded_on}-${trade.asset}-${index}`}>
                {showAsset ? (
                  <Td edge>
                    {trade.ticker && trade.priceable ? (
                      <Link to={researchHref(trade.ticker, 'congress')} className="inline-flex items-center gap-2.5 font-bold text-ink hover:underline">
                        <StockLogo ticker={trade.ticker} size={28} />
                        {trade.ticker}
                      </Link>
                    ) : (
                      <span className="flex items-center gap-2.5 min-w-0">
                        <StockLogo label={trade.asset} size={28} />
                        <span className="block max-w-[22rem] truncate text-ink-2" title={trade.asset}>{trade.asset}</span>
                      </span>
                    )}
                  </Td>
                ) : null}
                <Td edge={!showAsset} className="font-semibold text-ink">
                  {tradeLabel(trade)}
                  {trade.amended ? <Tag tone="neutral" className="ml-2">Amended</Tag> : null}
                </Td>
                <Td className="text-ink-2">{OWNERS[trade.owner] ?? trade.owner}</Td>
                <Td align="right" className="text-ink">{fmtRange(trade.amount_low, trade.amount_high)}</Td>
                <Td align="right" className="text-ink-2">{fmtDate(trade.traded_on)}</Td>
                <Td edge align="right" className="text-ink-2">{fmtDate(trade.filed_on)}</Td>
              </Tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
