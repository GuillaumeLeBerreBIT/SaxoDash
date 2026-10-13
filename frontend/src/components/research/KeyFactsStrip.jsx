import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { Card } from '../ui'

function websiteLink(website) {
  try {
    const url = new URL(website)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return { href: url.href, host: url.hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
}

export default function KeyFactsStrip({ fundamentals }) {
  const site = websiteLink(fundamentals.website)
  const facts = [
    ['Market cap', fundamentals.market_cap == null ? null : fmtCompact(fundamentals.market_cap)],
    ['P/E', fundamentals.pe_ratio == null ? null : fmtNum(fundamentals.pe_ratio, 2)],
    ['EPS (TTM)', fundamentals.eps_ttm == null ? null : fmtNum(fundamentals.eps_ttm, 2)],
    ['Dividend yield', fundamentals.dividend_yield == null ? null : fmtPct(fundamentals.dividend_yield, { sign: false })],
    ['Listed since', fundamentals.ipo_date ? fundamentals.ipo_date.slice(0, 4) : null],
    ['Industry', fundamentals.industry || null],
    ['Country', fundamentals.country || null],
    [
      'Website',
      site ? (
        <a href={site.href} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:text-blue-300">
          {site.host}
        </a>
      ) : null,
    ],
  ].filter(([, value]) => value != null)
  if (!facts.length) return null

  return (
    <Card>
      <dl className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-3">
        {facts.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="text-[var(--fig-2xs)] uppercase tracking-wide text-zinc-500 font-medium">{label}</dt>
            <dd className="mt-1 text-[var(--fig-sm)] num font-mono text-zinc-100 truncate">{value}</dd>
          </div>
        ))}
      </dl>
    </Card>
  )
}
