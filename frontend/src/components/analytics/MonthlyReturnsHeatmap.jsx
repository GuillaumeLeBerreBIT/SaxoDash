import { Card } from '../ui'
import { fmtPct } from '../../lib/format'
import { PERFORMANCE_CAPS, performanceFill } from '../../lib/charts'
import { useChartColors } from '../../theme/useChartColors'
import ScaleLegend from '../heatmap/ScaleLegend'

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

function cellLabel(pct) {
  if (Math.abs(pct) < 0.05) return '0.0'
  return `${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1)}`
}

export default function MonthlyReturnsHeatmap({ monthlyReturns, className = '' }) {
  const c = useChartColors()
  const years = [...new Set(monthlyReturns.map((m) => m.year))].sort((a, b) => b - a)

  return (
    <Card
      className={className}
      context="Portfolio value, month over month"
      dot={years.length ? 'ok' : 'off'}
      title="Monthly returns"
      right={<ScaleLegend cap={PERFORMANCE_CAPS.month} />}
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px] border-separate" style={{ borderSpacing: 4 }}>
          <thead>
            <tr>
              <th className="w-12" />
              {MONTH_NAMES.map((m) => (
                <th key={m} className="text-[12px] text-ink-3 font-medium pb-0.5">{m}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {years.map((year) => {
              const rows = monthlyReturns.filter((m) => m.year === year)
              return (
                <tr key={year}>
                  <td className="text-[12px] font-semibold num text-ink pr-1">{year}</td>
                  {MONTH_NAMES.map((name, i) => {
                    const month = rows.find((r) => r.month === i + 1)
                    return (
                      <td
                        key={name}
                        className={`h-9 rounded-md text-center text-[12px] font-semibold num ${month ? 'text-ink' : 'text-ink-3'}`}
                        style={{ background: month ? performanceFill(month.pct, { cap: PERFORMANCE_CAPS.month, flat: 0 }, c) : 'transparent' }}
                        title={month ? `${name} ${year}: ${fmtPct(month.pct, { decimals: 1 })}` : ''}
                      >
                        {month ? cellLabel(month.pct) : ''}
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
