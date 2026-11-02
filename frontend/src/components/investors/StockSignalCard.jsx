import { Link } from 'react-router-dom'

import StockLogo from '../StockLogo'
import InvestorAvatar from './InvestorAvatar'
import { signalSentence, stockLabel } from '../../lib/investorHub'

function Faces({ investors }) {
  return (
    <span className="flex -space-x-1.5" aria-label={`Held by ${investors.map((i) => i.name).join(', ')}`}>
      {investors.map((investor) => <InvestorAvatar key={investor.slug} name={investor.name} photo={investor.photo_url} logo={investor.logo_url} size={22} className="ring-2 ring-tile" />)}
    </span>
  )
}

function Title({ item }) {
  const label = stockLabel(item)
  const className = `block truncate text-[14px] ${item.ticker ? 'font-bold' : 'font-semibold'} text-ink`
  if (!item.ticker) return <span className={className}>{label}</span>
  return (
    <Link
      to={`/research?symbol=${encodeURIComponent(item.ticker)}`}
      className={`${className} after:absolute after:inset-0 after:rounded-[10px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus`}
    >
      {label}
    </Link>
  )
}

export default function StockSignalCard({ shelfKey, item, className = '' }) {
  return (
    <div className={`relative h-full flex flex-col gap-2 bg-tile rounded-[10px] px-3.5 py-3 ${item.ticker ? 'hover:bg-hover transition-colors' : ''} ${className}`}>
      <div className="flex items-center gap-2.5 min-w-0">
        <StockLogo ticker={item.ticker} label={stockLabel(item)} size={28} />
        <div className="min-w-0">
          <Title item={item} />
          {item.ticker ? <div className="text-[12px] text-ink-3 truncate">{item.issuer}</div> : null}
        </div>
      </div>
      <div className="text-[13px] text-ink-2 num">{signalSentence(shelfKey, item)}</div>
      <div className="mt-auto flex items-center justify-between gap-2">
        <Faces investors={item.investors} />
        {item.sector ? <span className="text-[12px] text-ink-3 truncate">{item.sector}</span> : null}
      </div>
    </div>
  )
}
