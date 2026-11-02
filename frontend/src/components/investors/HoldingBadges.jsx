import { Tag } from '../ui'

export function OptionBadge({ putCall }) {
  if (!putCall) return null
  return <Tag tone="neutral">{putCall === 'PUT' ? 'Put' : 'Call'}</Tag>
}

export function YouBadge({ owned, watched }) {
  if (owned) return <Tag tone="held">You own</Tag>
  if (watched) return <Tag tone="neutral">Watchlist</Tag>
  return null
}

export function EarlierCusipBadge({ inherited }) {
  if (!inherited) return null
  return (
    <span title="Filed under an identifier the company has since replaced. The ticker is its successor's.">
      <Tag tone="neutral">Earlier CUSIP</Tag>
    </span>
  )
}
