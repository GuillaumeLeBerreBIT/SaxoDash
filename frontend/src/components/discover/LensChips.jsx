export default function LensChips({ shelves }) {
  return (
    <nav aria-label="Lenses" className="min-w-0 flex gap-2 overflow-x-auto whitespace-nowrap pb-1">
      {shelves.map((shelf) => (
        <a
          key={shelf.key}
          href={`#shelf-${shelf.key}`}
          className="shrink-0 inline-flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] px-2.5 text-[var(--fig-xs)] text-zinc-300 hover:bg-white/[0.05] focus-visible:outline focus-visible:outline-2 focus-visible:outline-blue-500"
        >
          {shelf.short} <span className="num text-zinc-500">{shelf.total}</span>
        </a>
      ))}
    </nav>
  )
}
