import { Link } from 'react-router-dom'

import { Card, InstrumentLogo } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import InvestorAvatar from './InvestorAvatar'
import { signalSentence, stockLabel } from '../../lib/investorHub'

function Faces({ investors }) {
  return (
    <span className="flex -space-x-1.5" aria-label={`Held by ${investors.map((i) => i.name).join(', ')}`}>
      {investors.map((investor) => <InvestorAvatar key={investor.slug} name={investor.name} size={22} className="ring-2 ring-zinc-900" />)}
    </span>
  )
}

function Title({ item }) {
  const label = stockLabel(item)
  const className = `block truncate ${item.ticker ? 'font-mono font-semibold' : 'font-medium'} text-zinc-100`
  if (!item.ticker) return <span className={className}>{label}</span>
  return (
    <Link to={`/research?symbol=${encodeURIComponent(item.ticker)}`} className={`${className} after:absolute after:inset-0 after:rounded-lg`}>
      {label}
    </Link>
  )
}

export default function StockSignalCard({ shelfKey, item, className = '' }) {
  return (
    <Card interactive={Boolean(item.ticker)} className={`relative h-full flex flex-col gap-2 ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <InstrumentLogo symbol={item.ticker} size={28} className="rounded" fallback={<TickerInitial ticker={stockLabel(item)} size={28} />} />
        <div className="min-w-0">
          <Title item={item} />
          {item.ticker ? <div className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.issuer}</div> : null}
        </div>
      </div>
      <div className="text-[var(--fig-sm)] text-zinc-200">{signalSentence(shelfKey, item)}</div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Faces investors={item.investors} />
        {item.sector ? <span className="text-[var(--fig-2xs)] text-zinc-500 truncate">{item.sector}</span> : null}
      </div>
    </Card>
  )
}
