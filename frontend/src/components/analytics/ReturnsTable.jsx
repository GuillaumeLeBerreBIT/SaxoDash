import { Card, CardHeader } from '../ui'
import { fmtPct } from '../../lib/format'

const pctTone = (v) => (v >= 0 ? 'text-emerald-400' : 'text-red-400')

export default function ReturnsTable({ periods, benchmarkName }) {
  return (
    <Card padding={false}>
      <div className="px-5 pt-5 pb-3">
        <CardHeader title={`Returns vs ${benchmarkName}`} subtitle="Time-weighted, from portfolio-value history" />
      </div>
      <table className="w-full text-[12.5px]">
        <thead>
          <tr className="text-[10.5px] uppercase tracking-wide text-zinc-500 border-b border-white/[0.06]">
            <th className="px-5 py-2 text-left font-medium">Period</th>
            <th className="px-3 py-2 text-right font-medium">Portfolio</th>
            <th className="px-3 py-2 text-right font-medium">{benchmarkName}</th>
            <th className="px-5 py-2 text-right font-medium">Alpha</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((row) => (
            <tr key={row.label} className="border-b border-white/[0.05] last:border-0">
              <td className="px-5 py-2.5 text-zinc-300">{row.label}</td>
              <td className={`px-3 py-2.5 text-right num ${row.portfolio_pct != null ? pctTone(row.portfolio_pct) : 'text-zinc-600'}`}>
                {fmtPct(row.portfolio_pct, { decimals: 1 })}
              </td>
              <td className="px-3 py-2.5 text-right num text-zinc-400">{fmtPct(row.benchmark_pct, { decimals: 1 })}</td>
              <td className="px-5 py-2.5 text-right num">
                {row.alpha_pct != null ? (
                  <span
                    className={`px-1.5 py-0.5 rounded ${
                      row.alpha_pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
                    }`}
                  >
                    {fmtPct(row.alpha_pct, { decimals: 1 })}
                  </span>
                ) : (
                  <span className="text-zinc-600">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}
