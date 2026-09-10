import { useCompanyNews } from '../../api/queries'
import { Card, CardHeader } from '../ui'

const dayLabel = (iso) =>
  new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
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
  const { data, isLoading } = useCompanyNews(symbol)

  if (isLoading) {
    return (
      <Card>
        <CardHeader title="News" subtitle="From Finnhub" />
        <div className="mt-3 text-[12px] text-zinc-500">Loading…</div>
      </Card>
    )
  }

  if (!data?.available) {
    return (
      <Card>
        <CardHeader title="News" subtitle="From Finnhub" />
        <p className="mt-3 text-[12px] text-zinc-500">
          {data?.reason || `News is unavailable for ${symbol}.`}
        </p>
      </Card>
    )
  }

  if (data.items.length === 0) {
    return (
      <Card>
        <CardHeader title="News" subtitle="From Finnhub" />
        <p className="mt-3 text-[12px] text-zinc-500">No recent news for {symbol}.</p>
      </Card>
    )
  }

  return (
    <Card padding={false}>
      <div className="px-4 py-3 border-b border-white/[0.06]">
        <CardHeader title="News" subtitle="Company headlines, last 14 days · Finnhub" />
      </div>
      <div className="divide-y divide-white/[0.04]">
        {groupByDay(data.items).map((group) => (
          <div key={group.key} className="px-4 py-2.5">
            <div className="text-[10px] uppercase tracking-wide text-zinc-600 mb-1.5">{group.label}</div>
            <ul className="space-y-2">
              {group.items.map((item) => (
                <li key={item.id ?? item.url}>
                  <a
                    href={item.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[12.5px] text-zinc-100 hover:text-blue-300"
                  >
                    {item.headline}
                  </a>
                  <div className="text-[11px] text-zinc-500 mt-0.5">
                    <span className="num font-mono">{timeLabel(item.datetime)}</span>
                    {' · '}
                    {item.source}
                    {item.summary ? <span className="line-clamp-1"> — {item.summary}</span> : null}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </Card>
  )
}
