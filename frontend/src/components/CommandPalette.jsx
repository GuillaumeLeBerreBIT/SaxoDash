import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

import { useInstrumentSearch } from '../api/queries'
import { PAGE_COMMANDS } from '../lib/commands'
import { researchHref } from '../lib/research'
import { readRecentSymbols } from '../lib/recentSymbols'

/** ⌘K overlay: jump to any instrument's Research page or any app page.
 *  Mounted only while open, so `Panel` starts fresh each time. */
export default function CommandPalette({ open, onClose }) {
  if (!open) return null
  return <Panel onClose={onClose} />
}

function Panel({ onClose }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const trimmed = query.trim()
  const { data: results = [] } = useInstrumentSearch(trimmed)

  const items = useMemo(() => {
    const pages = PAGE_COMMANDS
      .filter((c) => !trimmed || c.label.toLowerCase().includes(trimmed.toLowerCase()))
      .map((c) => ({ key: `page:${c.to}`, label: c.label, hint: 'Page', to: c.to }))

    if (!trimmed) {
      const recent = readRecentSymbols().map((s) => ({
        key: `recent:${s}`, label: s, hint: 'Recent', to: researchHref(s),
      }))
      return [...recent, ...pages]
    }

    const instruments = results.map((r) => ({
      key: `sym:${r.uic}:${r.asset_type}`,
      label: `${r.symbol}  ·  ${r.description}`,
      hint: r.exchange || 'Instrument',
      to: researchHref(r.symbol),
    }))
    return [...instruments, ...pages]
  }, [trimmed, results])

  // Focus only — no state written here, so no cascading render.
  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const activeIdx = items.length ? Math.min(active, items.length - 1) : 0

  const go = (item) => {
    if (!item) return
    navigate(item.to)
    onClose()
  }

  const onKeyDown = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((i) => (items.length ? (i + 1) % items.length : 0))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => (items.length ? (i - 1 + items.length) % items.length : 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      go(items[activeIdx])
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] bg-black/60"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command palette"
        className="w-[min(560px,92vw)] rounded-xl border border-white/10 bg-zinc-900 shadow-2xl shadow-black/50 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
      >
        <div className="flex items-center gap-2 px-3 h-11 border-b border-white/[0.06]">
          <Search size={14} className="text-zinc-500" />
          <input
            ref={inputRef}
            role="combobox"
            aria-expanded="true"
            aria-controls="command-palette-list"
            aria-label="Search instruments and pages"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setActive(0)
            }}
            placeholder="Search a symbol or a page…"
            className="flex-1 bg-transparent text-[13px] text-zinc-100 placeholder-zinc-600 outline-none"
          />
        </div>
        <ul id="command-palette-list" role="listbox" className="max-h-[320px] overflow-y-auto py-1">
          {items.length === 0 ? (
            <li className="px-3 py-3 text-[12px] text-zinc-500">No matches.</li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.key}
                role="option"
                aria-selected={i === activeIdx}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex items-center justify-between gap-3 px-3 h-9 cursor-pointer text-[12.5px] ${
                  i === activeIdx ? 'bg-blue-500/10 text-blue-300' : 'text-zinc-200'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-[10px] uppercase tracking-wide text-zinc-600 shrink-0">{item.hint}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  )
}
