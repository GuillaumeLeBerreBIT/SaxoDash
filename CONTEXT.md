# SaxoDash

A personal finance dashboard unifying investment activity (Saxo) and bank accounts (Enable Banking: KBC, Argenta) into one view.

## Language

**Bank Transaction**:
A single booked (settled, not pending) line item on a KBC or Argenta account, fetched from Enable Banking's transactions endpoint. Distinct from `Transaction`, which is Saxo trade/cash activity only.
_Avoid_: Transaction (without qualifier, when bank data is meant), Activity

**Category**:
A label assigned to a Bank Transaction describing what kind of spending or income it represents (e.g. Groceries, Subscriptions, Utilities). Assigned automatically by a rule matching the transaction's merchant/description text, unless a Category Override exists.
_Avoid_: Type, Tag (Type is already used for account type, e.g. "Current account")

**Category Override**:
A category manually assigned by the user on a specific Bank Transaction, which takes precedence over the rule-assigned Category permanently (a later sync never replaces it).

**Subscription**:
A detected group of Bank Transactions from the same merchant, at a similar amount, recurring on a roughly regular cadence (monthly, weekly, or yearly). Persisted so it can be dismissed or confirmed by the user rather than re-evaluated fresh on every view.
_Avoid_: Recurring payment (fine in conversation, but the stored concept is "Subscription")

**Spending**:
Net outflow from Bank Transactions for a given period, grouped by Category: debits minus any Refund/Credit that nets against the same Category, excluding Transfer and Savings entirely. Always scoped to an explicit period (e.g. "this month") - an unscoped "Spending" figure is a bug, not a feature. Distinct from the existing "Cash Flow" chart on the Accounts page, which tracks Saxo-side deposits/dividends vs fees, not bank spending.
_Avoid_: Cash flow (reserved for the existing Saxo-based chart)

**Own Account**:
Any KBC or Argenta account whose IBAN appears in one of the two `EnableBankingCredential.linked_accounts` lists — i.e. an account you've actually connected, as opposed to any arbitrary IBAN a Bank Transaction might reference.

**Transfer**:
A Bank Transaction matched (by amount and date) to a corresponding transaction on another Own Account, representing money moved between your own accounts rather than spent. Excluded from Spending totals, but shown as its own line on the Spending page for transparency rather than hidden.

**Refund/Credit**:
An incoming Bank Transaction that isn't a Transfer or income. When it can be confidently matched to a prior outflow's merchant, it nets against that Category's total; otherwise it falls into a generic Refund/Credit bucket.
