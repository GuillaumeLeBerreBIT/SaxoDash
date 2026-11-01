import { useScrollToEnd } from '../../lib/useScrollToEnd'
import { changePct, fmtStatement, rowsWithData } from '../../lib/statements'
import { Move } from '../ui'

export default function StatementTable({ statement, periods, allPeriods }) {
  const rows = rowsWithData(statement, periods)
  const scroller = useScrollToEnd(periods.length, periods[0]?.period, periods.at(-1)?.period)
  if (!rows.length) return null

  return (
    <div ref={scroller} className="overflow-x-auto">
      <table aria-label={statement.label} className="w-full border-collapse text-[13.5px]">
        <thead>
          <tr className="text-[12px] text-ink-3">
            <th scope="col" className="sticky left-0 z-[1] bg-pane text-left font-medium h-[30px] pl-[18px] pr-4 whitespace-nowrap">
              {statement.label}
            </th>
            {periods.map((period) => (
              <th key={period.period} scope="col" className="text-right font-medium h-[30px] pl-4 last:pr-[18px] whitespace-nowrap">
                {period.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.key} className="border-t border-line">
              <th
                scope="row"
                className={`sticky left-0 z-[1] bg-pane text-left py-2.5 pl-[18px] pr-4 whitespace-nowrap ${
                  row.headline ? 'font-semibold text-ink' : 'font-normal text-ink-2'
                }`}
              >
                {row.label}
              </th>
              {periods.map((period) => {
                const change = row.headline ? changePct(allPeriods, period, statement.key, row.key) : null
                return (
                  <td key={period.period} className="text-right py-2.5 pl-4 last:pr-[18px] align-top whitespace-nowrap">
                    <span className={`block num ${row.headline ? 'font-semibold text-ink' : 'text-ink-2'}`}>
                      {fmtStatement(period[statement.key]?.[row.key])}
                    </span>
                    {change != null && <Move value={change} className="block text-[12px]" />}
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
