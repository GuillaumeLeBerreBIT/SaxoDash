import { fmtPct, pctToneClass } from '../../lib/format'
import { useScrollToEnd } from '../../lib/useScrollToEnd'
import { changePct, fmtStatement, rowsWithData } from '../../lib/statements'

export default function StatementTable({ statement, periods, allPeriods }) {
  const rows = rowsWithData(statement, periods)
  const scroller = useScrollToEnd(periods.length, periods[0]?.period, periods.at(-1)?.period)
  if (!rows.length) return null

  return (
    <div ref={scroller} className="overflow-x-auto">
      <table className="w-full border-collapse text-[var(--fig-xs)]">
        <thead>
          <tr className="text-zinc-500">
            <th scope="col" className="sticky left-0 bg-zinc-900 text-left font-medium py-2 pr-4 whitespace-nowrap">
              {statement.label}
            </th>
            {periods.map((period) => (
              <th key={period.period} scope="col" className="text-right font-medium py-2 pl-4 whitespace-nowrap">
                {period.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-white/[0.06]">
              <th
                scope="row"
                className={`sticky left-0 bg-zinc-900 text-left font-normal py-2 pr-4 whitespace-nowrap ${
                  row.headline ? 'text-zinc-100' : 'text-zinc-400'
                }`}
              >
                {row.label}
              </th>
              {periods.map((period) => {
                const change = row.headline ? changePct(allPeriods, period, statement.key, row.key) : null
                return (
                  <td key={period.period} className="text-right py-2 pl-4 align-top whitespace-nowrap">
                    <span className={`block num font-mono ${row.headline ? 'text-zinc-100' : 'text-zinc-300'}`}>
                      {fmtStatement(period[statement.key]?.[row.key])}
                    </span>
                    {change != null && (
                      <span className={`block num font-mono text-[var(--fig-2xs)] ${pctToneClass(change)}`}>
                        {fmtPct(change)}
                      </span>
                    )}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
