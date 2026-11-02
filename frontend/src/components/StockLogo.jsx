import { InstrumentLogo, LetterAvatar } from './ui'

export default function StockLogo({ ticker, label, size = 20, className = '' }) {
  return (
    <InstrumentLogo
      symbol={ticker}
      size={size}
      className={className}
      fallback={<LetterAvatar symbol={label ?? ticker} size={size} chars={2} className={`rounded-full ${className}`} />}
    />
  )
}
