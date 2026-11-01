import { Link } from 'react-router-dom'

import { fmtDate, fmtNum } from '../../lib/format'
import { researchHref } from '../../lib/research'
import { Tag } from '../ui'

const SESSION = { bmo: 'Before open', amc: 'After close', dmh: 'During hours' }
const whenText = (d) => (d === 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`)

export default function UpcomingEarnings({ items }) {
  if (items == null) return null
  return (
    <section aria-labelledby="upcoming-earnings">
      <h3 id="upcoming-earnings" className="text-[14px] font-bold text-ink">Upcoming earnings</h3>
      <p className="text-[12px] text-ink-3">Your holdings, next 2 weeks</p>
      {items.length === 0 ? (
        <p className="mt-2 text-[13px] text-ink-3">No holdings report in the next 2 weeks.</p>
      ) : (
        <ul className="mt-1">
          {items.slice(0, 5).map((e) => (
            <li key={`${e.ticker}-${e.date}`} className="border-t border-line first:border-t-0">
              <Link
                to={researchHref(e.ticker, 'earnings')}
                className="flex items-center gap-3 min-h-11 py-2 -mx-2 px-2 rounded-lg hover:bg-hover"
              >
                <Tag tone="earn">E</Tag>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13.5px] font-semibold text-ink">{e.ticker}</span>
                  <span className="block text-[12px] text-ink-3 num">
                    <span>{fmtDate(e.date)}</span> · {whenText(e.days_until)} · {SESSION[e.session] || '—'}
                  </span>
                </span>
                <span className="text-[12px] text-ink-2 num whitespace-nowrap">est {fmtNum(e.eps_estimate, 2)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
