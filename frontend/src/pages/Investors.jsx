import { useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import { useInvestors } from '../api/queries'
import { Alert, Button, EmptyState, PageHeader, Skeleton } from '../components/ui'
import InvestorCards from '../components/investors/InvestorCards'
import InvestorTable from '../components/investors/InvestorTable'
import InvestorToolbar from '../components/investors/InvestorToolbar'
import LimitsNote from '../components/investors/LimitsNote'
import SnapshotPanel from '../components/investors/SnapshotPanel'
import { CARD_LIMIT, latestQuarter, looksLikeTicker, quarterLabel, visibleInvestors } from '../lib/investors'
import { useDebouncedValue } from '../lib/useDebouncedValue'

const DEFAULT_INVESTOR = 'berkshire-hathaway'

export default function Investors() {
  const [params, setParams] = useSearchParams()
  const [group, setGroup] = useState('all')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('value')
  const [layout, setLayout] = useState('cards')
  const [showAll, setShowAll] = useState(false)

  const { data: cards = [], isLoading, error } = useInvestors()
  const debounced = useDebouncedValue(query.trim())
  const holds = looksLikeTicker(debounced) ? debounced.toUpperCase() : ''
  const { data: holders = [], isFetching: holdersFetching } = useInvestors({ holds })

  const visible = useMemo(
    () => visibleInvestors(cards, { group, query, sort, holderSlugs: new Set(holds ? holders.map((h) => h.slug) : []) }),
    [cards, group, query, sort, holds, holders],
  )

  const fallback = cards.some((c) => c.slug === DEFAULT_INVESTOR) ? DEFAULT_INVESTOR : visible[0]?.slug
  const selected = params.get('investor') ?? fallback
  const select = (slug) => setParams({ investor: slug }, { replace: true })

  const searching = query.trim() !== ''
  const resolving = looksLikeTicker(query) && (debounced !== query.trim() || (holds !== '' && holdersFetching))
  const shown = showAll || searching ? visible : visible.slice(0, CARD_LIMIT)
  const latest = latestQuarter(cards)

  if (error) return <Alert>Could not load investors. {error.message}</Alert>

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Investors"
        subtitle={`13F holdings of ${cards.length} tracked managers · latest quarter ${quarterLabel(latest)} · filings arrive up to 45 days after quarter end`}
      />
      <InvestorToolbar
        group={group}
        onGroup={(g) => { setGroup(g); setShowAll(false) }}
        query={query}
        onQuery={setQuery}
        sort={sort}
        onSort={setSort}
        layout={layout}
        onLayout={setLayout}
      />
      {isLoading || (visible.length === 0 && resolving) ? (
        <Skeleton className="h-40" />
      ) : visible.length === 0 && searching ? (
        <EmptyState title={`No tracked investor matches “${query}”.`} hint="Try a manager, a firm or a ticker they hold." />
      ) : visible.length === 0 ? (
        <EmptyState title="No investors in this group." />
      ) : layout === 'table' ? (
        <InvestorTable investors={visible} selected={selected} onSelect={select} />
      ) : (
        <>
          <InvestorCards investors={shown} selected={selected} onSelect={select} />
          {shown.length < visible.length && (
            <div className="flex items-center justify-between gap-3 text-[var(--fig-xs)] text-zinc-500">
              <span>{`Showing ${shown.length} of ${visible.length}`}</span>
              <Button size="sm" onClick={() => setShowAll(true)}>{`Show all ${visible.length}`}</Button>
            </div>
          )}
        </>
      )}
      {selected && <SnapshotPanel slug={selected} />}
      <LimitsNote />
    </div>
  )
}
