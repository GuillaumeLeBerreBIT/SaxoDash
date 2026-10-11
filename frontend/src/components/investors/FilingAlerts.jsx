import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'

import ChangeBadge from './ChangeBadge'
import { useFilingAlerts, useMarkAlertsRead } from '../../api/queries'
import { alertHref, alertSummary, fmtFiledDate, holdingLabel, quarterLabel } from '../../lib/investors'

const PANEL_SIDES = {
  right: 'top-14 w-[360px]',
  below: 'left-2 right-2 top-[calc(env(safe-area-inset-top)+3.5rem)]',
}

function AlertRow({ alert, onPick }) {
  return (
    <li>
      <Link
        to={alertHref(alert)}
        onClick={onPick}
        className="block px-3 py-2.5 hover:bg-zinc-800/50 focus-visible:bg-zinc-800/50 outline-none"
      >
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full shrink-0 self-center ${alert.read ? 'bg-transparent' : 'bg-blue-400'}`}
          />
          <span className="text-[var(--fig-sm)] font-medium text-zinc-100 truncate">{alert.investor.name}</span>
          {!alert.read && <span className="sr-only">Unread</span>}
          <span className="ml-auto shrink-0 num font-mono text-[var(--fig-xs)] text-zinc-400">
            {quarterLabel(alert.quarter)}
          </span>
        </div>
        <div className="pl-3.5 mt-0.5 text-[var(--fig-xs)] text-zinc-500">
          {`Filed ${fmtFiledDate(alert.filed_on)} · ${alertSummary(alert.counts)}`}
        </div>
        {alert.moves.length > 0 && (
          <ul className="pl-3.5 mt-1.5 space-y-1">
            {alert.moves.map((move) => (
              <li key={`${move.cusip}-${move.put_call}`} className="flex items-center gap-2 text-[var(--fig-xs)]">
                <span className="text-zinc-300 truncate">{holdingLabel(move)}</span>
                <span className="shrink-0 whitespace-nowrap">
                  <ChangeBadge change={move.kind} pct={move.shares_change_pct} />
                </span>
              </li>
            ))}
          </ul>
        )}
      </Link>
    </li>
  )
}

export default function FilingAlerts({ side = 'below', panelLeft, className = '' }) {
  const [open, setOpen] = useState(false)
  const root = useRef(null)
  const { data } = useFilingAlerts()
  const markRead = useMarkAlertsRead()
  const unread = data?.unread ?? 0
  const alerts = data?.alerts ?? []

  const close = () => {
    setOpen(false)
    if (unread > 0) markRead.mutate()
  }
  const closeRef = useRef(close)
  useEffect(() => {
    closeRef.current = close
  })

  useEffect(() => {
    if (!open) return undefined
    const onPointerDown = (event) => {
      if (!root.current?.contains(event.target)) closeRef.current()
    }
    const onKeyDown = (event) => {
      if (event.key === 'Escape') closeRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div ref={root} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => (open ? close() : setOpen(true))}
        aria-label={unread ? `Filing alerts, ${unread} unread` : 'Filing alerts'}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Filing alerts"
        className="relative w-10 h-10 md:w-8 md:h-8 rounded-md md:border md:border-white/[0.06] text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 flex items-center justify-center"
      >
        <Bell size={16} />
        {unread > 0 && (
          <span
            aria-hidden="true"
            className="absolute top-1 right-1 md:top-0 md:right-0 min-w-[16px] h-4 px-1 rounded-full bg-blue-500 text-white text-[var(--fig-2xs)] font-medium leading-4 text-center num"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Filing alerts"
          style={panelLeft == null ? undefined : { left: panelLeft }}
          className={`fixed z-40 rounded-lg border border-white/[0.08] bg-zinc-900 shadow-xl shadow-black/40 ${PANEL_SIDES[side]}`}
        >
          <div className="px-3 py-2 border-b border-white/[0.06] text-[var(--fig-xs)] uppercase tracking-wider text-zinc-500">
            New 13F filings
          </div>
          {alerts.length === 0 ? (
            <p className="px-3 py-4 text-[var(--fig-sm)] text-zinc-400">
              Nothing new from the investors you follow. Follow an investor to hear when they file.
            </p>
          ) : (
            <ul className="max-h-[60vh] overflow-y-auto divide-y divide-white/[0.06]">
              {alerts.map((alert) => (
                <AlertRow key={alert.id} alert={alert} onPick={close} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  )
}
