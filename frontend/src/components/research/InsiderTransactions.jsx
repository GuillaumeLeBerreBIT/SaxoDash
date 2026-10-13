import { useState } from 'react'

import { fmtAxisDollars } from '../../lib/axisFormat'
import { UNKNOWN, fmtDate, fmtMoney, fmtNum } from '../../lib/format'
import { filterTransactions, insiderName, transactionLabel } from '../../lib/insiders'
import { TBtn } from '../ui'

const VISIBLE = 15
const SCOPES = [
  ['open', 'Open market'],
  ['all', 'All'],
]

const signedShares = (shares) => `${shares > 0 ? '+' : ''}${fmtNum(shares)}`
const shareTone = (shares) => (shares > 0 ? 'text-emerald-400' : shares < 0 ? 'text-red-400' : 'text-zinc-300')
const fmtValue = (value) => (value == null ? UNKNOWN : value >= 1e6 ? fmtAxisDollars(value) : fmtMoney(value, 'USD', { decimals: 0 }))

const HEADERS = [
  ['Date', 'left'],
  ['Insider', 'left'],
  ['Type', 'left'],
  ['Shares', 'right'],
  ['Price', 'right'],
  ['Value', 'right'],
  ['Holding after', 'right'],
]

export default function InsiderTransactions({ transactions }) {
  const [scope, setScope] = useState('open')
  const [expanded, setExpanded] = useState(false)
  const rows = filterTransactions(transactions, scope)
  const shown = expanded ? rows : rows.slice(0, VISIBLE)

  return (
    <div>
      <div className="flex items-center gap-0.5">
        {SCOPES.map(([key, label]) => (
          <TBtn key={key} active={scope === key} onClick={() => setScope(key)}>
            {label}
          </TBtn>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="mt-3 text-[var(--fig-xs)] text-zinc-500">
          {scope === 'open' ? 'No open-market trades in this period.' : 'No transactions in this period.'}
        </p>
      ) : (
        <>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full border-collapse text-[var(--fig-xs)]">
              <thead>
                <tr className="text-zinc-500">
                  {HEADERS.map(([label, align]) => (
                    <th key={label} scope="col" className={`font-medium py-2 px-2 whitespace-nowrap text-${align}`}>
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {shown.map((row, index) => (
                  <tr key={`${row.date}-${row.name}-${row.code}-${index}`} className="border-t border-white/[0.06]">
                    <td className="py-2 px-2 whitespace-nowrap text-zinc-300">{fmtDate(row.date)}</td>
                    <td className="py-2 px-2 text-zinc-100">{insiderName(row.name)}</td>
                    <td className="py-2 px-2 whitespace-nowrap text-zinc-300">{transactionLabel(row.code)}</td>
                    <td className={`py-2 px-2 text-right num font-mono ${shareTone(row.shares)}`}>{signedShares(row.shares)}</td>
                    <td className="py-2 px-2 text-right num font-mono text-zinc-300">
                      {row.price == null ? UNKNOWN : fmtMoney(row.price, 'USD')}
                    </td>
                    <td className="py-2 px-2 text-right num font-mono text-zinc-300">{fmtValue(row.value)}</td>
                    <td className="py-2 px-2 text-right num font-mono text-zinc-400">{fmtNum(row.holdings)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!expanded && rows.length > VISIBLE && (
            <div className="mt-3">
              <TBtn onClick={() => setExpanded(true)}>{`Show all ${rows.length}`}</TBtn>
            </div>
          )}
        </>
      )}
    </div>
  )
}
