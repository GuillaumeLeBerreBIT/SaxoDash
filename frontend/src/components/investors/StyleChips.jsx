import { Tag } from '../ui'

export default function StyleChips({ styles }) {
  if (!styles?.length) return null
  return (
    <span className="flex flex-wrap gap-1">
      {styles.map((style) => <Tag key={style} tone="neutral">{style}</Tag>)}
    </span>
  )
}
