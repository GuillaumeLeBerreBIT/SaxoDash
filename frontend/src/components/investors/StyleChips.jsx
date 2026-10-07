import { Badge } from '../ui'

export default function StyleChips({ styles }) {
  if (!styles?.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {styles.map((style) => <Badge key={style}>{style}</Badge>)}
    </span>
  )
}
