function niceStep(raw) {
  const magnitude = 10 ** Math.floor(Math.log10(raw))
  const fraction = raw / magnitude
  const factor = fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10
  return factor * magnitude
}

function clean(value, step) {
  const decimals = Math.max(0, 1 - Math.floor(Math.log10(step)))
  return Number(value.toFixed(decimals))
}

export function niceTicks(min, max, count = 5) {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !Number.isFinite(count) || count < 1) return []
  const low = Math.min(min, max)
  const high = Math.max(min, max)
  if (low === high) return [low]
  const step = niceStep((high - low) / count)
  const first = Math.floor(low / step + 1e-9)
  const last = Math.ceil(high / step - 1e-9)
  const ticks = []
  for (let i = first; i <= last; i += 1) ticks.push(clean(i * step, step))
  return ticks
}

export function niceAxis(values, { count = 5, includeZero = false } = {}) {
  const finite = values.filter((value) => Number.isFinite(value))
  if (includeZero) finite.push(0)
  if (finite.length === 0) return {}
  const ticks = niceTicks(Math.min(...finite), Math.max(...finite), count)
  if (ticks.length < 2) return {}
  return { ticks, domain: [ticks[0], ticks[ticks.length - 1]] }
}
