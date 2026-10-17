import { activity, activityLabel } from '../../lib/congress'
import { researchHref } from '../../lib/research'
import { None, OwnershipLink } from '../investors/OwnershipLink'

export default function CongressActivity({ ticker, stock, windowDays }) {
  const traded = activity(stock)
  if (!traded) return <None />
  return (
    <OwnershipLink to={researchHref(ticker, 'congress')} label={activityLabel(stock, windowDays)}>
      {traded.holders ? `${traded.holders} holding` : `${traded.buyers} ↑ / ${traded.sellers} ↓`}
    </OwnershipLink>
  )
}
