import { Badge } from '../ui'

export default function OptionBadge({ putCall }) {
  if (!putCall) return null
  const label = putCall === 'CALL' ? 'Call' : putCall === 'PUT' ? 'Put' : null
  if (!label) return null
  return <Badge tone="zinc">{label}</Badge>
}
