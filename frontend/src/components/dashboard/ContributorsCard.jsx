import { Bar, BarChart, Cell, ResponsiveContainer, XAxis, YAxis } from 'recharts'

import { Card, CardHeader, ChartPlaceholder } from '../ui'

export default function ContributorsCard({ contributors }) {
  if (!contributors || contributors.length === 0) {
    return (
      <Card>
        <CardHeader title="Contributors" subtitle="Share of total return" />
        <ChartPlaceholder height={200}>No contribution data yet</ChartPlaceholder>
      </Card>
    )
  }

  const top = contributors[0]
  const data = contributors.map((c) => ({ ticker: c.ticker, pp: Number(c.contribution_pp) }))

  return (
    <Card>
      <CardHeader title="Contributors" subtitle="Each holding's contribution to total return (pp)" />
      <div className="mt-4 h-[220px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ left: 8, right: 16 }}>
            <XAxis
              type="number" tick={{ fill: '#71717a', fontSize: 11 }} axisLine={false}
              tickLine={false} tickFormatter={(v) => `${v}`}
            />
            <YAxis
              type="category" dataKey="ticker" tick={{ fill: '#a1a1aa', fontSize: 11 }}
              axisLine={false} tickLine={false} width={56}
            />
            <Bar dataKey="pp" radius={[0, 3, 3, 0]} isAnimationActive={false}>
              {data.map((d) => (
                <Cell key={d.ticker} fill={d.pp >= 0 ? '#34d399' : '#f87171'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="mt-2 text-[11px] text-zinc-500">
        {top.ticker} drove {Math.round(top.share_of_gain_pct)}% of total return.
      </p>
    </Card>
  )
}
