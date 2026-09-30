import { writeFileSync } from 'node:fs'
import { relativeVolume, rsi, sma } from '../src/lib/indicators.js'

const bars = Array.from({ length: 300 }, (_, i) => {
  const close = 100 + 10 * Math.sin(i / 7) + i * 0.1
  return {
    date: new Date(Date.UTC(2025, 0, 1) + i * 86_400_000).toISOString().slice(0, 10),
    open: close - 0.5,
    high: close + 1.5,
    low: close - 1.5,
    close,
    volume: i % 50 === 0 ? 0 : 1_000_000 + ((i * 7919) % 500_000),
  }
})
const closes = bars.map((bar) => bar.close)

writeFileSync(
  new URL('../src/lib/fixtures/indicator-parity.json', import.meta.url),
  `${JSON.stringify({ bars, expected: { sma50: sma(closes, 50), sma200: sma(closes, 200), rsi14: rsi(closes, 14), rvol: relativeVolume(bars, 20) } }, null, 1)}\n`,
)
