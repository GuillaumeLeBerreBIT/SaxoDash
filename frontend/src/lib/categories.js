export const CATEGORY_LABELS = {
  GROCERIES: 'Groceries', DINING: 'Dining', TRANSPORT: 'Transport', UTILITIES: 'Utilities',
  SUBSCRIPTIONS: 'Subscriptions', SHOPPING: 'Shopping', HEALTH: 'Health', TRAVEL: 'Travel',
  ENTERTAINMENT: 'Entertainment', INCOME: 'Income', TRANSFER: 'Transfer', SAVINGS: 'Savings',
  REFUND_CREDIT: 'Refund/Credit', OTHER: 'Other',
}

// Mirrors backend/enablebanking/models.py's BUDGETABLE_CATEGORIES - categories
// a user can actually set a monthly limit for.
export const BUDGETABLE_CATEGORIES = [
  'GROCERIES', 'DINING', 'TRANSPORT', 'UTILITIES', 'SUBSCRIPTIONS',
  'SHOPPING', 'HEALTH', 'TRAVEL', 'ENTERTAINMENT', 'OTHER',
]
