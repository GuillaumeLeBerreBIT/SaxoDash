import { useState } from 'react'
import { Link } from 'react-router-dom'
import { Bell } from 'lucide-react'

import ChangeBadge from './ChangeBadge'
import { Popover } from '../overlays'
import { panelOffset } from '../../lib/panelOffset'
import { useFilingAlerts, useMarkAlertsRead } from '../../api/queries'
import { alertHref, alertSummary, fmtFiledDate, holdingLabel, quarterLabel } from '../../lib/investors'

const PANEL_PLACEMENT = {
  right: { side: 'right', align: 'start', width: 360 },
  below: { side: 'bottom', align: 'end', width: 'min(360px, calc(100vw - 16px))' },
}

function AlertRow({ alert, onPick }) {
  return (
    <li>
      <Link
        to={alertHref(alert)}
        onClick={onPick}
        className="block px-3 py-2.5 hover:bg-hover focus-visible:bg-hover outline-none"
      >
        <div className="flex items-baseline gap-2">
          <span
            aria-hidden="true"
            className={`w-1.5 h-1.5 rounded-full shrink-0 self-center ${alert.read ? 'bg-transparent' : 'bg-accent'}`}
          />
          <span className="text-[13px] font-medium text-ink truncate">{alert.investor.name}</span>
          {!alert.read && <span className="sr-only">Unread</span>}
          <span className="ml-auto shrink-0 num text-[12px] text-ink-2">
            {quarterLabel(alert.quarter)}
          </span>
        </div>
        <div className="pl-3.5 mt-0.5 text-[12px] text-ink-3">
          {`Filed ${fmtFiledDate(alert.filed_on)} · ${alertSummary(alert.counts)}`}
        </div>
        {alert.moves.length > 0 && (
          <ul className="pl-3.5 mt-1.5 space-y-1">
            {alert.moves.map((move) => (
              <li key={`${move.cusip}-${move.put_call}`} className="flex items-center gap-2 text-[12px]">
                <span className="text-ink-2 truncate">{holdingLabel(move)}</span>
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
  const [offset, setOffset] = useState(8)
  const { data } = useFilingAlerts()
  const markRead = useMarkAlertsRead()
  const unread = data?.unread ?? 0
  const alerts = data?.alerts ?? []
  const placement = PANEL_PLACEMENT[side]

  const close = () => {
    setOpen(false)
    if (unread > 0) markRead.mutate()
  }

  const onOpenChange = (next) => (next ? setOpen(true) : close())

  const measureOffset = (event) => {
    setOffset(panelOffset(panelLeft, event.currentTarget.getBoundingClientRect().right))
  }

  const bell = (
    <button
      type="button"
      onClick={measureOffset}
      aria-label={unread ? `Filing alerts, ${unread} unread` : 'Filing alerts'}
      title="Filing alerts"
      className="relative w-10 h-10 md:w-8 md:h-8 rounded-md md:border md:border-line text-ink-2 hover:text-ink hover:bg-hover flex items-center justify-center"
    >
      <Bell size={16} />
      {unread > 0 && (
        <span
          aria-hidden="true"
          className="absolute top-1 right-1 md:top-0 md:right-0 min-w-[16px] h-4 px-1 rounded-full bg-accent text-on-accent text-[11px] font-medium leading-4 text-center num"
        >
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  )

  return (
    <div className={`relative ${className}`}>
      <Popover
        trigger={bell}
        label="Filing alerts"
        open={open}
        onOpenChange={onOpenChange}
        side={placement.side}
        align={placement.align}
        sideOffset={offset}
        width={placement.width}
        className="p-0"
      >
        <div className="px-3 py-2 border-b border-line text-[12px] uppercase tracking-wider text-ink-3">
          New 13F filings
        </div>
        {alerts.length === 0 ? (
          <p className="px-3 py-4 text-[13px] text-ink-2">
            Nothing new from the investors you follow. Follow an investor to hear when they file.
          </p>
        ) : (
          <ul className="max-h-[60vh] overflow-y-auto divide-y divide-line">
            {alerts.map((alert) => (
              <AlertRow key={alert.id} alert={alert} onPick={close} />
            ))}
          </ul>
        )}
      </Popover>
    </div>
  )
}
