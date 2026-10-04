import { Link } from 'react-router-dom'

import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit, shelfNote, stockCount } from '../../lib/discover'
import { EmptyState, InfoTip } from '../ui'
import DiscoverCard from './DiscoverCard'

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

function splitLastWord(text) {
  const at = text.lastIndexOf(' ')
  return at < 0 ? ['', text] : [text.slice(0, at), text.slice(at + 1)]
}

export default function ShelfRow({ shelf }) {
  const [ref, width] = useWidth()
  const fit = cardsThatFit(width)
  const [head, tail] = splitLastWord(shelf.subtitle)
  const shown = fit == null ? shelf.items.length : Math.min(fit, shelf.items.length)
  return (
    <section ref={ref} aria-labelledby={`shelf-${shelf.key}`} className="space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id={`shelf-${shelf.key}`} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
          <p className="text-[var(--fig-xs)] text-zinc-500">
            <span className="num whitespace-nowrap">{stockCount(shelf.total)}</span>
            <span aria-hidden="true" className="whitespace-nowrap">{' · '}</span>
            {head ? `${head} ` : null}
            <span className="whitespace-nowrap">
              {tail}
              <InfoTip label={`About ${shelf.title}`}>{shelfNote(shelf, shown)}</InfoTip>
            </span>
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
        <Cards items={shelf.items} fit={fit} />
      )}
    </section>
  )
}
