import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CandlestickChart } from 'lucide-react'

import { useDiscoverShelf, useVerdictSummary } from '../api/queries'
import { reasonsLine, stockCount, updatedLabel } from '../lib/discover'
import { fmtMoney } from '../lib/format'
import { chartHref, researchHref } from '../lib/research'
import { bestActionFirst, mergeShareClasses } from '../lib/shelfRows'
import ActionBadge from '../components/verdicts/ActionBadge'
import Sparkline from '../components/discover/Sparkline'
import WatchlistStar from '../components/discover/WatchlistStar'
import { Alert, Card, DataTable, DayChange, InstrumentLogo, Select, Skeleton, Td, Th, Tr } from '../components/ui'

const ALL_SECTORS = ''
const NO_ITEMS = []

function sectorCounts(items) {
  const counts = new Map()
  items.forEach((item) => {
    if (item.sector) counts.set(item.sector, (counts.get(item.sector) ?? 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function SectorSelect({ sectors, total, active, onPick }) {
  return (
    <div className="px-[18px] pb-3.5">
      <Select aria-label="Sector" value={active} onChange={(event) => onPick(event.target.value)} className="max-w-full">
        <option value={ALL_SECTORS}>All sectors ({total})</option>
        {sectors.map(([name, count]) => (
          <option key={name} value={name}>
            {name} ({count})
          </option>
        ))}
      </Select>
    </div>
  )
}

function ShelfRowItem({ item, verdict }) {
  const instrument = { uic: item.uic, assetType: item.asset_type }
  return (
    <Tr>
      <Td edge className="w-full max-w-0 !whitespace-normal md:w-auto md:max-w-none md:!whitespace-nowrap">
        <Link
          to={researchHref(item.ticker, 'overview', instrument)}
          className="flex items-center gap-2 rounded text-ink hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          <InstrumentLogo symbol={item.ticker} size={24} />
          <span className="font-semibold">{item.ticker}</span>
          {item.also?.length ? <span className="text-[12px] text-ink-3">also {item.also.join(', ')}</span> : null}
          <span className="hidden truncate text-ink-3 sm:inline">{item.name}</span>
        </Link>
        <p className="mt-0.5 text-[12px] text-ink-2 md:hidden">{reasonsLine(item.reasons)}</p>
      </Td>
      <Td hideBelow="md" className="text-ink-2">{item.sector ?? '—'}</Td>
      <Td hideBelow="md">
        <div className="w-24">
          <Sparkline values={item.sparkline} height={24} />
        </div>
      </Td>
      <Td align="right" hideBelow="md"><span className="num">{fmtMoney(item.last_close, 'USD')}</span></Td>
      <Td align="right" hideBelow="md"><DayChange value={item.change_1d} /></Td>
      <Td hideBelow="md" className="text-ink-2">{reasonsLine(item.reasons)}</Td>
      <Td align="right"><ActionBadge verdict={verdict} /></Td>
      <Td align="right" edge>
        <div className="flex items-center justify-end gap-1">
          <Link
            to={chartHref(item.ticker, instrument)}
            aria-label={`Open ${item.ticker} chart`}
            title="Open chart"
            className="w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
          >
            <CandlestickChart size={14} />
          </Link>
          <WatchlistStar ticker={item.ticker} name={item.name} uic={item.uic} assetType={item.asset_type} />
        </div>
      </Td>
    </Tr>
  )
}

export default function DiscoverShelf() {
  const { key } = useParams()
  const { data, isLoading, error } = useDiscoverShelf(key)
  const [sector, setSector] = useState(ALL_SECTORS)
  const items = useMemo(() => mergeShareClasses(data?.items ?? NO_ITEMS), [data])
  const tickers = useMemo(() => items.map((item) => item.ticker), [items])
  const verdicts = useVerdictSummary(tickers).data
  const sectors = sectorCounts(items)
  const active = sectors.some(([name]) => name === sector) ? sector : ALL_SECTORS
  const rows = bestActionFirst(items.filter((item) => active === ALL_SECTORS || item.sector === active), verdicts)
  const verdictOf = (item) => (verdicts ? (verdicts[item.ticker] ?? null) : undefined)

  return (
    <div className="space-y-4">
      <Link to="/discover" className="inline-block rounded text-[13px] font-semibold text-accent hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">← Discover</Link>
      {error ? <Alert>{error.status === 404 ? 'No such shelf.' : 'Could not load this shelf.'}</Alert> : null}
      {isLoading ? <Skeleton className="h-64" /> : null}
      {data ? (
        <Card
          flush
          dot="ok"
          context={`${stockCount(data.total)} · ${data.subtitle} · best action first, then ${data.order.charAt(0).toLowerCase()}${data.order.slice(1)}`}
          title={data.title}
          titleAs="h1"
          right={<span className="whitespace-nowrap text-[12px] text-ink-3">{updatedLabel(data.as_of)}</span>}
        >
          {sectors.length > 1 ? <SectorSelect sectors={sectors} total={items.length} active={active} onPick={setSector} /> : null}
          <DataTable label={data.title}>
            <thead>
              <tr>
                <Th edge>Stock</Th>
                <Th hideBelow="md">Sector</Th>
                <Th hideBelow="md">3 months</Th>
                <Th align="right" hideBelow="md">Last</Th>
                <Th align="right" hideBelow="md">1 day</Th>
                <Th hideBelow="md">Why it is here</Th>
                <Th align="right">Action</Th>
                <Th align="right" edge><span className="sr-only">Actions</span></Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => <ShelfRowItem key={`${item.uic}:${item.asset_type}`} item={item} verdict={verdictOf(item)} />)}
            </tbody>
          </DataTable>
        </Card>
      ) : null}
    </div>
  )
}
