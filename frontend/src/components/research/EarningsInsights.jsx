import { buildEarningsInsights } from '../../lib/earningsInsights'
import { Card, StatusDot } from '../ui'
import FundamentalsGate from './FundamentalsGate'

const DOT_TONE = { pos: 'ok', caution: 'warn', neutral: 'off' }

export default function EarningsInsights({ fundamentals, className = '' }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="What changed"
      fallback="Earnings trend data is unavailable for this symbol."
      className={className}
    >
      {(data) => {
        const insights = buildEarningsInsights(data.quarterly_trends)
        return (
          <Card className={className} context="Quarterly trend, from Finnhub" dot="warn" title="What changed">
            {insights.length === 0 ? (
              <p className="text-[13px] text-ink-3">Not enough quarterly history yet for trend commentary.</p>
            ) : (
              <ul>
                {insights.map((insight) => (
                  <li
                    key={insight.text}
                    className="flex items-start gap-2.5 py-2 border-t border-line first:border-t-0 first:pt-0 text-[13.5px] text-ink"
                  >
                    <StatusDot tone={DOT_TONE[insight.tone] ?? 'off'} className="mt-[6px]" />
                    {insight.text}
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )
      }}
    </FundamentalsGate>
  )
}
