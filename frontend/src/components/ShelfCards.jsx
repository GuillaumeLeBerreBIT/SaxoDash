export default function ShelfCards({ items, fit, itemKey, renderItem }) {
  if (fit == null) {
    return (
      <div className="flex gap-3 overflow-x-auto snap-x snap-mandatory pb-2 -mx-4 px-4 md:mx-0 md:px-0">
        {items.map((item) => <div key={itemKey(item)} className="w-56 shrink-0 snap-start">{renderItem(item)}</div>)}
      </div>
    )
  }
  return (
    <div className="grid gap-3" style={{ gridTemplateColumns: `repeat(${fit}, minmax(0, 1fr))` }}>
      {items.slice(0, fit).map((item) => <div key={itemKey(item)} className="min-w-0">{renderItem(item)}</div>)}
    </div>
  )
}
