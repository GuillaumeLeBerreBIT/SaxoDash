const KEPT_YEARS = 10

const present = (value) => value != null

export function cashAndDebtRows(annual) {
  const rows = []
  for (const year of annual ?? []) {
    const row = { label: year.label }
    const figures = {
      free_cash_flow: year.cash_flow?.free_cash_flow,
      cash: year.balance?.cash,
      total_debt: year.balance?.total_debt,
    }
    let any = false
    for (const [key, value] of Object.entries(figures)) {
      if (present(value)) {
        row[key] = value
        any = true
      }
    }
    if (any) rows.push(row)
  }
  return rows.slice(-KEPT_YEARS)
}

export function balanceRows(annual) {
  const rows = []
  for (const year of annual ?? []) {
    const { total_assets, current_assets, total_liabilities, current_liabilities } = year.balance ?? {}
    if (![total_assets, current_assets, total_liabilities, current_liabilities].every(present)) continue
    const long_term_assets = total_assets - current_assets
    const long_term_liabilities = total_liabilities - current_liabilities
    if (long_term_assets < 0 || long_term_liabilities < 0) continue
    rows.push({ label: year.label, current_assets, long_term_assets, current_liabilities, long_term_liabilities })
  }
  return rows.slice(-KEPT_YEARS)
}
