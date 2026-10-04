import { Link } from 'react-router-dom'

import { shelfNote, stockCount } from '../../lib/discover'
import { InfoTip } from '../ui'

function splitLastWord(text) {
  const at = text.lastIndexOf(' ')
  return at < 0 ? ['', text] : [text.slice(0, at), text.slice(at + 1)]
}

export default function ShelfHeader({ shelf, shown }) {
  const [head, tail] = splitLastWord(shelf.subtitle ?? '')
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h3 id={`shelf-${shelf.key}`} className="scroll-mt-4 text-[var(--fig-md)] font-semibold text-zinc-100">{shelf.title}</h3>
        <p className="text-[var(--fig-xs)] text-zinc-500">
          <span className="num whitespace-nowrap">{stockCount(shelf.total)}</span>
          <span aria-hidden="true" className="whitespace-nowrap">{' · '}</span>
          {head ? `${head} ` : null}
          <span className="whitespace-nowrap">
            {tail}
            <span className="ml-1 inline-flex align-middle">
              <InfoTip label={`About ${shelf.title}`}>{shelfNote(shelf, shown)}</InfoTip>
            </span>
          </span>
        </p>
      </div>
      {shelf.total > 0 ? (
        <Link to={`/discover/${shelf.key}`} className="shrink-0 whitespace-nowrap text-[var(--fig-xs)] text-blue-400 hover:text-blue-300">
          See all <span className="num">{shelf.total}</span>
        </Link>
      ) : null}
    </div>
  )
}
