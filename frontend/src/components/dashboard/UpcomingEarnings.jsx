import { Link } from 'react-router-dom'

import { fmtNum } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Card, CardHeader } from '../ui'

const SESSION = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }
const whenText = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)

export default function UpcomingEarnings({ items }) {
  if (items == null) return null
  return (
    <Card padding={false}>
      <div className="px-5 py-3 border-b border-white/[0.06]">
        <CardHeader title="Upcoming earnings" subtitle="Your holdings, next 2 weeks" />
      </div>
      {items.length === 0 ? (
        <p className="px-5 py-4 text-[12px] text-zinc-500">
          No holdings report in the next 2 weeks.
        </p>
      ) : (
        <div className="divide-y divide-white/[0.04]">
          {items.slice(0, 5).map((e) => (
            <div
              key={`${e.ticker}-${e.date}`}
              className="flex items-center justify-between gap-3 px-5 py-2.5"
            >
              <Link
                to={researchHref(e.ticker, 'earnings')}
                className="text-[12.5px] font-medium text-zinc-100 hover:text-blue-300"
              >
                {e.ticker}
              </Link>
              <div className="flex items-center gap-3 text-[11px] text-zinc-500">
                <span className="num font-mono">{e.date}</span>
                <span>{whenText(e.days_until)}</span>
                <span>{SESSION[e.session] || '—'}</span>
                <span className="num font-mono">est {fmtNum(e.eps_estimate, 2)}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  )
}
