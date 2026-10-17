import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'

import { useCongressMembers } from '../../api/queries'
import { partyLabel } from '../../lib/congress'
import { fmtDate, fmtNum } from '../../lib/format'
import { points } from '../../lib/investors'
import { researchHref } from '../../lib/research'
import { nextSort, sortRows } from '../../lib/sort'
import { Card, CardHeader, EmptyState, QueryState, SortableTh, Td, Th, Tr } from '../ui'
import InvestorAvatar from '../investors/InvestorAvatar'

const ACCESSORS = { name: (member) => member.name, edge: (member) => member.excess_cagr_pct }
const DEFAULT_SORT = { key: 'edge', direction: 'desc' }

function MostBought({ items, windowDays }) {
  if (items.length === 0) return null
  return (
    <Card>
      <CardHeader title={`Most bought by Congress, last ${windowDays} days`} subtitle="Distinct members with a purchase or call in reports filed in the window" />
      <ul className="mt-3 flex flex-wrap gap-2">
        {items.map((item) => (
          <li key={item.ticker}>
            <Link to={researchHref(item.ticker, 'congress')} className="inline-flex items-baseline gap-2 rounded-md border border-white/[0.06] px-2.5 py-1.5 hover:border-blue-400/40">
              <span className="font-mono text-zinc-100">{item.ticker}</span>
              <span className="num text-[var(--fig-xs)] text-zinc-400">{`${item.buyers} ↑ / ${item.sellers} ↓`}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  )
}

export default function CongressDirectory() {
  const query = useCongressMembers()
  const [sort, setSort] = useState(DEFAULT_SORT)
  const onSort = (key) => setSort((current) => nextSort(current, key) ?? { key, direction: 'asc' })
  const rows = useMemo(() => sortRows(query.data?.members ?? [], sort, ACCESSORS), [query.data, sort])
  if (query.isLoading || query.error) {
    return <QueryState isLoading={query.isLoading} error={query.error} onRetry={query.refetch} label="members of Congress" />
  }
  const { members = [], most_bought: mostBought = [], window_days: windowDays = 90 } = query.data ?? {}
  if (members.length === 0) {
    return <EmptyState title="No House trades imported yet" hint="They load daily from the House Clerk; run backfill_house once to import history." />
  }
  return (
    <div className="flex flex-col gap-6">
      <MostBought items={mostBought} windowDays={windowDays} />
      <Card padding={false}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] text-[var(--fig-sm)]">
            <thead className="text-[var(--fig-2xs)] uppercase tracking-wider text-zinc-500 border-b border-white/[0.06]">
              <tr>
                <SortableTh edge sortKey="name" sort={sort} onSort={onSort}>Member</SortableTh>
                <Th>Party</Th>
                <Th align="right">Trades</Th>
                <Th align="right">Last filed</Th>
                <SortableTh edge align="right" sortKey="edge" sort={sort} onSort={onSort}>Copy edge / yr</SortableTh>
              </tr>
            </thead>
            <tbody>
              {rows.map((member) => (
                <Tr key={member.slug}>
                  <Td edge>
                    <span className="flex items-center gap-2.5">
                      <InvestorAvatar name={member.name} size={24} />
                      <Link to={`/investors/congress/${member.slug}`} className="font-medium text-zinc-100 hover:text-blue-300">{member.name}</Link>
                    </span>
                  </Td>
                  <Td className="text-zinc-400">{partyLabel(member.party, member.state_district)}</Td>
                  <Td align="right" className="num font-mono text-zinc-300">{fmtNum(member.trades)}</Td>
                  <Td align="right" className="num text-zinc-400">{member.last_filed ? fmtDate(member.last_filed) : '—'}</Td>
                  <Td edge align="right" className="num font-mono text-zinc-200">{points(member.excess_cagr_pct)}</Td>
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  )
}
