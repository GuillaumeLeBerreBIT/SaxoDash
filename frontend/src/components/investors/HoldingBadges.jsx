import { Badge } from '../ui'

export function OptionBadge({ putCall }) {
  if (!putCall) return null
  return <Badge tone="zinc">{putCall === 'PUT' ? 'Put' : 'Call'}</Badge>
}

export function YouBadge({ owned, watched }) {
  if (owned) return <Badge tone="blue">You own</Badge>
  if (watched) return <Badge tone="zinc">Watchlist</Badge>
  return null
}

export function EarlierCusipBadge({ inherited }) {
  if (!inherited) return null
  return (
    <span title="Filed under an identifier the company has since replaced. The ticker is its successor's.">
      <Badge tone="zinc">Earlier CUSIP</Badge>
    </span>
  )
}
