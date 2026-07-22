export function fmtEur(value, { sign = false, decimals = 2 } = {}) {
    const n = Number(value)
    const formatted = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(Math.abs(n))
    const prefix = n < 0 ? '-' : sign ? '+' : ''
    return `${prefix}${formatted}`
}

export function fmtPct(value, { sign = true, decimals = 2 } = {}) {
    const n = Number(value)
    const prefix = n < 0 ? '' : sign ? '+' : ''
    return `${prefix}${n.toFixed(decimals)}%`
}

export function fmtNum(value, decimals = 0) {
  return new Intl.NumberFormat('en-IE', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(Number(value))
}
