import { useId } from 'react'

import { useInvestorChanges } from '../../api/queries'
import { Card, EmptyState, InstrumentLogo, QueryState, Skeleton } from '../ui'
import TickerInitial from '../discover/TickerInitial'
import { fmtPct } from '../../lib/format'
import { fmtUsdCompact, holdingLabel } from '../../lib/investors'

const share = (value) => fmtPct(value, { sign: false, decimals: 1 })
const move = (pct) => (pct == null ? '' : `shares ${pct >= 0 ? '▲' : '▼'}${Math.round(Math.abs(pct))}%`)

const DETAILS = {
  new: (i) => `${share(i.weight)} of portfolio`,
  added: (i) => move(i.shares_change_pct),
  trimmed: (i) => move(i.shares_change_pct),
  sold_out: (i) => `was ${share(i.previous_weight)}`,
}

const GROUPS = [['new', 'New'], ['added', 'Added'], ['trimmed', 'Trimmed'], ['sold_out', 'Sold out']]

function Group({ kind, title, items }) {
  const headingId = useId()
  return (
    <Card>
      <section aria-labelledby={headingId}>
        <h3 className="flex items-center gap-2 text-[var(--fig-sm)] font-medium text-zinc-200">
          <span id={headingId}>{title}</span>
          <span className="num font-mono text-zinc-500 font-normal">{items.length}</span>
        </h3>
        <ul className="mt-2 divide-y divide-white/[0.06]">
          {items.length === 0 && <li className="py-2 text-[var(--fig-xs)] text-zinc-500">None</li>}
          {items.map((i) => (
            <li key={`${i.cusip}-${i.put_call}`} className="py-2 flex items-center justify-between gap-3">
              <span className="flex items-center gap-2 min-w-0">
                <InstrumentLogo symbol={i.ticker} size={20} className="rounded" fallback={<TickerInitial ticker={holdingLabel(i)} size={20} />} />
                <span className={`truncate ${i.ticker ? 'font-mono font-semibold text-zinc-100' : 'text-zinc-200'}`}>{holdingLabel(i)}</span>
              </span>
              <span className="flex flex-col items-end shrink-0">
                <span className="num font-mono text-zinc-200 text-[var(--fig-sm)]">{fmtUsdCompact(i.value_change, { sign: true })}</span>
                <span className="text-[var(--fig-2xs)] text-zinc-500">{DETAILS[kind](i)}</span>
              </span>
            </li>
          ))}
        </ul>
      </section>
    </Card>
  )
}

export default function ChangesTab({ slug, quarter }) {
  const { data, isLoading, error, refetch } = useInvestorChanges(slug, quarter)

  if (error) return <QueryState error={error} onRetry={refetch} label="the changes" />
  if (isLoading || !data) return <Skeleton className="h-40" />
  if (!data.previous_quarter) {
    return <EmptyState title="First stored quarter — there is no earlier filing to compare against." />
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[var(--fig-xs)] text-zinc-500">
        Value changes are quarter-end values as filed, so they include price moves; the share change shows what was bought or sold.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 items-start gap-3">
        {GROUPS.map(([kind, title]) => <Group key={kind} kind={kind} title={title} items={data[kind]} />)}
      </div>
    </div>
  )
}
