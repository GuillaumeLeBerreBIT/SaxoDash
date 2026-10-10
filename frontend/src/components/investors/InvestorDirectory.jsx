import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useSearchParams } from 'react-router-dom'

import { useInvestors } from '../../api/queries'
import { Alert, EmptyState, Input, Select, Skeleton, TBtn } from '../ui'
import InvestorCards from './InvestorCards'
import InvestorTable from './InvestorTable'
import { directoryChips, directoryInvestors } from '../../lib/investorHub'
import { INVESTOR_SORTS, looksLikeTicker } from '../../lib/investors'
import { useDebouncedValue } from '../../lib/useDebouncedValue'

const DEFAULTS = { chip: 'all', sort: 'value', layout: 'cards' }
const HEADING_ID = 'investor-directory-heading'

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

function useScrollToHash(ref, hash) {
  const location = useLocation()
  useEffect(() => {
    if (location.hash === hash) ref.current?.scrollIntoView?.({ block: 'start' })
  }, [location.hash, location.key, hash, ref])
}

function Results({ visible, layout, query, searching, waiting }) {
  if (waiting) return <Skeleton className="h-40" />
  if (visible.length === 0 && searching) {
    return <EmptyState title={`No tracked investor matches “${query}”.`} hint="Try a manager, a firm or a ticker they hold." />
  }
  if (visible.length === 0) return <EmptyState title="No investors in this group." />
  return layout === 'table' ? <InvestorTable investors={visible} /> : <InvestorCards investors={visible} />
}

export default function InvestorDirectory({ cards, isLoading, error }) {
  const ref = useRef(null)
  const [read, write] = useDirectoryParams()
  const [query, setQuery] = useState('')
  const chip = read('chip')
  const sort = read('sort')
  const layout = read('layout') === 'table' ? 'table' : 'cards'
  useScrollToHash(ref, '#directory')

  const debounced = useDebouncedValue(query.trim())
  const holds = looksLikeTicker(debounced) ? debounced.toUpperCase() : ''
  const { data: holders = [], isFetching: holdersFetching } = useInvestors({ holds })
  const holderSlugs = useMemo(() => new Set(holds ? holders.map((h) => h.slug) : []), [holds, holders])
  const visible = directoryInvestors(cards, { chip, query, sort, holderSlugs })
  const resolving = looksLikeTicker(query) && (debounced !== query.trim() || (holds !== '' && holdersFetching))

  return (
    <section ref={ref} id="directory" aria-labelledby={HEADING_ID} className="scroll-mt-4 flex flex-col gap-3">
      <h2 id={HEADING_ID} className="text-[var(--fig-md)] font-semibold text-zinc-100">All investors</h2>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div role="group" aria-label="Show investors" className="flex items-center gap-0.5 flex-wrap">
          {directoryChips(cards).map(([key, label]) => (
            <TBtn key={key} active={chip === key} onClick={() => write('chip', key)}>{label}</TBtn>
          ))}
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            type="search"
            aria-label="Search investors"
            placeholder="Investor, firm or ticker"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-56"
          />
          <Select aria-label="Sort investors" value={sort} onChange={(e) => write('sort', e.target.value)}>
            {INVESTOR_SORTS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
          </Select>
          <div role="group" aria-label="Investor layout" className="flex items-center gap-0.5">
            <TBtn active={layout === 'cards'} onClick={() => write('layout', 'cards')}>Cards</TBtn>
            <TBtn active={layout === 'table'} onClick={() => write('layout', 'table')}>Table</TBtn>
          </div>
        </div>
      </div>
      {error
        ? <Alert>Could not load investors. {error.message}</Alert>
        : <Results visible={visible} layout={layout} query={query} searching={query.trim() !== ''} waiting={isLoading || (visible.length === 0 && resolving)} />}
    </section>
  )
}
