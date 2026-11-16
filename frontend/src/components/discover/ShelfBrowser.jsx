import { useState } from 'react'

import { TBtn } from '../ui'
import ShelfRow from './ShelfRow'

export default function ShelfBrowser({ shelves }) {
  const [chosen, setChosen] = useState(null)
  const active = shelves.find((shelf) => shelf.key === chosen) ?? shelves.find((shelf) => shelf.total > 0) ?? shelves[0]
  if (!active) return null
  return (
    <section aria-labelledby="browse-by-idea" className="space-y-3">
      <h2 id="browse-by-idea" className="text-[12px] font-medium text-ink-3">Browse by idea</h2>
      <div role="group" aria-label="Ideas" className="flex flex-wrap gap-0.5 p-[3px] rounded-[9px] bg-track w-fit max-w-full">
        {shelves.map((shelf) => (
          <TBtn key={shelf.key} active={shelf.key === active.key} onClick={() => setChosen(shelf.key)}>
            {shelf.short ?? shelf.title} <span className="num text-ink-3">{shelf.total}</span>
          </TBtn>
        ))}
      </div>
      <ShelfRow shelf={active} />
    </section>
  )
}
