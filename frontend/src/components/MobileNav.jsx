import { useEffect, useRef, useState } from 'react'
import { NavLink, useLocation, useNavigate } from 'react-router-dom'
import { Ellipsis, LogOut, Search } from 'lucide-react'
import { getUsername, logout } from '../api/client'
import { MOBILE_PRIMARY, NAV_ITEMS, mobileOverflow } from '../lib/navigation'

const tabCls = (active) =>
  `relative flex-1 min-h-[44px] flex flex-col items-center justify-center gap-0.5 ${
    active ? 'text-blue-400' : 'text-zinc-400'
  }`

function ActiveIndicator() {
  return <span className="absolute top-0 inset-x-4 h-[2px] rounded-full bg-blue-500" />
}

export default function MobileNav({ onOpenPalette }) {
  const [openedAt, setOpenedAt] = useState(null)
  const { pathname } = useLocation()
  const open = openedAt === pathname
  const setOpen = (value) => setOpenedAt(value ? pathname : null)
  const navigate = useNavigate()
  const moreRef = useRef(null)
  const dialogRef = useRef(null)
  const username = getUsername() || 'Account'
  const overflow = mobileOverflow()
  const primary = MOBILE_PRIMARY.map((to) => NAV_ITEMS.find((item) => item.to === to)).filter(Boolean)
  const moreActive = overflow.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`))

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

  const handleLogout = async () => {
    setOpen(false)
    await logout()
    navigate('/login')
  }

  const handleSearch = () => {
    setOpen(false)
    onOpenPalette()
  }

  return (
    <div className="md:hidden">
      <nav
        aria-label="Primary"
        className="md:hidden fixed inset-x-0 bottom-0 z-30 border-t border-white/[0.06] bg-zinc-950 pb-[env(safe-area-inset-bottom)]"
      >
        <div className="h-14 px-1 flex items-stretch">
          {primary.map(({ to, label, mobileLabel, icon: ItemIcon, end }) => (
            <NavLink key={to} to={to} end={end} aria-label={label} className={({ isActive }) => tabCls(isActive)}>
              {({ isActive }) => (
                <>
                  {isActive && <ActiveIndicator />}
                  <ItemIcon size={20} strokeWidth={1.75} />
                  <span className="text-[var(--fig-2xs)] font-medium leading-none max-w-full truncate px-0.5">{mobileLabel ?? label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            type="button"
            ref={moreRef}
            onClick={() => setOpen(!open)}
            aria-haspopup="dialog"
            aria-expanded={open}
            aria-current={moreActive ? 'page' : undefined}
            className={tabCls(moreActive || open)}
          >
            {moreActive && <ActiveIndicator />}
            <Ellipsis size={20} strokeWidth={1.75} />
            <span className="text-[var(--fig-2xs)] font-medium">More</span>
          </button>
        </div>
      </nav>

      {open && (
        <>
          <div
            data-testid="more-backdrop"
            onClick={() => setOpen(false)}
            className="fixed inset-0 z-40 bg-black/60"
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-label="More"
            ref={dialogRef}
            tabIndex={-1}
            onKeyDown={trapTab}
            className="fixed inset-x-0 bottom-0 z-50 rounded-t-2xl border-t border-white/[0.08] bg-zinc-950 pb-[env(safe-area-inset-bottom)] max-h-[85vh] overflow-y-auto outline-none"
          >
            <div className="mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-zinc-700" />
            <ul className="px-3 py-2">
              {overflow.map(({ to, label, icon: ItemIcon, end }) => (
                <li key={to}>
                  <NavLink
                    to={to}
                    end={end}
                    onClick={() => setOpen(false)}
                    className={({ isActive }) =>
                      `h-12 px-3 gap-3 flex items-center rounded-md text-[var(--fig-sm)] font-medium ${
                        isActive ? 'bg-blue-500/10 text-blue-400' : 'text-zinc-300 hover:bg-zinc-900'
                      }`
                    }
                  >
                    <ItemIcon size={18} strokeWidth={1.75} />
                    <span>{label}</span>
                  </NavLink>
                </li>
              ))}
              <li>
                <button
                  type="button"
                  onClick={handleSearch}
                  className="w-full h-12 px-3 gap-3 flex items-center rounded-md text-[var(--fig-sm)] font-medium text-zinc-300 hover:bg-zinc-900"
                >
                  <Search size={18} strokeWidth={1.75} />
                  <span>Search</span>
                </button>
              </li>
            </ul>
            <div className="flex items-center gap-3 border-t border-white/[0.06] px-6 py-3">
              <div className="min-w-0 flex-1 text-[var(--fig-sm)] font-medium text-zinc-100 truncate">{username}</div>
              <button
                type="button"
                onClick={handleLogout}
                aria-label="Log out"
                className="h-10 px-3 gap-2 rounded-md text-[var(--fig-xs)] text-zinc-400 hover:text-red-400 hover:bg-zinc-800/60 flex items-center"
              >
                <LogOut size={14} />
                <span>Log out</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
