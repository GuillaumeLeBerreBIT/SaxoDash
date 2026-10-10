import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit } from '../../lib/discover'
import { EmptyState } from '../ui'
import ShelfCards from '../ShelfCards'
import DiscoverCard from './DiscoverCard'
import ShelfHeader from './ShelfHeader'

const cardKey = (item) => `${item.uic}:${item.asset_type}`

const renderCard = (item) => <DiscoverCard item={item} className="h-full" />

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
        <ShelfCards items={shelf.items} fit={fit} itemKey={cardKey} renderItem={renderCard} />
      )}
    </section>
  )
}
