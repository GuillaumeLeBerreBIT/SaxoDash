export function toAccountBreakdownData(accounts) {
  return accounts.map((a) => ({
    name: a.bank,
    value: Number(a.balance),
    color: a.accent || '#3f3f46',
  }))
}
