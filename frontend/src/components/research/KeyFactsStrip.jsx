import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { Card, Skeleton } from '../ui'

function websiteLink(website) {
  try {
    const url = new URL(website)
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null
    return { href: url.href, host: url.hostname.replace(/^www\./, '') }
  } catch {
    return null
  }
}

function companyFacts(fundamentals) {
  if (!fundamentals) return []
  const site = websiteLink(fundamentals.website)
  return [
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
        <a href={site.href} target="_blank" rel="noopener noreferrer" className="text-ink hover:underline">
          {site.host}
        </a>
      ) : null,
    ],
  ]
}

function referenceFacts(details) {
  if (!details) return []
  return [
    ['Exchange', details.exchange_name || details.exchange],
    ['Currency', details.currency],
    ['ISIN', details.isin],
    ['Uic', details.uic],
    ['Lot size', details.lot_size],
    ['Asset type', details.asset_type],
  ]
}

export default function KeyFactsStrip({ fundamentals, details, detailsLoading = false, className = '' }) {
  const facts = [...companyFacts(fundamentals), ...referenceFacts(details)].filter(
    ([, value]) => value != null && value !== '',
  )
  if (!facts.length && !detailsLoading) return null

  return (
    <Card
      className={className}
      context={fundamentals ? 'Finnhub profile · Saxo reference data' : 'Saxo reference data'}
      dot="off"
      title="Company facts"
    >
      <dl>
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2 border-t border-line first:border-t-0">
            <dt className="text-[13px] text-ink-2 shrink-0">{label}</dt>
            <dd className="text-[13.5px] font-semibold num text-ink truncate text-right">{value}</dd>
          </div>
        ))}
      </dl>
      {detailsLoading && <Skeleton className="mt-2 h-4 w-2/3" />}
    </Card>
  )
}
