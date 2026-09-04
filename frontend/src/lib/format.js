// Instrument prices are quoted in the instrument's own currency; only values,
// costs and P&L are converted to the reporting currency. Use fmtMoney with the
// position's `currency` for a price, fmtEur for anything already converted.

export function fmtMoney(value, currency = 'EUR', { sign = false, decimals = 2 } = {}) {
    const n = Number(value)
    const formatted = new Intl.NumberFormat('en-IE', {
        style: 'currency',
        currency: currency || 'EUR',
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals,
    }).format(Math.abs(n))
    const prefix = n < 0 ? '-' : sign ? '+' : ''
    return `${prefix}${formatted}`
}

export function fmtEur(value, opts = {}) {
    return fmtMoney(value, 'EUR', opts)
}

/** Whole shares stay whole; fractional ones keep only the decimals they use. */
export function fmtQty(value) {
    return new Intl.NumberFormat('en-IE', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 4,
    }).format(Number(value))
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
