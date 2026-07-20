export function fmtEur(value) {
    return new Intl.NumberFormat('en-IE', {styles: 'currency', currency: 'EUR' }).format(value)
}

export function fmtPct(value) {
    const sign = value > 0 ? '+' : ''
    return `${sign}${value.toFixed(2)}`
}

export function fmtNum(value) {
  return new Intl.NumberFormat('en-IE').format(value)
}