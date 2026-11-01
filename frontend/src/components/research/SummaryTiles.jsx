const TONES = { up: 'text-up', down: 'text-down' }

const AUTO_FIT = 'grid-cols-[repeat(auto-fit,minmax(160px,1fr))]'

export default function SummaryTiles({ label, tiles, columns = AUTO_FIT, className = '' }) {
  return (
    <ul aria-label={label} className={`grid gap-2 ${columns} ${className}`}>
      {tiles.map((tile) => (
        <li key={tile.label} className="bg-tile rounded-[10px] px-3.5 py-3 min-w-0">
          <dl>
            <dt className="text-[12px] text-ink-3">{tile.label}</dt>
            <dd
              className={`mt-1 text-[20px] font-bold tracking-[-0.01em] num whitespace-nowrap ${
                tile.value == null ? 'text-ink-3' : TONES[tile.tone] || 'text-ink'
              }`}
            >
              {tile.value ?? '—'}
            </dd>
            {tile.sub ? <dd className="mt-0.5 text-[12px] text-ink-2 num">{tile.sub}</dd> : null}
          </dl>
        </li>
      ))}
    </ul>
  )
}
