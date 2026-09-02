import { useEffect, useRef, useState } from 'react'
import { Check, ChevronDown } from 'lucide-react'

/** The toolbar controls the Research page is built from.
 *
 *  Bespoke rather than a shared UI component because nothing else in the app
 *  has a dropdown yet; if a second page needs one, this is what gets promoted
 *  into components/ui.jsx.
 */

export function TBtn({ active, onClick, children, title }) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      aria-pressed={active}
      className={`h-7 px-2.5 rounded text-[11.5px] font-medium transition-colors ${
        active ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
      }`}
    >
      {children}
    </button>
  )
}

export function Menu({ label, icon: Icon, children, width = 220, align = 'left' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    if (!open) return

    const onPointerDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false)
    }
    const onKeyDown = (e) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        className={`h-7 px-2.5 rounded text-[11.5px] font-medium flex items-center gap-1.5 transition-colors ${
          open ? 'bg-white/[0.09] text-zinc-100' : 'text-zinc-400 hover:text-zinc-200 hover:bg-white/[0.05]'
        }`}
      >
        {Icon ? <Icon size={12} /> : null}
        {label}
        <ChevronDown size={11} />
      </button>

      {open ? (
        <div
          role="menu"
          style={{ width, [align]: 0 }}
          className="absolute z-30 mt-1 rounded-lg border border-white/10 bg-zinc-900 shadow-[0_16px_40px_-12px_rgba(0,0,0,0.8)] p-1.5"
        >
          {children}
        </div>
      ) : null}
    </div>
  )
}

export function MenuRow({ checked, onClick, dot, children, right }) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="w-full flex items-center gap-2 px-2 h-8 rounded text-[12px] text-zinc-300 hover:bg-white/[0.06] hover:text-zinc-100"
    >
      {checked !== undefined ? (
        <span
          className={`w-3.5 h-3.5 rounded-[3px] border flex items-center justify-center shrink-0 ${
            checked ? 'bg-blue-500 border-blue-500' : 'border-zinc-600'
          }`}
        >
          {checked ? <Check size={10} className="text-white" /> : null}
        </span>
      ) : null}
      {dot ? <span className="w-2 h-0.5 rounded-full shrink-0" style={{ background: dot }} /> : null}
      <span className="flex-1 text-left truncate">{children}</span>
      {right ? <span className="text-[10.5px] text-zinc-500">{right}</span> : null}
    </button>
  )
}

export function MenuSeparator() {
  return <div className="h-px bg-white/[0.07] my-1" />
}

export function MenuLabel({ children }) {
  return <div className="px-2 pt-1 pb-1.5 text-[10px] uppercase tracking-wide text-zinc-600">{children}</div>
}
