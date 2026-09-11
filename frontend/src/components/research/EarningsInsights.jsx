import { buildEarningsInsights } from '../../lib/earningsInsights'
import { Card, CardHeader } from '../ui'
import FundamentalsGate from './FundamentalsGate'

const TONE_DOT = { pos: 'bg-emerald-400', neutral: 'bg-zinc-500', caution: 'bg-amber-400' }

export default function EarningsInsights({ fundamentals }) {
  return (
    <FundamentalsGate
      fundamentals={fundamentals}
      title="What changed"
      fallback="Earnings trend data is unavailable for this symbol."
    >
      {(data) => {
        const insights = buildEarningsInsights(data.quarterly_trends)
        return (
          <Card>
            <CardHeader title="What changed" subtitle="Quarterly trend, from Finnhub" />
            {insights.length === 0 ? (
              <p className="mt-3 text-[12px] text-zinc-500">
                Not enough quarterly history yet for trend commentary.
              </p>
            ) : (
              <ul className="mt-3 space-y-2">
                {insights.map((insight) => (
                  <li key={insight.text} className="flex items-start gap-2 text-[12.5px] text-zinc-300">
                    <span className={`mt-1.5 w-1.5 h-1.5 rounded-full shrink-0 ${TONE_DOT[insight.tone]}`} />
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
