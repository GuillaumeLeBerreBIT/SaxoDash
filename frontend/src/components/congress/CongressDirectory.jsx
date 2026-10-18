import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'

import { useCongressMembers, useCongressOwnership } from '../../api/queries'
import { CONGRESS_CHIPS, CONGRESS_SORTS, directoryMembers } from '../../lib/congress'
import { looksLikeTicker } from '../../lib/investors'
import { researchHref } from '../../lib/research'
import { useDebouncedValue } from '../../lib/useDebouncedValue'
import StockLogo from '../StockLogo'
import { Card, CardHeader, EmptyState, Input, QueryState, Select, Skeleton, TBtn } from '../ui'
import CongressCards from './CongressCards'
import CongressTable from './CongressTable'

const DEFAULTS = { filter: 'all', order: 'edge', layout: 'cards' }
const HEADING_ID = 'congress-directory-heading'

function useDirectoryParams() {
  const [params, setParams] = useSearchParams()
  const read = (key) => params.get(key) ?? DEFAULTS[key]
  const write = (key, value) => {
    const next = new URLSearchParams(params)
    if (value === DEFAULTS[key]) next.delete(key)
    else next.set(key, value)
    setParams(next, { replace: true })
  }
  return [read, write]
}

function MostBought({ items, windowDays }) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader title={`Most bought by Congress, last ${windowDays} days`} subtitle="Distinct members with a purchase or call in reports filed in the window" />
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.ticker}>
            <Link to={researchHref(item.ticker, 'congress')} className="inline-flex items-center gap-2 rounded-md border border-white/[0.06] px-2.5 py-1.5 hover:border-blue-400/40">
              <StockLogo ticker={item.ticker} size={18} />
              <span className="font-mono text-zinc-100">{item.ticker}</span>
              <span className="num text-[var(--fig-xs)] text-zinc-400">{`${item.buyers} ↑ / ${item.sellers} ↓`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

function useTraderSlugs(query) {
  const debounced = useDebouncedValue(query.trim())
  const ticker = looksLikeTicker(debounced) ? debounced.toUpperCase() : ''
  const { data, isFetching } = useCongressOwnership(ticker)
  const slugs = useMemo(() => new Set(ticker ? (data?.members ?? []).map((member) => member.slug) : []), [ticker, data])
  const resolving = looksLikeTicker(query) && (debounced !== query.trim() || (ticker !== '' && isFetching))
  return [slugs, resolving]
}

function Results({ visible, layout, order, onSort, query, waiting }) {
  if (waiting) return <Skeleton className="h-40" />
  if (visible.length === 0 && query.trim()) {
    return <EmptyState title={`No member matches “${query.trim()}”.`} hint="Try a name, a state such as CA, a district such as TX02, or a ticker they traded." />
  }
  if (visible.length === 0) return <EmptyState title="No members in this group." />
  return layout === 'table'
    ? <CongressTable members={visible} sort={order} onSort={onSort} />
    : <CongressCards members={visible} />
}

export default function CongressDirectory() {
  const query = useCongressMembers()
  const [read, write] = useDirectoryParams()
  const [search, setSearch] = useState('')
  const [traderSlugs, resolving] = useTraderSlugs(search)
  const filter = read('filter')
  const order = read('order')
  const layout = read('layout') === 'table' ? 'table' : 'cards'
  const members = query.data?.members
  const visible = useMemo(
    () => directoryMembers(members ?? [], { chip: filter, query: search, sort: order, traderSlugs }),
    [members, filter, search, order, traderSlugs],
  )

  if (query.isLoading || query.error) {
    return <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refetch} label="members of Congress" />
  }
  const { most_bought: mostBought = [], window_days: windowDays = 90 } = query.data ?? {}
  if (!members?.length) {
    return <EmptyState title="No House trades imported yet" hint="They load daily from the House Clerk; run backfill_house once to import history." />
  }
  return (
    <div className="flex flex-col gap-6">
      <MostBought items={mostBought} windowDays={windowDays} />
      <section aria-labelledby={HEADING_ID} className="flex flex-col gap-3">
        <h2 id={HEADING_ID} className="text-[var(--fig-md)] font-semibold text-zinc-100">All members</h2>
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div role="group" aria-label="Show members" className="flex items-center gap-0.5 flex-wrap">
            {CONGRESS_CHIPS.map(([key, label]) => (
              <TBtn key={key} active={filter === key} onClick={() => write('filter', key)}>{label}</TBtn>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input
              type="search"
              aria-label="Search members"
              placeholder="Name, state or ticker"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-56"
            />
            <Select aria-label="Sort members" value={order} onChange={(e) => write('order', e.target.value)}>
              {CONGRESS_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
            </Select>
            <div role="group" aria-label="Member layout" className="flex items-center gap-0.5">
              <TBtn active={layout === 'cards'} onClick={() => write('layout', 'cards')}>Cards</TBtn>
              <TBtn active={layout === 'table'} onClick={() => write('layout', 'table')}>Table</TBtn>
            </div>
          </div>
        </div>
        <Results
          visible={visible}
          layout={layout}
          order={order}
          onSort={(key) => write('order', key)}
          query={search}
          waiting={visible.length === 0 && resolving}
        />
      </section>
    </div>
  )
}
