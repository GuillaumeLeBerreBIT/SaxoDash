import { Link } from 'react-router-dom'
import { CandlestickChart } from 'lucide-react'

import { chartHref } from '../lib/research'

const SIZES = {
  sm: { box: 'sm:w-6 sm:h-6', icon: 14 },
  lg: { box: 'sm:w-8 sm:h-8', icon: 18 },
}

export default function ChartLink({ symbol, instrument, size = 'sm', className = '', onClick }) {
  const { box, icon } = SIZES[size]
  return (
    <Link
      to={chartHref(symbol, instrument)}
      aria-label={`Open ${symbol} chart`}
      title="Open chart"
      onClick={onClick}
      className={`w-10 h-10 ${box} shrink-0 flex items-center justify-center rounded text-ink-3 hover:text-ink hover:bg-hover focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${className}`}
    >
      <CandlestickChart size={icon} aria-hidden="true" />
    </Link>
  )
}
