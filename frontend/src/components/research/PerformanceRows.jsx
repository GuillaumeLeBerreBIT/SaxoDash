import { Move } from '../ui'

export default function PerformanceRows({ returns }) {
  const known = returns.filter((row) => row.pct != null)
  if (!known.length) return null
  const widest = Math.max(...known.map((row) => Math.abs(row.pct)))

  return (
    <ul className="divide-y divide-line">
      {returns.map(({ key, pct }) => (
        <li key={key} className="grid grid-cols-[48px_88px_minmax(0,1fr)] items-center gap-x-3 py-2 text-[13px]">
          <span className="text-ink-2">{key}</span>
          {pct == null ? <span className="text-ink-3">—</span> : <Move value={pct} className="text-[14px] font-semibold" />}
          <span aria-hidden="true" className="h-1.5 rounded-full bg-track">
            {pct == null ? null : (
              <span
                data-testid={`bar-${key}`}
                className={`block h-full rounded-full ${pct < 0 ? 'bg-down' : 'bg-up'}`}
                style={{ width: `${widest ? (Math.abs(pct) / widest) * 100 : 0}%` }}
              />
            )}
          </span>
        </li>
      ))}
    </ul>
  )
}
