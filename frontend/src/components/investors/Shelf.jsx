import { Link } from 'react-router-dom'

import ShelfCards from '../ShelfCards'
import InvestorCard from './InvestorCard'
import StockSignalCard from './StockSignalCard'
import { useWidth } from '../../lib/chartGeometry'
import { cardsThatFit } from '../../lib/discover'
import { seeAllTarget } from '../../lib/investorHub'

const investorKey = (item) => item.slug
const stockKey = (item) => `${item.cusip}:${item.investors[0]?.slug ?? ''}`
const renderInvestor = (item) => <InvestorCard investor={item} />

export default function Shelf({ shelf }) {
  const [ref, width] = useWidth()
  const fit = cardsThatFit(width)
  const headingId = `investor-shelf-${shelf.key}`
  const stocks = shelf.kind === 'stocks'
  return (
    <section ref={ref} aria-labelledby={headingId} className="space-y-2">
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={headingId} className="text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h2>
        <Link to={seeAllTarget(shelf)} className="shrink-0 whitespace-nowrap text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
          See all{stocks ? null : <> <span className="num">{shelf.total}</span></>}
        </Link>
      </div>
      <ShelfCards
        items={shelf.items}
        fit={fit}
        itemKey={stocks ? stockKey : investorKey}
        renderItem={stocks ? (item) => <StockSignalCard shelfKey={shelf.key} item={item} /> : renderInvestor}
      />
    </section>
  )
}
