export default function LensChips({ shelves }) {
  return (
    <nav aria-label="Lenses" className="min-w-0 flex flex-wrap gap-1.5 sm:flex-1">
      {shelves.map((shelf) => (
        <a
          key={shelf.key}
          href={`#shelf-${shelf.key}`}
          className="sd-raised bg-raised text-ink-2 hover:text-ink shrink-0 inline-flex h-11 md:h-7 items-center gap-1.5 rounded-lg px-[11px] text-[12px] font-semibold whitespace-nowrap transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus"
        >
          {shelf.short ?? shelf.title} <b className="num font-semibold text-ink">{shelf.total}</b>
        </a>
      ))}
    </nav>
  )
}
