export function fmtAxisPct(value) {
  if (value == null) return ''
  return `${Math.round(value)}%`
}

export function fmtAxisDollars(dollars) {
  if (dollars == null) return ''
  const sign = dollars < 0 ? '-' : ''
  const abs = Math.abs(dollars)
  const scaled = (value, unit) => `${sign}$${value < 10 ? Number(value.toFixed(1)) : Math.round(value)}${unit}`
  if (abs >= 1e12) return scaled(abs / 1e12, 'T')
  if (abs >= 1e9) return scaled(abs / 1e9, 'B')
  if (abs >= 1e6) return scaled(abs / 1e6, 'M')
  return `${sign}$${Math.round(abs)}`
}
