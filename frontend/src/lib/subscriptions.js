const WEEKS_PER_MONTH = 52 / 12

const MONTHS_PER_CADENCE = {
  monthly: (amount) => amount,
  yearly: (amount) => amount / 12,
  weekly: (amount) => amount * WEEKS_PER_MONTH,
}

export function monthlyAmount(subscription) {
  const perMonth = MONTHS_PER_CADENCE[subscription.cadence]
  return perMonth ? perMonth(Number(subscription.expected_amount)) : 0
}

export function monthlyTotal(subscriptions) {
  return (subscriptions ?? [])
    .filter((subscription) => !subscription.dismissed)
    .reduce((sum, subscription) => sum + monthlyAmount(subscription), 0)
}
