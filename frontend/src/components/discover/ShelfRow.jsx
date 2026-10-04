import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit } from '../../lib/discover'
import { EmptyState } from '../ui'
import DiscoverCard from './DiscoverCard'
import ShelfHeader from './ShelfHeader'

const cardKey = (item) => `${item.uic}:${item.asset_type}`

function Cards({ items, fit }) {
  if (fit == null) {
    return (
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
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
  const fit = cardsThatFit(width)
  const shown = fit == null ? shelf.items.length : Math.min(fit, shelf.items.length)
  return (
    <section ref={ref} aria-labelledby={`shelf-${shelf.key}`} className="space-y-2">
      <ShelfHeader shelf={shelf} shown={shown} />
      {shelf.total === 0 ? (
        <EmptyState title={shelf.empty} className="py-4" />
      ) : (
        <Cards items={shelf.items} fit={fit} />
      )}
    </section>
  )
}
