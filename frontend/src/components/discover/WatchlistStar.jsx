import { useRef } from 'react'
import { Check, Star } from 'lucide-react'

import { MenuCheckboxItem, MenuContent, MenuItem, MenuLabel, MenuRoot, MenuTrigger } from '../overlays'
import { useWatchlistToggle } from '../research/useWatchlistToggle'

const MENU_WIDTH = 232

function focusFirstItem(event) {
  event.preventDefault()
  const menu = event.currentTarget
  const item = menu.querySelector('[aria-checked="true"]') ?? menu.querySelector('[role="menuitemcheckbox"]')
  const target = item ?? menu.querySelector('[role="menuitem"]') ?? menu
  target.focus()
}

export default function WatchlistStar({ ticker, name, uic, assetType }) {
  const { watchlists, toggleList, pending, error, listsLoading, listsError, retryLists } = useWatchlistToggle({
    symbol: ticker,
    instrument: { uic, assetType },
    details: { description: name },
  })
  const trigger = useRef(null)
  const results = useRef(null)
  const restoreFocus = (event) => {
    if (!trigger.current?.isConnected && results.current?.isConnected) {
      event.preventDefault()
      results.current.focus()
    }
  }
  const listed = watchlists.some((list) => list.items.some((entry) => entry.uic === uic))

  return (
    <MenuRoot modal={false} onOpenChange={(open) => {
      if (open) results.current = trigger.current?.closest('section[tabindex="-1"]')
    }}>
      <MenuTrigger
        ref={trigger}
        disabled={uic == null}
        title={uic == null ? 'Listing unavailable for saving' : undefined}
        aria-label={listed ? `${ticker} is on a list` : `Add ${ticker} to a list`}
        className={`w-10 h-10 sm:w-6 sm:h-6 flex items-center justify-center rounded hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
          listed ? 'text-accent' : 'text-ink-3 hover:text-ink'
        }`}
      >
        <Star aria-hidden size={14} fill={listed ? 'currentColor' : 'none'} />
      </MenuTrigger>
      <MenuContent align="end" width={MENU_WIDTH} onOpenAutoFocus={focusFirstItem} onCloseAutoFocus={restoreFocus}>
        <MenuLabel>{ticker} watchlists</MenuLabel>
        {error && <p role="alert" className="px-2 py-1 text-[12px] text-warn-text">Could not update the list. Select it to retry.</p>}
        {listsError ? <MenuItem onSelect={() => retryLists()}>Retry loading watchlists</MenuItem>
          : listsLoading ? <span role="status" className="px-2 text-ink-3">Loading watchlists…</span>
          : watchlists.length === 0 ? (
            <div className="px-2 py-2 text-[12px] text-ink-3">Create your first watchlist in Research.</div>
          ) : watchlists.map((list) => {
            const checked = list.items.some((entry) => entry.uic === uic)
            return <MenuCheckboxItem key={list.id} checked={checked} disabled={pending} onChange={() => toggleList(list)}>
              <span aria-hidden className="flex h-4 w-4 shrink-0 items-center justify-center rounded border border-line-input">{checked && <Check size={12} />}</span>
              <span className="min-w-0 flex-1 truncate">{list.name}</span>
              <span className="num text-ink-3">{list.items.length}<span className="sr-only"> stocks</span></span>
            </MenuCheckboxItem>
          })}
      </MenuContent>
    </MenuRoot>
  )
}
