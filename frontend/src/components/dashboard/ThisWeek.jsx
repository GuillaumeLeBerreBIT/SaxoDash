import { Link } from 'react-router-dom'

import { WEIGHT_CAP_PCT } from '../../lib/portfolioStats'
import { Card, Tag } from '../ui'
import AttentionBand from './AttentionBand'
import UpcomingEarnings from './UpcomingEarnings'

function CapBreach({ breaches }) {
  return (
    <Link to="/portfolio" className="flex items-center gap-3 min-h-11 py-2 -mx-2 px-2 rounded-lg hover:bg-hover">
      <Tag tone="warn">{breaches.length}</Tag>
      <span className="min-w-0 flex-1">
        <span className="block text-[13.5px] font-semibold text-ink">Above your {WEIGHT_CAP_PCT}% cap</span>
        <span className="block truncate text-[12px] text-ink-3 num">
          {breaches.map((p) => `${p.ticker} ${Number(p.weight).toFixed(1)}%`).join(' · ')}
        </span>
      </span>
    </Link>
  )
}

export default function ThisWeek({ attention, breaches, upcomingEarnings, className = '' }) {
  const needsYou = attention.length > 0 || breaches.length > 0
  return (
    <Card className={className} context="Needs you" dot={needsYou ? 'warn' : 'ok'} title="This week">
      {(attention.length > 0 || breaches.length === 0) && <AttentionBand items={attention} />}
      {breaches.length > 0 && (
        <div className={attention.length > 0 ? 'border-t border-line' : ''}>
          <CapBreach breaches={breaches} />
        </div>
      )}
      {upcomingEarnings != null && (
        <div className="mt-4 pt-3 border-t border-line">
          <UpcomingEarnings items={upcomingEarnings} />
        </div>
      )}
    </Card>
  )
}
