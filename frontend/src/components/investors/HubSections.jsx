import { Link } from 'react-router-dom'

import { useBrowse } from '../../api/queries'
import { browseQuery } from '../../lib/discoverBrowse'
import { fmtNum } from '../../lib/format'
import { copyLine, flowLine, personSentence } from '../../lib/investorsBrief'
import { fmtUsdCompact, quarterLabel } from '../../lib/investors'
import { researchHref } from '../../lib/research'
import StockLogo from '../StockLogo'
import { Card } from '../ui'
import ActionBadge from '../verdicts/ActionBadge'
import PriceBar from '../verdicts/PriceBar'
import FollowButton from './FollowButton'
import { LatestLine, TopLogos } from './InvestorCard'
import InvestorAvatar from './InvestorAvatar'

const FLOW_ROWS = 5

function PersonCard({ investor, held }) {
  const copy = copyLine(investor)
  return (
    <article data-testid="person-card" className="relative flex min-w-0 flex-col gap-3.5 rounded-[14px] bg-pane p-5">
      <div className="flex items-center gap-3.5">
        <InvestorAvatar name={investor.name} photo={investor.photo_url} logo={investor.logo_url} size={48} />
        <div className="flex min-w-0 flex-1 flex-col">
          <Link
            to={`/investors/${investor.slug}`}
            className="truncate text-[17px] font-bold text-ink after:absolute after:inset-0 after:rounded-[14px] focus-visible:outline-none focus-visible:after:outline-2 focus-visible:after:outline-focus"
          >
            {investor.name}
          </Link>
          <span className="truncate text-[13px] text-ink-3 num">
            {`${investor.firm !== investor.name ? `${investor.firm} · ` : ''}${fmtUsdCompact(investor.total_value)} in ${fmtNum(investor.positions)} stocks`}
          </span>
        </div>
        <div className="relative z-10">
          <FollowButton investor={investor} />
        </div>
      </div>
      <p className="text-[14px] leading-relaxed text-ink-2">{personSentence(investor, held) || <LatestLine investor={investor} />}</p>
      <div className="relative z-10 flex items-center gap-2.5">
        <TopLogos holdings={investor.top_holdings} />
        <span className="text-[13px] text-ink-3">Biggest holdings</span>
      </div>
      <div className="mt-auto flex items-center justify-between gap-3 border-t border-line pt-3 text-[13px]">
        <span className="text-ink-3 num">{copy ?? <LatestLine investor={investor} />}</span>
        <span className="whitespace-nowrap font-semibold text-ink">Open profile →</span>
      </div>
    </article>
  )
}

export function Following({ investors, held }) {
  if (!investors.length) return null
  return (
    <section aria-label="People you follow" className="flex flex-col gap-3">
      <h2 className="text-[20px] font-bold text-ink">People you follow</h2>
      <div className="grid grid-cols-1 gap-[var(--sd-gap,12px)] md:grid-cols-2">
        {investors.map((investor) => (
          <PersonCard key={investor.slug} investor={investor} held={held} />
        ))}
      </div>
    </section>
  )
}

function FlowRow({ item, field, stock, held }) {
  return (
    <li className="border-t border-line first:border-t-0">
      <Link
        to={researchHref(item.ticker, 'overview')}
        className="grid grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-3 py-3 hover:bg-hover md:grid-cols-[32px_minmax(0,1fr)_120px_120px]"
      >
        <StockLogo ticker={item.ticker} label={item.issuer} size={32} />
        <span className="flex min-w-0 flex-col">
          <span className="truncate text-[14px] font-bold text-ink">{stock?.name ?? item.ticker}</span>
          <span className="truncate text-[12px] text-ink-3 num">{flowLine(item, field, held.has(item.ticker))}</span>
        </span>
        <span className="hidden md:block">
          {stock ? <PriceBar price={stock.last_close} cheapBelow={stock.cheap_below} expensiveAbove={stock.expensive_above} labels={false} /> : null}
        </span>
        <span className="text-right">
          <ActionBadge verdict={stock ?? null} />
        </span>
      </Link>
    </li>
  )
}

function Flow({ title, sub, items, field, stocks, held }) {
  return (
    <Card title={title} className="min-w-0">
      <p className="-mt-2 mb-2 text-[13px] text-ink-3">{sub}</p>
      <ul>
        {items.map((item) => (
          <FlowRow key={item.cusip} item={item} field={field} stock={stocks.get(item.ticker)} held={held} />
        ))}
      </ul>
    </Card>
  )
}

export function FundFlows({ bought, sold, held, hub }) {
  const shown = [...bought.slice(0, FLOW_ROWS), ...sold.slice(0, FLOW_ROWS)].filter((item) => item.ticker)
  const tickers = [...new Set(shown.map((item) => item.ticker))]
  const { data } = useBrowse(browseQuery({}, { tickers, limit: 60 }), { enabled: tickers.length > 0 })
  const stocks = new Map((data?.stocks ?? []).map((stock) => [stock.ticker, stock]))
  if (!bought.length && !sold.length) return null
  const when = hub?.quarter ? `in ${quarterLabel(hub.quarter)} (${hub.filed} of ${hub.tracked} filed)` : 'last quarter'
  return (
    <div data-testid="bought-and-sold" className="grid grid-cols-1 items-stretch gap-[var(--sd-gap,12px)] min-[1100px]:grid-cols-2">
      {bought.length ? (
        <Flow title="What funds bought" sub={`Most tracked funds adding ${when}, with what the rules say today`} items={bought.slice(0, FLOW_ROWS).filter((item) => item.ticker)} field="bought" stocks={stocks} held={held} />
      ) : null}
      {sold.length ? (
        <Flow title="What funds sold" sub={`Most tracked funds reducing or closing ${when}`} items={sold.slice(0, FLOW_ROWS).filter((item) => item.ticker)} field="sold" stocks={stocks} held={held} />
      ) : null}
    </div>
  )
}
