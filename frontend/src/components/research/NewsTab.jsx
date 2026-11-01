import { useState } from 'react'

import { useCompanyNews } from '../../api/queries'
import { fmtDayMonth } from '../../lib/format'
import { Button, Card, Skeleton } from '../ui'

const NEWS_PAGE = 10

const dayLabel = fmtDayMonth
const timeLabel = (iso) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })

function groupByDay(items) {
  const groups = []
  let current = null
  for (const item of items) {
    const key = new Date(item.datetime).toDateString()
    if (!current || current.key !== key) {
      current = { key, label: dayLabel(item.datetime), items: [] }
      groups.push(current)
    }
    current.items.push(item)
  }
  return groups
}

export default function NewsTab({ symbol }) {
  const [shown, setShown] = useState(NEWS_PAGE)
  const { data, isLoading } = useCompanyNews(symbol)

  if (isLoading) {
    return (
      <Card context="From Finnhub" dot="off" title="News">
        <div className="space-y-2">
          <Skeleton className="h-4 w-3/4" />
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
        </div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card context="From Finnhub" dot="off" title="News">
        <p className="text-[13px] text-ink-3">
          {data?.reason || `News is unavailable for ${symbol}.`}
        </p>
      </Card>
    )
  }

  if (data.items.length === 0) {
    return (
      <Card context="From Finnhub" dot="off" title="News">
        <p className="text-[13px] text-ink-3">No recent news for {symbol}.</p>
      </Card>
    )
  }

  return (
    <Card context="Finnhub company news · last 14 days, newest first" dot="ok" title="News">
      {groupByDay(data.items.slice(0, shown)).map((group) => (
        <section key={group.key} className="pt-3 first:pt-0">
          <h3 className="text-[12px] font-medium text-ink-3 num">{group.label}</h3>
          <ul>
            {group.items.map((item) => (
              <li key={item.id ?? item.url} className="py-2.5 border-t border-line first:border-t-0">
                <a
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[14px] font-semibold text-ink hover:underline [text-wrap:pretty]"
                >
                  {item.headline}
                </a>
                {item.summary ? (
                  <p className="mt-0.5 max-w-[80ch] text-[13px] text-ink-2 line-clamp-2">{item.summary}</p>
                ) : null}
                <div className="mt-0.5 text-[12px] text-ink-3">
                  <span className="num">{timeLabel(item.datetime)}</span>
                  {' · '}
                  {item.source}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
      {data.items.length > shown ? (
        <Button size="sm" className="mt-3" onClick={() => setShown((n) => n + NEWS_PAGE)}>
          Show more ({data.items.length - shown})
        </Button>
      ) : null}
    </Card>
  )
}
