import { Tile } from '../ui'

const AUTO_FIT = 'grid-cols-[repeat(auto-fit,minmax(160px,1fr))]'

export default function SummaryTiles({ label, tiles, columns = AUTO_FIT, className = '' }) {
  return (
    <ul aria-label={label} className={`grid gap-2 ${columns} ${className}`}>
      {tiles.map((tile) => (
        <Tile key={tile.label} listItem label={tile.label} value={tile.value} sub={tile.sub} tone={tile.tone} />
      ))}
    </ul>
  )
}
