import { Link } from 'react-router-dom'
import { CandlestickChart } from 'lucide-react'

import { chartHref } from '../lib/research'

export default function ChartLink({ symbol, instrument, className = '', onClick }) {
  return (
    <Link
      to={chartHref(symbol, instrument)}
      aria-label={`Open ${symbol} chart`}
      title="Open chart"
      onClick={onClick}
      className={`w-10 h-10 sm:w-6 sm:h-6 shrink-0 flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${className}`}
    >
      <CandlestickChart size={14} aria-hidden="true" />
    </Link>
  )
}
