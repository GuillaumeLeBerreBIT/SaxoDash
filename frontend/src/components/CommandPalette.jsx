import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Search } from 'lucide-react'

import { useInstrumentSearch, useMe } from '../api/queries'
import { PAGE_COMMANDS } from '../lib/commands'
import { visibleTo } from '../lib/navigation'
import { rankInstrumentResults, researchHref } from '../lib/research'
import { readRecentSymbols } from '../lib/recentSymbols'
import { Dialog } from './overlays'

const defaultHrefFor = (symbol, instrument) => researchHref(symbol, undefined, instrument)

/** ⌘K overlay: jump to any instrument's Research page or any app page.
 *  Mounted only while open, so `Panel` starts fresh each time. */
export default function CommandPalette({ open, onClose, hrefFor = defaultHrefFor }) {
  if (!open) return null
  return <Panel onClose={onClose} hrefFor={hrefFor} />
}

function Panel({ onClose, hrefFor }) {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const inputRef = useRef(null)

  const trimmed = query.trim()
  const { data: results = [] } = useInstrumentSearch(trimmed)
  const { data: me } = useMe()

  const items = useMemo(() => {
    const pages = visibleTo(PAGE_COMMANDS, me)
      .filter((c) => !trimmed || c.label.toLowerCase().includes(trimmed.toLowerCase()))
      .map((c) => ({ key: `page:${c.to}`, label: c.label, hint: 'Page', to: c.to }))

    if (!trimmed) {
      const recent = readRecentSymbols().map((s) => ({
        key: `recent:${s}`, label: s, hint: 'Recent', to: hrefFor(s),
      }))
      return [...recent, ...pages]
    }

    // Same order resolveInstrument would pick from, so the top suggestion
    // for an ambiguous ticker (e.g. "NOW") is the one Enter actually opens.
    const instruments = rankInstrumentResults(results, trimmed).map((r) => ({
      key: `sym:${r.uic}:${r.asset_type}`,
      label: `${r.symbol}  ·  ${r.description}`,
      hint: r.exchange || 'Instrument',
      to: hrefFor(r.symbol, { uic: r.uic, assetType: r.asset_type }),
    }))
    return [...instruments, ...pages]
  }, [trimmed, results, hrefFor, me])

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
    <Dialog open onOpenChange={(next) => !next && onClose()} title="Command palette" width="min(620px,92vw)" placement="top" bare>
      <div onKeyDown={onKeyDown}>
        <div className="flex items-center gap-2 px-3 h-11 border-b border-line">
          <Search size={14} className="text-ink-3" />
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
            className="flex-1 bg-transparent text-[14px] text-ink placeholder:text-ink-3 outline-none"
          />
        </div>
        <ul id="command-palette-list" role="listbox" className="max-h-[320px] overflow-y-auto py-1.5 px-1.5">
          {items.length === 0 ? (
            <li className="px-3 py-3 text-[12px] text-ink-3">No matches.</li>
          ) : (
            items.map((item, i) => (
              <li
                key={item.key}
                role="option"
                aria-selected={i === activeIdx}
                onMouseEnter={() => setActive(i)}
                onClick={() => go(item)}
                className={`flex items-center justify-between gap-3 px-3 h-9 rounded-[7px] cursor-pointer text-[13px] ${
                  i === activeIdx ? 'bg-selected text-ink' : 'text-ink-2'
                }`}
              >
                <span className="truncate">{item.label}</span>
                <span className="text-[11px] uppercase tracking-wide text-ink-3 shrink-0">{item.hint}</span>
              </li>
            ))
          )}
        </ul>
      </div>
    </Dialog>
  )
}
