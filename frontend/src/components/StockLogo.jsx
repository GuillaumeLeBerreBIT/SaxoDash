import { InstrumentLogo, LetterAvatar } from './ui'

export default function StockLogo({ ticker, label, size = 20 }) {
  return (
    <InstrumentLogo
      symbol={ticker}
      size={size}
      className="rounded"
      fallback={<LetterAvatar symbol={label ?? ticker} size={size} />}
    />
  )
}
