import { Link } from 'react-router-dom'

import { shelfNote, stockCount } from '../../lib/discover'
import { InfoTip } from '../ui'
import DiscoverCard from './DiscoverCard'

export default function ShelfRow({ shelf }) {
  return (
    <section aria-labelledby={`shelf-${shelf.key}`} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <h2 id={`shelf-${shelf.key}`} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
            <span className="text-[var(--fig-xs)] text-zinc-500 num">{stockCount(shelf.total)}</span>
            <InfoTip label={`About ${shelf.title}`}>{shelfNote(shelf)}</InfoTip>
          </div>
          <p className="text-[var(--fig-xs)] text-zinc-500">{shelf.subtitle}</p>
        </div>
        {shelf.total > 0 ? (
          <Link to={`/discover/${shelf.key}`} className="shrink-0 text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
            See all
          </Link>
        ) : null}
      </div>
      {shelf.total === 0 ? (
        <p className="text-[var(--fig-xs)] text-zinc-600">{shelf.empty}</p>
      ) : (
        <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
          {shelf.items.map((item) => (
            <DiscoverCard key={`${item.uic}:${item.asset_type}`} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}
