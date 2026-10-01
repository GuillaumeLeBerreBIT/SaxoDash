import { healthNotice } from '../../lib/discover'
import { Alert } from '../ui'

export default function DiscoverHealth({ health, asOf }) {
  const notice = healthNotice(health, asOf)
  if (!notice) return null
  return <Alert tone={notice.tone}>{notice.text}</Alert>
}
