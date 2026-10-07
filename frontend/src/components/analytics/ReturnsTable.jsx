import { Card, CardHeader } from '../ui'
import { fmtPct, pctTone, pctToneClass } from '../../lib/format'
import { needsDaysNote } from '../../lib/analytics'

const ALPHA_BADGE = {
  positive: 'bg-emerald-500/10 text-emerald-400',
  negative: 'bg-red-500/10 text-red-400',
  neutral: 'bg-white/[0.05] text-zinc-500',
}

export default function ReturnsTable({ periods, benchmarkName }) {
  return (
    <Card padding={false}>
      <div className="px-5 pt-5 pb-3">
        <CardHeader title={`Returns vs ${benchmarkName}`} subtitle="Saxo account value change; deposits and withdrawals are not separated" />
      </div>
      <table className="w-full text-[var(--fig-sm)]">
        <thead>
          <tr className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 border-b border-white/[0.06]">
            <th className="px-3 md:px-5 py-2 text-left font-medium">Period</th>
            <th className="px-2 md:px-3 py-2 text-right font-medium">Portfolio</th>
            <th className="hidden md:table-cell px-2 md:px-3 py-2 text-right font-medium">{benchmarkName}</th>
            <th className="px-3 md:px-5 py-2 text-right font-medium">Alpha</th>
          </tr>
        </thead>
        <tbody>
          {periods.map((row) => (
            <tr key={row.label} className="border-b border-white/[0.05] last:border-0">
              <td className="px-3 md:px-5 py-2.5 text-zinc-300">{row.label}</td>
              <td className={`px-2 md:px-3 py-2.5 text-right num ${row.portfolio_pct != null ? pctToneClass(row.portfolio_pct, 1) : 'text-zinc-600'}`}>
                {fmtPct(row.portfolio_pct, { decimals: 1 })}
                {row.portfolio_pct == null && needsDaysNote(row.needs_days) && (
                  <div className="text-[var(--fig-2xs)] text-zinc-600">{needsDaysNote(row.needs_days)}</div>
                )}
              </td>
              <td className="hidden md:table-cell px-2 md:px-3 py-2.5 text-right num text-zinc-400">{fmtPct(row.benchmark_pct, { decimals: 1 })}</td>
              <td className="px-3 md:px-5 py-2.5 text-right num">
                {row.alpha_pct != null ? (
                  <span
                    className={`px-1.5 py-0.5 rounded ${ALPHA_BADGE[pctTone(row.alpha_pct, 1)]}`}
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
