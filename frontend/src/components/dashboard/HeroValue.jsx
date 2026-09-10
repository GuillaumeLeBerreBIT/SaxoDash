import { Area, AreaChart, ResponsiveContainer } from 'recharts'

import { fmtEur, fmtPct } from '../../lib/format'
import { Card } from '../ui'

const PERIODS = [
  ['day', 'Day'],
  ['week', 'Week'],
  ['month', 'Month'],
  ['ytd', 'YTD'],
]

function DeltaPill({ label, delta }) {
  const known = delta && delta.pct != null
  const up = known && Number(delta.pct) >= 0
  return (
    <div className="flex flex-col">
      <span className="text-[10px] uppercase tracking-wide text-zinc-600">{label}</span>
      <span
        className={`text-[13px] num font-mono ${
          !known ? 'text-zinc-500' : up ? 'text-emerald-400' : 'text-red-400'
        }`}
      >
        {!known ? '—' : fmtPct(delta.pct, { decimals: 2 })}
      </span>
      {known && (
        <span className="text-[10px] num font-mono text-zinc-600">
          {fmtEur(delta.abs, { sign: true, decimals: 0 })}
        </span>
      )}
    </div>
  )
}

export default function HeroValue({ value, change, spark }) {
  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-6">
        <div>
          <div className="text-[11px] uppercase tracking-wider text-zinc-500 font-medium">Net worth</div>
          <div className="mt-1 text-[clamp(24px,3vw,34px)] font-semibold tracking-tight num font-mono text-zinc-50">
            {fmtEur(value.net_worth)}
          </div>
          <div className="mt-1 text-[12px] text-zinc-500 num font-mono">
            {fmtEur(value.portfolio)} invested · {fmtEur(value.bank)} bank
          </div>
        </div>
        {spark.length > 1 && (
          <div className="w-[160px] h-[44px] shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={spark} margin={{ top: 4, bottom: 4, left: 0, right: 0 }}>
                <defs>
                  <linearGradient id="heroSpark" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#60a5fa" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="#60a5fa" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <Area
                  type="monotone" dataKey="value" stroke="#60a5fa" strokeWidth={1.5}
                  fill="url(#heroSpark)" dot={false} isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
      <div className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap gap-6">
        {PERIODS.map(([key, label]) => (
          <DeltaPill key={key} label={label} delta={change?.[key]} />
        ))}
      </div>
      <p className="mt-3 text-[10px] text-zinc-600">
        Change is end-of-day, from the daily net-worth snapshot.
      </p>
    </Card>
  )
}
