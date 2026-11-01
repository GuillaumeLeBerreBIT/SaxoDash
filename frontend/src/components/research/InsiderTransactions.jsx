import { useState } from 'react'

import { fmtStatement } from '../../lib/statements'
import { UNKNOWN, fmtDate, fmtMoney, fmtNum } from '../../lib/format'
import { filterTransactions, insiderName, transactionLabel } from '../../lib/insiders'
import { Button, Segmented, Td, Tr } from '../ui'

const VISIBLE = 15
const SCOPES = [
  { value: 'open', label: 'Open market' },
  { value: 'all', label: 'All' },
]

const fmtTradeValue = (value) => (value == null ? UNKNOWN : `$${fmtStatement(value)}`)
const signedShares = (shares) => `${shares > 0 ? '+' : ''}${fmtNum(shares)}`
const shareTone = (shares) => (shares > 0 ? 'text-up' : shares < 0 ? 'text-down' : 'text-ink')

const HEADERS = [
  ['Date', 'left'],
  ['Insider', 'left'],
  ['Type', 'left'],
  ['Shares', 'right'],
  ['Price', 'right'],
  ['Value', 'right'],
  ['Holding after', 'right'],
]

export default function InsiderTransactions({ transactions, counts }) {
  const [scope, setScope] = useState('open')
  const [expanded, setExpanded] = useState(false)
  const rows = filterTransactions(transactions, scope)
  const shown = expanded ? rows : rows.slice(0, VISIBLE)
  const atSource = counts ? (scope === 'open' ? counts.open_market : counts.open_market + counts.other) : rows.length

  return (
    <div>
      <Segmented label="Transactions shown" options={SCOPES} value={scope} onChange={setScope} />
      {rows.length === 0 ? (
        <p className="mt-3 text-[13px] text-ink-3">
          {scope === 'open' ? 'No open-market trades in this period.' : 'No transactions in this period.'}
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table aria-label="Insider transactions" className="w-full border-collapse">
              <thead>
                <tr>
                  {HEADERS.map(([label, align], index) => (
                    <th
                      key={label}
                      scope="col"
                      className={`h-[30px] px-2.5 text-[12px] font-medium text-ink-3 whitespace-nowrap text-${align} ${
                        index === 0 ? 'pl-0' : index === HEADERS.length - 1 ? 'pr-0' : ''
                      }`}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, index) => (
                  <Tr key={`${row.date}-${row.name}-${row.code}-${index}`}>
                    <Td className="pl-0 num text-ink-2">{fmtDate(row.date)}</Td>
                    <Td className="whitespace-normal font-semibold text-ink">{insiderName(row.name)}</Td>
                    <Td className="text-ink-2">{transactionLabel(row.code)}</Td>
                    <Td align="right" className={shareTone(row.shares)}>{signedShares(row.shares)}</Td>
                    <Td align="right" className="text-ink">{row.price == null ? UNKNOWN : fmtMoney(row.price, 'USD')}</Td>
                    <Td align="right" className="text-ink">{fmtTradeValue(row.value)}</Td>
                    <Td align="right" className="pr-0 text-ink-2">{fmtNum(row.holdings)}</Td>
                  </Tr>
                ))}
              </tbody>
            </table>
          </div>
          {atSource > rows.length && (
            <p className="mt-2 text-[12px] text-ink-3">{`Showing the newest ${rows.length} of ${atSource}.`}</p>
          )}
          {!expanded && rows.length > VISIBLE && (
            <div className="mt-3">
              <Button size="sm" onClick={() => setExpanded(true)}>{`Show all ${rows.length}`}</Button>
            </div>
          )}
        </>
      )}
    </div>
  )
}
