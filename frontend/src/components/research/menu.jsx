import { Check, ChevronDown } from 'lucide-react'

import { MenuContent, MenuItem, MenuLabel as OverlayMenuLabel, MenuRoot, MenuSeparator as OverlayMenuSeparator, MenuTrigger } from '../overlays'

export function Menu({ label, icon: Icon, children, width = 220, align = 'left', side = 'bottom' }) {
  const rail = side === 'right'
  const idle = 'text-ink-2 hover:text-ink hover:bg-hover'
  const openTone = 'data-[state=open]:bg-selected data-[state=open]:text-ink'

  return (
    <MenuRoot modal={false}>
      <MenuTrigger
        aria-label={rail ? label : undefined}
        title={rail ? label : undefined}
        className={
          rail
            ? `w-9 h-9 rounded flex items-center justify-center transition-colors ${idle} ${openTone}`
            : `h-7 px-2.5 rounded text-[12px] font-medium flex items-center gap-1.5 transition-colors ${idle} ${openTone}`
        }
      >
        {rail ? (
          <Icon size={16} />
        ) : (
          <>
            {Icon ? <Icon size={12} /> : null}
            {label}
            <ChevronDown size={11} />
          </>
        )}
      </MenuTrigger>
      <MenuContent
        width={width}
        side={rail ? 'right' : 'bottom'}
        align={rail ? 'start' : align === 'right' ? 'end' : 'start'}
        sideOffset={rail ? 8 : 4}
      >
        {children}
      </MenuContent>
    </MenuRoot>
  )
}

export function MenuRow({ checked, onClick, dot, children, right }) {
  return (
    <MenuItem
      onSelect={(event) => {
        event.preventDefault()
        onClick?.()
      }}
      className="w-full"
    >
      {checked !== undefined ? (
        <span
          className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${
            checked ? 'bg-accent border-accent' : 'border-line-input'
          }`}
        >
          {checked ? <Check size={10} className="text-on-accent" /> : null}
        </span>
      ) : null}
      {dot ? <span className="w-2 h-0.5 rounded-full shrink-0" style={{ background: dot }} /> : null}
      <span className="flex-1 text-left truncate">{children}</span>
      {right ? <span className="text-[11px] text-ink-3">{right}</span> : null}
    </MenuItem>
  )
}

export function MenuSeparator() {
  return <OverlayMenuSeparator />
}

export function MenuLabel({ children }) {
  return <OverlayMenuLabel>{children}</OverlayMenuLabel>
}
