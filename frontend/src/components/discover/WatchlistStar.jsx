import { Star } from 'lucide-react'

import { MenuContent, MenuRoot, MenuTrigger } from '../overlays'
import { MenuRow } from '../research/menu'
import { useWatchlistToggle } from '../research/useWatchlistToggle'

const MENU_WIDTH = 200

function focusFirstItem(event) {
  event.preventDefault()
  event.currentTarget.querySelector('[role="menuitem"]')?.focus()
}

export default function WatchlistStar({ ticker, name, uic, assetType }) {
  const { watchlists, toggleList } = useWatchlistToggle({
    symbol: ticker,
    instrument: { uic, assetType },
    details: { description: name },
  })
  const listed = watchlists.some((list) => list.items.some((entry) => entry.uic === uic))

  return (
    <MenuRoot modal={false}>
      <MenuTrigger
        aria-label={listed ? `${ticker} is on a list` : `Add ${ticker} to a list`}
        className={`w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
          listed ? 'text-accent' : 'text-ink-3 hover:text-ink'
        }`}
      >
        <Star size={14} fill={listed ? 'currentColor' : 'none'} />
      </MenuTrigger>
      <MenuContent align="end" width={MENU_WIDTH} onOpenAutoFocus={focusFirstItem}>
        {watchlists.length === 0 ? (
          <div className="px-2 py-2 text-[12px] text-ink-3">No lists yet — create one on Research.</div>
        ) : (
          watchlists.map((list) => (
            <MenuRow
              key={list.id}
              checked={list.items.some((entry) => entry.uic === uic)}
              onClick={() => toggleList(list)}
              right={`${list.items.length}`}
            >
              {list.name}
            </MenuRow>
          ))
        )}
      </MenuContent>
    </MenuRoot>
  )
}
