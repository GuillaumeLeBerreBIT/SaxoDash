import { Link } from 'react-router-dom'

import { balanceLabel, fundBalance } from '../../lib/ownership'
import { researchHref } from '../../lib/research'

export default function FundBalance({ ticker, stock, quarter }) {
  const balance = fundBalance(stock)
  if (!balance) return <span className="text-zinc-600">—</span>
  const label = balanceLabel(balance, quarter)
  return (
    <Link
      to={researchHref(ticker, 'funds')}
      aria-label={label}
      title={label}
      className="inline-flex items-center gap-2 num font-mono text-zinc-300 hover:text-blue-300"
    >
      <span>{`▲\u00a0${balance.buying}`}</span>
      <span className="text-zinc-400">{`▼\u00a0${balance.selling}`}</span>
    </Link>
  )
}
