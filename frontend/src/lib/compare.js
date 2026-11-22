import { fmtDayMonth, fmtPct } from './format'

export const ADDED_LIMIT = 3

export function withColorSlots(added) {
  const valid = (slot, index) =>
    Number.isInteger(slot) && slot >= 0 && slot < ADDED_LIMIT && added.findIndex((entry) => entry.colorSlot === slot) === index
  const taken = new Set(added.map((entry) => entry.colorSlot).filter(valid))
  return added.map((entry, index) => {
    if (valid(entry.colorSlot, index)) return entry
    const free = [...Array(ADDED_LIMIT).keys()].find((slot) => !taken.has(slot))
    taken.add(free)
    return { ...entry, colorSlot: free }
  })
}

const TICK_STEPS = [0.5, 1, 2, 2.5, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000]
const MAX_TICK_GAPS = 6
const EPSILON = 1e-9

const pct = (close, base) => (close / base - 1) * 100

function rebased({ key, label, bars }, dates) {
  const closes = new Map(bars.map((entry) => [entry.date, entry.close]))
  const earlier = bars.filter((entry) => entry.date <= dates[0])
  const from = earlier.length === 0 ? (dates.find((date) => closes.has(date)) ?? null) : null
  const base = from ? closes.get(from) : earlier[earlier.length - 1]?.close
  const values = dates.map((date) => (closes.has(date) && base ? pct(closes.get(date), base) : null))
  return { key, label, values, from }
}

export function compareLines(main, others) {
  const dates = main.bars.map((entry) => entry.date)
  if (dates.length === 0) return []
  const base = main.bars[0].close
  const stock = { key: main.key, label: main.label, values: main.bars.map((entry) => pct(entry.close, base)), from: null }
  return [stock, ...others.map((other) => rebased(other, dates))]
}

export function valueAt(line, index) {
  if (index != null) return line.values[index] ?? null
  for (let i = line.values.length - 1; i >= 0; i -= 1) {
    if (line.values[i] != null) return line.values[i]
  }
  return null
}

export function pricesFor(values, base) {
  return values.map((value) => (value == null ? null : base * (1 + value / 100)))
}

export function compareTicks(bottom, top, base) {
  const low = pct(bottom, base)
  const high = pct(top, base)
  const step = TICK_STEPS.find((candidate) => (high - low) / candidate <= MAX_TICK_GAPS + EPSILON) ?? TICK_STEPS[TICK_STEPS.length - 1]
  const ticks = []
  for (let n = Math.ceil(low / step - EPSILON); n <= Math.floor(high / step + EPSILON); n += 1) {
    ticks.push(base * (1 + (n * step) / 100))
  }
  return ticks
}

export function percentLabel(price, base, decimals = 1) {
  return fmtPct(pct(price, base), { decimals })
}

const sentenceName = (line) => (line.key === 'sp500' ? `the ${line.label}` : line.label)

function movePhrase(line) {
  const value = valueAt(line, null)
  if (value == null) return null
  const rounded = Math.abs(value).toFixed(1)
  const move = Number(rounded) === 0 ? 'was flat' : `${value > 0 ? 'rose' : 'fell'} ${rounded}%`
  const from = line.from ? ` (from ${fmtDayMonth(line.from)})` : ''
  return `${sentenceName(line)} ${move}${from}`
}

export function factSentence(lines, hidden = new Set()) {
  const phrases = lines.filter((line) => !hidden.has(line.key)).map(movePhrase).filter(Boolean)
  if (phrases.length === 0) return ''
  const listed = phrases.length === 1 ? phrases[0] : `${phrases.slice(0, -1).join(', ')} and ${phrases[phrases.length - 1]}`
  return `Over this window ${listed}.`
}

export const SP500 = { symbol: 'SPY', uic: 36590, assetType: 'Etf' }

export function compareSuggestions(slot, sectors) {
  const offered = []
  if (slot.symbol !== SP500.symbol && slot.uic !== SP500.uic) {
    offered.push({ key: 'sp500', label: 'S&P 500', instrument: SP500, title: 'S&P 500, through SPY' })
  }
  const sector = sectors?.find((entry) => entry.fund && entry.stocks.some((stock) => stock.ticker === slot.symbol))
  if (sector && sector.fund.uic !== slot.uic) {
    const { ticker, uic, asset_type: assetType } = sector.fund
    offered.push({
      key: 'sector',
      label: ticker,
      instrument: { symbol: ticker, uic, assetType },
      title: `${ticker}, the fund that tracks ${sector.sector}, weighted by company size`,
    })
  }
  return offered
}
