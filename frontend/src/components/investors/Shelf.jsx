import { Link } from 'react-router-dom'

import ShelfCards from '../ShelfCards'
import { Card } from '../ui'
import InvestorCard from './InvestorCard'
import StockSignalCard from './StockSignalCard'
import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit } from '../../lib/discover'
import { seeAllTarget } from '../../lib/investorHub'

const investorKey = (item) => item.slug
const stockKey = (item) => `${item.cusip}:${item.investors[0]?.slug ?? ''}`
const renderInvestor = (item) => <InvestorCard investor={item} />

const SHELF_CONTEXT = {
  following: 'Investors you follow',
  'convergent-buys': 'Bought by the most tracked funds',
  'most-sold': 'Sold by the most tracked funds',
  'new-bets': 'Largest new positions by weight',
  'just-filed': 'Newest 13F filings',
}

function SeeAll({ shelf, stocks }) {
  return (
    <Link to={seeAllTarget(shelf)} className="shrink-0 whitespace-nowrap text-[13px] font-semibold text-ink-2 hover:text-ink">
      See all{stocks ? null : <> <span className="num">{shelf.total}</span></>}
    </Link>
  )
}

export default function Shelf({ shelf }) {
  const [ref, width] = useWidth()
  const fit = cardsThatFit(width)
  const stocks = shelf.kind === 'stocks'
  return (
    <section aria-label={shelf.title}>
      <Card context={SHELF_CONTEXT[shelf.key]} title={shelf.title} right={<SeeAll shelf={shelf} stocks={stocks} />}>
        <div ref={ref}>
          <ShelfCards
            items={shelf.items}
            fit={fit}
            itemKey={stocks ? stockKey : investorKey}
            renderItem={stocks ? (item) => <StockSignalCard shelfKey={shelf.key} item={item} /> : renderInvestor}
          />
        </div>
      </Card>
    </section>
  )
}
