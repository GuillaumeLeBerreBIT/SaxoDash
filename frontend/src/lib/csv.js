const escapeCell = (value) => {
  const text = value == null ? '' : String(value)
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text
}

export function toCsv(columns, rows) {
  const lines = rows.map((row) => columns.map(({ get }) => escapeCell(get(row))).join(','))
  return [columns.map((c) => escapeCell(c.header)).join(','), ...lines].join('\n')
}

export const TRANSACTION_COLUMNS = [
  { header: 'Date', get: (t) => t.date },
  { header: 'Type', get: (t) => t.type },
  { header: 'Instrument', get: (t) => t.instrument },
  { header: 'Ticker', get: (t) => t.ticker },
  { header: 'Qty', get: (t) => t.qty },
  { header: 'Price', get: (t) => t.price },
  { header: 'Total', get: (t) => t.total },
  { header: 'Account', get: (t) => t.account },
]
