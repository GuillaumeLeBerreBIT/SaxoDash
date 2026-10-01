import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Star } from 'lucide-react'

import { MenuRow } from '../research/menu'
import { useWatchlistToggle } from '../research/useWatchlistToggle'
import { usePortalMenuRect } from '../usePortalMenuRect'

const MENU_WIDTH = 200

export default function WatchlistStar({ ticker, name, uic, assetType }) {
  const [open, setOpen] = useState(false)
  const buttonRef = useRef(null)
  const menuRef = useRef(null)
  const rect = usePortalMenuRect(buttonRef, open, { minWidth: MENU_WIDTH })
  const { watchlists, toggleList } = useWatchlistToggle({
    symbol: ticker,
    instrument: { uic, assetType },
    details: { description: name },
  })
  const listed = watchlists.some((list) => list.items.some((entry) => entry.uic === uic))

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (buttonRef.current?.contains(event.target) || menuRef.current?.contains(event.target)) return
      setOpen(false)
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={listed ? `${ticker} is on a list` : `Add ${ticker} to a list`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className={`w-6 h-6 flex items-center justify-center rounded hover:bg-white/[0.08] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500 ${
          listed ? 'text-blue-400' : 'text-zinc-500 hover:text-zinc-200'
        }`}
      >
        <Star size={14} fill={listed ? 'currentColor' : 'none'} />
      </button>
      {rect && createPortal(
        <div
          ref={menuRef}
          role="menu"
          style={{ position: 'fixed', top: rect.top + 4, left: Math.max(8, rect.left + rect.width - MENU_WIDTH), width: MENU_WIDTH }}
          className="z-50 max-h-64 overflow-y-auto p-1 bg-zinc-900 border border-white/10 rounded shadow-lg"
        >
          {watchlists.length === 0 ? (
            <div className="px-2 py-2 text-[var(--fig-xs)] text-zinc-500">No lists yet — create one on Research.</div>
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
        </div>,
        document.body,
      )}
    </>
  )
}
