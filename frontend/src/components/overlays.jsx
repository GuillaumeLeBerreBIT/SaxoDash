import * as DialogPrimitive from '@radix-ui/react-dialog'
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu'
import * as PopoverPrimitive from '@radix-ui/react-popover'
import * as TooltipPrimitive from '@radix-ui/react-tooltip'
import { X } from 'lucide-react'

const SURFACE = 'sd-raised sd-overlay z-50 rounded-[10px] bg-raised text-ink'
const ITEM =
  'flex items-center gap-2 h-8 px-2 rounded-[7px] text-[13px] outline-none cursor-pointer select-none ' +
  'data-[highlighted]:bg-selected data-[highlighted]:text-ink data-[disabled]:opacity-50 data-[disabled]:pointer-events-none'

export function Dialog({ open, onOpenChange, title, children, width = 'min(420px,92vw)', placement = 'center', bare = false }) {
  const position = placement === 'top' ? 'top-[12vh]' : 'top-1/2 -translate-y-1/2'
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/55" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          style={{ width }}
          className={`sd-raised sd-overlay fixed left-1/2 -translate-x-1/2 z-50 max-w-[92vw] rounded-xl bg-raised text-ink outline-none overflow-hidden ${position}`}
        >
          {bare ? (
            <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
          ) : (
            <div className="flex items-center justify-between px-[18px] h-12 border-b border-line">
              <DialogPrimitive.Title className="text-[14px] font-semibold text-ink">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Close
                aria-label="Close"
                className="w-7 h-7 rounded-[7px] text-ink-3 hover:text-ink hover:bg-hover flex items-center justify-center"
              >
                <X size={14} />
              </DialogPrimitive.Close>
            </div>
          )}
          {bare ? children : <div className="p-[18px]">{children}</div>}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}

export function MenuRoot(props) {
  return <DropdownPrimitive.Root {...props} />
}

export function MenuTrigger(props) {
  return <DropdownPrimitive.Trigger {...props} />
}

export function MenuContent({ children, width, align = 'start', side = 'bottom', sideOffset = 4, className = '', onOpenAutoFocus }) {
  return (
    <DropdownPrimitive.Portal>
      <DropdownPrimitive.Content
        align={align}
        side={side}
        sideOffset={sideOffset}
        collisionPadding={8}
        onOpenAutoFocus={onOpenAutoFocus}
        style={width ? { width } : undefined}
        className={`${SURFACE} p-1.5 min-w-[8rem] max-h-[var(--radix-dropdown-menu-content-available-height)] overflow-y-auto ${className}`}
      >
        {children}
      </DropdownPrimitive.Content>
    </DropdownPrimitive.Portal>
  )
}

export function MenuItem({ onSelect, danger = false, children, className = '', ...rest }) {
  return (
    <DropdownPrimitive.Item
      onSelect={onSelect}
      {...rest}
      className={`${ITEM} ${danger ? 'text-down' : 'text-ink-2'} ${className}`}
    >
      {children}
    </DropdownPrimitive.Item>
  )
}

export function MenuSeparator() {
  return <DropdownPrimitive.Separator className="h-px bg-line my-1" />
}

export function MenuLabel({ children }) {
  return <DropdownPrimitive.Label className="px-2 pt-1 pb-1.5 text-[11px] uppercase tracking-wide text-ink-3">{children}</DropdownPrimitive.Label>
}

export function Menu({ trigger, items, align = 'end', width }) {
  return (
    <MenuRoot>
      <MenuTrigger asChild>{trigger}</MenuTrigger>
      <MenuContent align={align} width={width}>
        {items.map(({ label, onSelect, icon: Icon, danger }, index) => (
          <MenuItem key={`${index}:${label}`} onSelect={onSelect} danger={danger}>
            {Icon ? <Icon size={14} aria-hidden="true" /> : null}
            {label}
          </MenuItem>
        ))}
      </MenuContent>
    </MenuRoot>
  )
}

export function Popover({
  trigger,
  children,
  label,
  open,
  onOpenChange,
  align = 'end',
  side = 'bottom',
  sideOffset = 6,
  width,
  className = 'p-1.5',
  onCloseAutoFocus,
}) {
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <PopoverPrimitive.Trigger asChild>{trigger}</PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          aria-label={label}
          align={align}
          side={side}
          sideOffset={sideOffset}
          collisionPadding={8}
          onCloseAutoFocus={onCloseAutoFocus}
          style={width ? { width } : undefined}
          className={`${SURFACE} outline-none ${className}`}
        >
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  )
}

export function Tooltip({ content, children, side = 'top', className = '', open, onOpenChange }) {
  return (
    <TooltipPrimitive.Provider delayDuration={150}>
      <TooltipPrimitive.Root open={open} onOpenChange={onOpenChange}>
        <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
        <TooltipPrimitive.Portal>
          <TooltipPrimitive.Content
            side={side}
            sideOffset={8}
            collisionPadding={8}
            className={`${SURFACE} max-w-64 px-3 py-2 text-[12px] leading-snug text-ink-2 ${className}`}
          >
            {content}
          </TooltipPrimitive.Content>
        </TooltipPrimitive.Portal>
      </TooltipPrimitive.Root>
    </TooltipPrimitive.Provider>
  )
}
