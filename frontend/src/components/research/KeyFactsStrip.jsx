import { fmtCompact, fmtNum, fmtPct } from '../../lib/format'
import { Panel, Skeleton } from '../ui'

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
    ['Lot size', details.lot_size],
  ]
}

export default function KeyFactsStrip({ fundamentals, details, detailsLoading = false, className = '', bare = false }) {
  const facts = [...companyFacts(fundamentals), ...referenceFacts(details)].filter(
    ([, value]) => value != null && value !== '',
  )
  if (!facts.length && !detailsLoading) return null

  return (
    <Panel
      bare={bare}
      className={className}
      context={fundamentals ? 'Finnhub profile · Saxo reference data' : 'Saxo reference data'}
      dot="off"
      title="Company facts"
    >
      <dl>
        {facts.map(([label, value]) => (
          <div key={label} className="flex items-baseline justify-between gap-3 py-2 border-t border-line first:border-t-0">
            <dt className="text-[13px] text-ink-2 shrink-0">{label}</dt>
            <dd title={typeof value === 'string' ? value : undefined} className="text-[13.5px] font-semibold num text-ink truncate text-right">
              {value}
            </dd>
          </div>
        ))}
      </dl>
      {detailsLoading && <Skeleton className="mt-2 h-4 w-2/3" />}
    </Panel>
  )
}
