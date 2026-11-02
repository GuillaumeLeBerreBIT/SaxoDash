import { Move } from '../ui'

export default function PerformanceTiles({ returns }) {
  if (!returns.some((row) => row.pct != null)) return null

  return (
    <ul className="grid grid-cols-3 gap-2">
      {returns.map(({ key, pct }) => (
        <li key={key} className="bg-tile rounded-[10px] px-3 py-2.5 min-w-0">
          <div className="text-[12px] text-ink-3">{key}</div>
          <Move value={pct} className="block mt-1 text-[17px] font-bold" />
        </li>
      ))}
    </ul>
  )
}
