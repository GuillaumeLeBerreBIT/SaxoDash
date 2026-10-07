import { useState } from 'react'

import { Button, EmptyState, Input, TBtn } from '../ui'
import HoldingsTable from './HoldingsTable'
import { COMPARING_FILTERS, HOLDING_FILTERS, PAGE_SIZE, PAGE_STEP, filterHoldings } from '../../lib/investors'

export default function HoldingsTab({ detail }) {
  const [filter, setFilter] = useState('all')
  const [query, setQuery] = useState('')
  const [count, setCount] = useState(PAGE_SIZE)

  const filters = HOLDING_FILTERS.filter(([key]) => detail.previous_quarter != null || !COMPARING_FILTERS.has(key))
  const matching = filterHoldings(detail.holdings, { filter, query })
  const shown = matching.slice(0, count)
  const next = Math.min(PAGE_STEP, matching.length - shown.length)

  const choose = (key) => { setFilter(key); setCount(PAGE_SIZE) }
  const search = (value) => { setQuery(value); setCount(PAGE_SIZE) }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div role="group" aria-label="Filter holdings" className="flex items-center gap-0.5 flex-wrap">
          {filters.map(([key, label]) => (
            <TBtn key={key} active={filter === key} onClick={() => choose(key)}>{label}</TBtn>
          ))}
        </div>
        <Input
          type="search"
          aria-label="Search holdings"
          placeholder="Search ticker or name"
          value={query}
          onChange={(e) => search(e.target.value)}
          className="w-56"
        />
      </div>
      {matching.length === 0 ? (
        <EmptyState title="No holding matches this filter." />
      ) : (
        <HoldingsTable holdings={shown} showChange={detail.previous_quarter != null} maxWeight={detail.holdings[0]?.weight} />
      )}
      {matching.length > 0 && (
        <div className="flex items-center justify-between gap-3 text-[var(--fig-xs)] text-zinc-500">
          <span>{`Showing ${shown.length} of ${matching.length}`}</span>
          {next > 0 && <Button size="sm" onClick={() => setCount(count + PAGE_STEP)}>{`Show ${next} more`}</Button>}
        </div>
      )}
    </div>
  )
}
