import { Link } from 'react-router-dom'

import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit, shelfNote, stockCount } from '../../lib/discover'
import { EmptyState, InfoTip } from '../ui'
import DiscoverCard from './DiscoverCard'

const cardKey = (item) => `${item.uic}:${item.asset_type}`

function Cards({ items, fit }) {
  if (fit == null) {
    return (
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4">
        {items.map((item) => <DiscoverCard key={cardKey(item)} item={item} className="w-56 shrink-0 snap-start" />)}
      </div>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))` }}>
      {items.slice(0, fit).map((item) => <DiscoverCard key={cardKey(item)} item={item} />)}
    </div>
  )
}

export default function ShelfRow({ shelf }) {
  const [ref, width] = useWidth()
  return (
    <section ref={ref} aria-labelledby={`shelf-${shelf.key}`} className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`shelf-${shelf.key}`} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
          <p className="flex flex-wrap items-center gap-x-2 text-[var(--fig-xs)] text-zinc-500">
            <span className="num whitespace-nowrap">{stockCount(shelf.total)}</span>
            <span aria-hidden="true">·</span>
            <span>{shelf.subtitle}</span>
            <InfoTip label={`About ${shelf.title}`}>{shelfNote(shelf)}</InfoTip>
          </p>
        </div>
        {shelf.total > 0 ? (
          <Link to={`/discover/${shelf.key}`} className="shrink-0 whitespace-nowrap text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
            See all <span className="num">{shelf.total}</span>
          </Link>
        ) : null}
      </div>
      {shelf.total === 0 ? (
        <EmptyState title={shelf.empty} className="py-4" />
      ) : (
        <Cards items={shelf.items} fit={cardsThatFit(width)} />
      )}
    </section>
  )
}
