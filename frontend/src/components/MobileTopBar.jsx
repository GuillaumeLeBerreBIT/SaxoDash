import { LineChart, Search } from 'lucide-react'

export default function MobileTopBar({ onOpenPalette }) {
  return (
    <header className="md:hidden sticky top-0 z-20 h-12 flex items-center justify-between px-4 border-b border-white/[0.06] bg-zinc-950">
      <div className="flex items-center gap-2.5">
        <div className="w-7 h-7 rounded-md bg-blue-500/15 border border-blue-500/30 flex items-center justify-center text-blue-400 shrink-0">
          <LineChart size={15} strokeWidth={2} />
        </div>
        <span className="text-[var(--fig-md)] font-medium tracking-tight text-zinc-50">SaxoDash</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onOpenPalette}
          aria-label="Search"
          className="w-10 h-10 rounded-md text-zinc-400 hover:text-zinc-100 hover:bg-zinc-800/60 flex items-center justify-center"
        >
          <Search size={18} />
        </button>
      </div>
    </header>
  )
}
