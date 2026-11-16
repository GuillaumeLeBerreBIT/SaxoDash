import { Link } from 'react-router-dom'

import { useBrowse, useInvestorHub } from '../../api/queries'
import { RAILS, RAIL_SIZE, browseQuery, checksLine, paramsFromFilters } from '../../lib/discoverBrowse'
import { Skeleton } from '../ui'
import StockCard from './StockCard'

const GRID =
  '-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-2 sm:gap-4 sm:overflow-visible sm:px-0 sm:pb-0 xl:grid-cols-4'
const ITEM = 'w-[82%] shrink-0 snap-start sm:w-auto'
const FUNDS_KEY = 'convergent-buys'

function RailSkeleton() {
  return (
    <div className={GRID}>
      {Array.from({ length: RAIL_SIZE }, (_, index) => (
        <Skeleton key={index} className={`h-[330px] rounded-[14px] ${ITEM}`} />
      ))}
    </div>
  )
}

function Rail({ title, sub, total, seeAll, query, notes }) {
  const stocks = query.data?.stocks ?? []
  if (query.isSuccess && stocks.length === 0) return null
  return (
    <section aria-label={title} className="flex flex-col gap-3.5">
      <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
        <div className="min-w-0">
          <h2 className="text-[20px] font-bold text-ink">{title}</h2>
          <p className="text-[14px] text-ink-2">{sub}</p>
        </div>
        {seeAll ? (
          <Link to={seeAll.to} className="text-[14px] font-semibold text-ink hover:underline">
            {total == null ? seeAll.label : `${seeAll.label} ${total}`} →
          </Link>
        ) : null}
      </div>
      {query.isLoading ? (
        <RailSkeleton />
      ) : (
        <div className={GRID}>
          {stocks.map((stock) => (
            <StockCard key={stock.ticker} stock={stock} note={notes?.(stock)} className={ITEM} />
          ))}
        </div>
      )}
    </section>
  )
}

const tickersOf = (query) => (query.data?.stocks ?? []).map((stock) => stock.ticker)

function seeAllFor(rail) {
  return { label: 'See all', to: `?${new URLSearchParams(paramsFromFilters({ ...rail.filters })).toString()}` }
}

export default function StockRails() {
  const [opportunities, fell] = RAILS
  const first = useBrowse(browseQuery(opportunities.filters, { limit: RAIL_SIZE }))
  const firstShown = tickersOf(first)
  const second = useBrowse(browseQuery(fell.filters, { limit: RAIL_SIZE, exclude: firstShown }), { enabled: first.isSuccess })
  const hub = useInvestorHub()
  const fundItems = hub.data?.shelves?.find((shelf) => shelf.key === FUNDS_KEY)?.items ?? []
  const bought = new Map(fundItems.filter((item) => item.ticker).map((item) => [item.ticker, item.bought]))
  const shownBefore = [...firstShown, ...tickersOf(second)]
  const funds = useBrowse(browseQuery({ sort: 'opportunity' }, { tickers: [...bought.keys()], exclude: shownBefore, limit: RAIL_SIZE }), {
    enabled: bought.size > 0 && second.isSuccess,
  })

  return (
    <div className="flex flex-col gap-10">
      <Rail title={opportunities.title} sub={opportunities.sub} total={first.data?.total} seeAll={seeAllFor(opportunities)} query={first} />
      <Rail title={fell.title} sub={fell.sub} total={second.data?.total} seeAll={seeAllFor(fell)} query={second} />
      {bought.size > 0 ? (
        <Rail
          title="Funds are buying"
          sub="Bought by the most tracked funds last quarter, with what the rules say about them today"
          seeAll={{ label: 'All fund moves', to: '/investors/stocks' }}
          query={funds}
          notes={(stock) => `${bought.get(stock.ticker)} tracked funds bought it last quarter. ${checksLine(stock)}`}
        />
      ) : null}
    </div>
  )
}
