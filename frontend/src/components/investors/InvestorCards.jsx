import { Card, InstrumentLogo, LetterAvatar } from '../ui'
import { ImportProgress } from './SnapshotPanel'
import { UNKNOWN, fmtNum } from '../../lib/format'
import { fmtCount, fmtFiledDate, fmtUsdCompact, quarterLabel } from '../../lib/investors'

export function TopLogos({ holdings }) {
  return (
    <span className="flex -space-x-1.5">
      {holdings.map((h) => (
        <InstrumentLogo
          key={h.cusip}
          symbol={h.ticker}
          size={22}
          className="rounded-full ring-2 ring-zinc-900"
          fallback={<LetterAvatar symbol={h.ticker ?? h.issuer} size={22} />}
        />
      ))}
    </span>
  )
}

const movement = (c) => (c.new_count == null ? UNKNOWN : `${fmtCount(c.new_count, '+')} new · ${fmtCount(c.exited_count, '−')} exited`)

export function LatestLine({ investor }) {
  if (!investor.latest_quarter) return <span className="text-zinc-500">No filings imported yet</span>
  if (investor.stale) return <span className="text-amber-400">{`No 13F since ${quarterLabel(investor.latest_quarter)}`}</span>
  return <span className="text-zinc-500">{`${quarterLabel(investor.latest_quarter)} · filed ${fmtFiledDate(investor.last_filing_at)}`}</span>
}

export default function InvestorCards({ investors, selected, onSelect }) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-2.5">
      {investors.map((c) => (
        <button
          key={c.slug}
          type="button"
          data-testid="investor-card"
          aria-pressed={c.slug === selected}
          onClick={() => onSelect(c.slug)}
          className="text-left rounded-lg focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          <Card interactive className={`h-full flex flex-col gap-2 ${c.slug === selected ? 'border-blue-500/60 bg-blue-500/[0.06]' : ''}`}>
            <div>
              <div className="text-[var(--fig-sm)] font-medium text-zinc-100">{c.name}</div>
              <div className="text-[var(--fig-xs)] text-zinc-500 truncate">{c.firm}</div>
            </div>
            <ImportProgress progress={c.import} />
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[var(--fig-md)] num font-mono text-zinc-50">{fmtUsdCompact(c.total_value)}</span>
              <span className="text-[var(--fig-xs)] num font-mono text-zinc-500">{c.positions == null ? UNKNOWN : `${fmtNum(c.positions)} pos`}</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-[var(--fig-xs)]">
              <TopLogos holdings={c.top_holdings} />
              <span className="num font-mono text-zinc-400">{movement(c)}</span>
            </div>
            <div className="text-[var(--fig-xs)]"><LatestLine investor={c} /></div>
          </Card>
        </button>
      ))}
    </div>
  )
}
