import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { CandlestickChart } from 'lucide-react'

import { useDiscoverShelf } from '../api/queries'
import { reasonsLine, stockCount, updatedLabel } from '../lib/discover'
import { fmtMoney } from '../lib/format'
import { chartHref, researchHref } from '../lib/research'
import Sparkline from '../components/discover/Sparkline'
import WatchlistStar from '../components/discover/WatchlistStar'
import { Alert, Card, Chip, DayChange, InstrumentLogo, Skeleton, Td, Th, Tr } from '../components/ui'

const ALL_SECTORS = ''

function sectorCounts(items) {
  const counts = new Map()
  items.forEach((item) => {
    if (item.sector) counts.set(item.sector, (counts.get(item.sector) ?? 0) + 1)
  })
  return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
}

function SectorChips({ sectors, total, active, onPick }) {
  return (
    <div className="flex flex-wrap gap-1.5 px-[18px] pb-3.5">
      <Chip active={active === ALL_SECTORS} onClick={() => onPick(ALL_SECTORS)}>
        All sectors <b className="num font-semibold">{total}</b>
      </Chip>
      {sectors.map(([name, count]) => (
        <Chip key={name} active={active === name} onClick={() => onPick(name)}>
          {name} <b className="num font-semibold">{count}</b>
        </Chip>
      ))}
    </div>
  )
}

function ShelfRowItem({ item }) {
  const instrument = { uic: item.uic, assetType: item.asset_type }
  return (
    <Tr>
      <Td edge>
        <Link
          to={researchHref(item.ticker, 'overview', instrument)}
          className="flex items-center gap-2 rounded text-ink hover:text-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          <InstrumentLogo symbol={item.ticker} size={24} />
          <span className="font-semibold">{item.ticker}</span>
          <span className="hidden truncate text-ink-3 sm:inline">{item.name}</span>
        </Link>
      </Td>
      <Td hideBelow="md" className="text-ink-2">{item.sector ?? '—'}</Td>
      <Td hideBelow="md">
        <div className="w-24">
          <Sparkline values={item.sparkline} height={24} />
        </div>
      </Td>
      <Td align="right"><span className="num">{fmtMoney(item.last_close, 'USD')}</span></Td>
      <Td align="right"><DayChange value={item.change_1d} /></Td>
      <Td className="text-ink-2">{reasonsLine(item.reasons)}</Td>
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
  const sectors = data ? sectorCounts(data.items) : []
  const active = sectors.some(([name]) => name === sector) ? sector : ALL_SECTORS
  const rows = data ? data.items.filter((item) => active === ALL_SECTORS || item.sector === active) : []

  return (
    <div className="space-y-4">
      <Link to="/discover" className="inline-block rounded text-[13px] font-semibold text-accent hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus">← Discover</Link>
      {error ? <Alert>{error.status === 404 ? 'No such shelf.' : 'Could not load this shelf.'}</Alert> : null}
      {isLoading ? <Skeleton className="h-64" /> : null}
      {data ? (
        <Card
          flush
          dot="ok"
          context={`${stockCount(data.total)} · ${data.subtitle} · ${data.order}`}
          title={data.title}
          titleAs="h1"
          right={<span className="whitespace-nowrap text-[12px] text-ink-3">{updatedLabel(data.as_of)}</span>}
        >
          {sectors.length > 0 ? <SectorChips sectors={sectors} total={data.items.length} active={active} onPick={setSector} /> : null}
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr>
                  <Th edge>Stock</Th>
                  <Th hideBelow="md">Sector</Th>
                  <Th hideBelow="md">3 months</Th>
                  <Th align="right">Last</Th>
                  <Th align="right">1 day</Th>
                  <Th>Why it is here</Th>
                  <Th align="right" edge><span className="sr-only">Actions</span></Th>
                </tr>
              </thead>
              <tbody>
                {rows.map((item) => <ShelfRowItem key={`${item.uic}:${item.asset_type}`} item={item} />)}
              </tbody>
            </table>
          </div>
        </Card>
      ) : null}
    </div>
  )
}
