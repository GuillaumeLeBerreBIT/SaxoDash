import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation } from 'react-router-dom'
import { Briefcase, CandlestickChart, ChevronRight, Compass, Ellipsis, LayoutDashboard, Search } from 'lucide-react'
import { MOBILE_PRIMARY, NAV_ITEMS, mobileOverflow, ownsPath } from '../lib/navigation'

const PRIMARY_ICONS = {
  '/': LayoutDashboard,
  '/portfolio': Briefcase,
  '/research': CandlestickChart,
  '/discover': Compass,
}

const tabCls = (active) =>
  `flex-1 h-12 flex flex-col items-center justify-center gap-0.5 rounded-lg text-[11px] font-semibold ${
    active ? 'text-ink' : 'text-ink-3'
  }`

const SHEET_ROW = 'w-full h-12 flex items-center justify-between gap-3 border-b border-line text-[15px] font-semibold text-left'

export default function MobileNav({ onOpenPalette }) {
  const [openedAt, setOpenedAt] = useState(null)
  const { pathname } = useLocation()
  const [seenPath, setSeenPath] = useState(pathname)
  if (seenPath !== pathname) {
    setSeenPath(pathname)
    setOpenedAt(null)
  }
  const open = openedAt === pathname
  const setOpen = (value) => setOpenedAt(value ? pathname : null)
  const moreRef = useRef(null)
  const dialogRef = useRef(null)
  const overflow = mobileOverflow()
  const primary = MOBILE_PRIMARY.map((to) => NAV_ITEMS.find((item) => item.to === to)).filter(Boolean)
  const moreActive = overflow.some((item) => ownsPath(item, pathname))

  useEffect(() => {
    if (!open) return undefined
    const onKey = (event) => {
      if (event.key === 'Escape') setOpenedAt(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open])

  useEffect(() => {
    if (!open) return undefined
    const trigger = moreRef.current
    dialogRef.current?.focus()
    return () => trigger?.focus()
  }, [open])

  const trapTab = (event) => {
    if (event.key !== 'Tab') return
    const focusable = dialogRef.current.querySelectorAll('a[href], button:not([disabled])')
    if (!focusable.length) return
    const first = focusable[0]
    const last = focusable[focusable.length - 1]
    const active = document.activeElement
    if (event.shiftKey && (active === first || active === dialogRef.current)) {
      event.preventDefault()
      last.focus()
    } else if (!event.shiftKey && active === last) {
      event.preventDefault()
      first.focus()
    }
  }

  const handleSearch = () => {
    setOpen(false)
    onOpenPalette()
  }

  return (
    <div className="min-[760px]:hidden">
      <nav
        aria-label="Primary"
        className="min-[760px]:hidden fixed inset-x-0 bottom-0 z-[35] flex bg-bar shadow-[0_-1px_0_var(--sd-line)] pt-1.5 pb-[calc(6px+env(safe-area-inset-bottom))] pl-[max(8px,env(safe-area-inset-left))] pr-[max(8px,env(safe-area-inset-right))]"
      >
        {primary.map(({ to, label, end }) => {
          const ItemIcon = PRIMARY_ICONS[to]
          return (
            <NavLink key={to} to={to} end={end} className={({ isActive }) => tabCls(isActive)}>
              <ItemIcon size={20} strokeWidth={1.75} aria-hidden="true" />
              <span className="leading-none max-w-full truncate px-0.5">{label}</span>
            </NavLink>
          )
        })}
        <button
          type="button"
          ref={moreRef}
          onClick={() => setOpen(!open)}
          aria-haspopup="dialog"
          aria-expanded={open}
          aria-current={moreActive ? 'page' : undefined}
          className={tabCls(moreActive || open)}
        >
          <Ellipsis size={20} strokeWidth={1.75} aria-hidden="true" />
          <span className="leading-none">More</span>
        </button>
      </nav>

      {open && (
        <>
          <div data-testid="more-backdrop" onClick={() => setOpen(false)} className="fixed inset-0 z-50 bg-black/55" />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={trapTab}
            className="sd-raised fixed inset-x-0 bottom-0 z-[55] rounded-t-2xl bg-raised text-ink px-4 pt-2.5 pb-[calc(16px+env(safe-area-inset-bottom))] max-h-[85vh] overflow-y-auto outline-none"
          >
            <div aria-hidden="true" className="mx-auto mb-1.5 h-1 w-10 rounded-full bg-pill" />
            <ul>
              {overflow.map(({ to, label, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) => `${SHEET_ROW} ${isActive ? 'text-ink' : 'text-ink-2'}`}
                  >
                    {label}
                    <ChevronRight size={16} aria-hidden="true" className="text-ink-3" />
                  </NavLink>
                </li>
              ))}
              <li>
                <button type="button" onClick={handleSearch} className={`${SHEET_ROW} text-ink-2 border-b-0`}>
                  Search
                  <Search size={16} aria-hidden="true" className="text-ink-3" />
                </button>
              </li>
            </ul>
          </div>
        </>
      )}
    </div>
  )
}
