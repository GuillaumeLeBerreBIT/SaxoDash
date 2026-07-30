import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts'
import { fmtEur } from '../lib/format'
import { chartTooltipProps } from '../lib/charts'
import { toAccountBreakdownData } from '../lib/accounts'
import { Card, CardHeader } from './ui'

export default function AccountBreakdownChart({ accounts }) {
  const data = toAccountBreakdownData(accounts)
  const total = data.reduce((sum, d) => sum + d.value, 0)

  return (
    <Card>
      <CardHeader title="Balance by account" subtitle="Share of total balance" />
      <div className="mt-3 h-[200px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="name"
              innerRadius={55}
              outerRadius={85}
              paddingAngle={2}
              stroke="#18181b"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d, i) => (
                <Cell key={i} fill={d.color} />
              ))}
            </Pie>
            <Tooltip {...chartTooltipProps} formatter={(v, n) => [fmtEur(v), n]} />
          </PieChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-1 gap-y-2 mt-3 pt-4 border-t border-zinc-800">
        {data.map((d, i) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0
          return (
            <div key={i} className="flex items-center gap-2 text-[12px]">
              <span className="w-2 h-2 rounded-full shrink-0" style={{ background: d.color }} />
              <span className="text-zinc-300 font-medium">{d.name}</span>
              <span className="ml-auto text-zinc-500 num font-mono">{fmtEur(d.value)}</span>
              <span className="text-zinc-600 num font-mono w-12 text-right">{pct.toFixed(1)}%</span>
            </div>
          )
        })}
      </div>
    </Card>
  )
}
