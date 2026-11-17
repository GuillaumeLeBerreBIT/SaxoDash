import { useState } from 'react'

import { Segmented } from '../ui'
import ShelfRow from './ShelfRow'

export default function ShelfBrowser({ shelves }) {
  const [chosen, setChosen] = useState(null)
  const active = shelves.find((shelf) => shelf.key === chosen) ?? shelves.find((shelf) => shelf.total > 0) ?? shelves[0]
  if (!active) return null
  const options = shelves.map((shelf) => ({
    value: shelf.key,
    label: (
      <>
        {shelf.short ?? shelf.title} <span className="num text-ink-3">{shelf.total}</span>
      </>
    ),
  }))
  return (
    <section aria-labelledby="browse-by-idea" className="space-y-3">
      <h2 id="browse-by-idea" className="text-[12px] font-medium text-ink-3">Browse by idea</h2>
      <Segmented label="Ideas" options={options} value={active.key} onChange={setChosen} className="max-w-full" />
      <ShelfRow shelf={active} />
    </section>
  )
}
