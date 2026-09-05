import { Card, CardHeader } from '../ui'
import { fmtPct } from '../../lib/format'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

// Same red/green scale as the design, but one series - there's no benchmark
// row to compare against yet.
function cellStyle(pct) {
  if (pct == null) return { background: 'rgba(255,255,255,0.02)' }
  const intensity = Math.min(1, Math.abs(pct) / 9)
  return {
    background: pct >= 0
      ? `rgba(38,161,123,${0.12 + intensity * 0.65})`
      : `rgba(229,72,77,${0.12 + intensity * 0.65})`,
  }
}

export default function MonthlyReturnsHeatmap({ monthlyReturns }) {
  const years = [...new Set(monthlyReturns.map((m) => m.year))].sort((a, b) => b - a)

  return (
    <Card>
      <CardHeader title="Monthly returns" subtitle="Portfolio value, month over month" />
      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-separate" style={{ borderSpacing: 3 }}>
          <thead>
            <tr>
              <th className="w-10" />
              {MONTH_NAMES.map((m) => (
                <th key={m} className="text-[10px] text-zinc-500 font-medium pb-0.5">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const rows = monthlyReturns.filter((m) => m.year === year)
              return (
                <tr key={year}>
                  <td className="text-[11px] num text-zinc-400 pr-1">{year}</td>
                  {MONTH_NAMES.map((_, i) => {
                    const month = rows.find((r) => r.month === i + 1)
                    return (
                      <td
                        key={i}
                        className="h-7 rounded text-center text-[10.5px] num text-zinc-100"
                        style={cellStyle(month?.pct)}
                        title={month ? `${MONTH_NAMES[i]} ${year}: ${fmtPct(month.pct, { decimals: 1 })}` : ''}
                      >
                        {month ? month.pct.toFixed(1) : ''}
                      </td>
                    )
                  })}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}
