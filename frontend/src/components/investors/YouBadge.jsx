import { Badge } from '../ui'

export default function YouBadge({ owned, watched }) {
  if (owned)
    return (
      <Badge tone="zinc">You own</Badge>
    )
  if (watched)
    return (
      <Badge tone="zinc">You watch</Badge>
    )
  return null
}
