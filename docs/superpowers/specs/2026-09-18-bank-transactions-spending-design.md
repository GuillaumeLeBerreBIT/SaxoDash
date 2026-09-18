# Bank Transactions & Spending — Design Spec

**Date:** 2026-09-18
**Status:** Approved (design)
**Scope:** Backend (`backend/enablebanking/` extended) + a new frontend page + small touch points on Accounts/Dashboard

## Context

The Enable Banking integration spec explicitly deferred transaction history as a
non-goal: *"Balance-only sync for this milestone... a separate, larger data-model
decision deferred until balance sync is proven out"*
(`docs/superpowers/specs/2026-09-17-enable-banking-integration-design.md`). Balance
sync is now proven: both KBC and Argenta are connected and syncing real balances
end-to-end (`docs/superpowers/plans/2026-09-17-enable-banking-integration.md`, Task
10, done 2026-09-18). This spec picks up that deferred work: real bank transaction
line items, spending categorization, subscription detection, and the UI to see
them.

**Feasibility verified live against Enable Banking's own API reference before this
spec was written** (`docs/api/reference/#get-account-transactions`):
`GET /accounts/{account_id}/transactions` is real, paginated via
`continuation_key`, and supports a `strategy=longest` fetch mode that asks the
ASPSP for the longest history it will give — the mechanism this spec uses for the
one-time backfill. The `Access` object sent at the `/auth` step has explicit
`balances`/`transactions` boolean flags and an optional `accounts: [{iban}]` list;
the existing KBC/Argenta consent requested neither, so **both banks require a
one-time reconnect** before this feature can pull any transactions at all.

## Goal

Ingest real bank transactions from KBC and Argenta, categorize them by a
rule-based engine, detect recurring subscriptions, and surface both through a new
Spending page — plus small touch points on Accounts (drill-down) and Dashboard (one
summary tile).

## Non-goals (YAGNI)

- **Budgets and spending alerts.** Deliberately deferred (explicit decision during
  brainstorming) — each is a substantial feature in its own right, better designed
  once real categorized data exists to design against.
- **Saxo cash movements.** This is bank-transaction data only. Saxo's
  `transactions.Transaction` (BUY/SELL/DIVIDEND/DEPOSIT/FEE) is untouched; the
  existing `CashFlowChart` on the Accounts page keeps tracking that, separately
  from the new "Spending" concept (see `CONTEXT.md`).
- **A category-management UI.** Categories are a fixed set in code (matching every
  other choices-driven field in this app: `Transaction.TYPE_CHOICES`,
  `EnableBankingCredential.BANK_CHOICES`, `BankSyncRun.OUTCOME_CHOICES`) — not a
  user-editable list. Extend the fixed set in code if it proves too narrow.
- **Bank-provided category codes (MCC / `bank_transaction_code`).** Explicit
  decision: categorization is rule-based on merchant/description text only. These
  fields exist in Enable Banking's response but are not stored or used.
  `status`/`credit_debit_indicator` aren't stored as separate fields either — only
  `BOOK` (settled) transactions are ever synced, and direction is captured by the
  sign of `amount`.
- **Multi-currency handling.** Every `BankAccount` row today (KBC, Argenta, Saxo
  cash) is EUR — confirmed by querying the live dev database, not assumed. No
  currency-conversion logic anywhere in this feature.
- **A bank-picker UI / arbitrary ASPSP support.** Still just KBC and Argenta, per
  the original Enable Banking spec's constraint. The one addition — an optional
  IBAN field on reconnect, to request a specific (e.g. savings) account — does not
  relax this; it only changes which *accounts within* KBC/Argenta can be requested.
- **Cross-account subscription linking beyond what falls out of categorization.**
  Subscriptions are detected across all synced bank transactions regardless of
  which account they're charged to; there's no per-account subscription concept.
- **Deployment considerations.** Local dev only, same as every other Celery task in
  this app.

## Prerequisite (manual, user-side)

1. **Reconnect both KBC and Argenta** through the existing "Connect"/"Reconnect"
   flow once this ships — the new consent request adds `balances: true,
   transactions: true` to the `Access` object, which the original consent never
   requested. This is a hard requirement, not optional: the old session's scope
   cannot be widened retroactively.
2. **Live-verify the savings-account IBAN request** (Plan A, see below) during
   implementation: pass a known savings-account IBAN as `access.accounts` on
   reconnect and observe whether that bank's consent screen actually offers it.
   Document the real outcome per bank, the same way the ASPSP names and the HTTPS
   redirect requirement were verified live rather than assumed, in the original
   Enable Banking plan.

## Architecture

Extends the existing `backend/enablebanking/` app rather than creating a new one —
this data is a natural extension of what that app already owns (credentials,
client, sync tasks), not a separate concern.

### New models

| Model | Purpose |
|---|---|
| `BankTransaction` | One row per settled (`BOOK`) transaction. `bank` (choices, reuses `EnableBankingCredential.BANK_CHOICES`), `bank_account` (FK → `accounts.BankAccount`), `external_id` (unique, `enablebanking:{bank}:{account_uid}:{entry_reference}` — same dedupe pattern as `BankAccount.external_id`), `amount` (signed Decimal: negative = outflow, positive = inflow), `currency`, `booking_date`, `counterparty_name` (the *other* party: `creditor.name` for an outflow, `debtor.name` for an inflow — never the account holder's own name), `counterparty_iban` (same creditor/debtor selection rule, nullable — not every transaction carries one, e.g. most card purchases), `description` (joined `remittance_information` text), `category` (choices, rule-assigned, recomputed every sync), `category_override` (nullable choices, user-set, never touched by sync). `effective_category` property returns the override when set, else `category`. |
| `Subscription` | One row per detected recurring merchant pattern. `merchant_key` (unique, normalized merchant name — the detection/upsert key), `display_name` (raw counterparty name, for UI), `category`, `expected_amount`, `cadence` (choices: monthly/weekly/yearly), `last_charged` (date), `dismissed` (bool, default `False`). Member transactions are *not* stored via FK/M2M — found on demand by filtering `BankTransaction` on `merchant_key` at render time, so membership never drifts out of sync as new transactions arrive. |
| `ManualIbanLabel` | Plan B fallback only (built if live verification shows a bank won't expose a requested account for consent). `iban` (unique), `label`, `category` (typically `SAVINGS`). Used purely as a lookup table for categorizing transfers to an IBAN that was never actually connected — no balance/transaction sync for it. |

`BankSyncRun` gains a `kind` field (choices: `balances` / `transactions`, default
`balances` for existing rows) so the new transaction sync's history doesn't blend
with balance sync's in admin/status views — same reasoning `BankSyncRun` was kept
separate from `saxo.SyncRun` in the first place.

### Category set (fixed, in code)

`GROCERIES, DINING, TRANSPORT, UTILITIES, SUBSCRIPTIONS, SHOPPING, HEALTH, TRAVEL,
ENTERTAINMENT, INCOME, TRANSFER, SAVINGS, REFUND_CREDIT, OTHER` — a starter set
covering common Belgian retail/utility merchants, extended in code as real data
reveals gaps.

### Component changes

| File | Change |
|---|---|
| `enablebanking/client.py` | `build_authorize_url` gains `balances: True, transactions: True` in the `access` object (currently sends neither) and an optional `iban` param that, when set, adds `accounts: [{"iban": iban}]`. New `get_transactions(session_id, account_uid, date_from=None, strategy=None, continuation_key=None)` wrapping the endpoint; new `iter_transactions(...)` generator that follows `continuation_key` until exhausted, yielding pages. |
| `enablebanking/mapping.py` | New `to_bank_transaction_fields(bank, account_uid, raw_transaction) -> dict`, pure function, same isolation as the existing `to_account_fields`. |
| `enablebanking/categorization.py` (new) | `CATEGORY_CHOICES`, a hardcoded `{category: [keywords]}` rule table (same pattern as the existing `ASPSPS`/`GRADIENTS` hardcoded dicts), and `categorize(counterparty_name, description, amount) -> category_code`. Matching is symmetric — a refund credit from a known merchant lands in that merchant's normal category (e.g. a Colruyt refund → `GROCERIES`), so it nets against prior outflows in the same category purely through signed `SUM` aggregation, no separate refund-matching logic needed. `INCOME` is only assigned when a credit matches an explicit income keyword rule (e.g. a known employer name, added as those become apparent). Any credit matching neither a spending-category merchant nor an income rule falls to `REFUND_CREDIT` — a single generic "unrecognized money in" bucket, correctable per-row via `category_override` (e.g. the first salary payment, until an income keyword rule is added for that employer). An unmatched debit falls to `OTHER`. Pure, unit-testable without touching the DB. |
| `enablebanking/transfers.py` (new) | `mark_transfers(bank_transactions)` — for each outflow, looks for an inflow of the same absolute amount within ±2 days on a *different* `BankAccount` among the synced Enable Banking accounts (or an inflow-side match against a `ManualIbanLabel.iban` via `counterparty_iban`), overriding whatever `categorization.categorize` assigned. Category becomes `SAVINGS` when the destination `BankAccount.type` contains "savings" (case-insensitive) or matches a `ManualIbanLabel` whose own `category` is `SAVINGS`; `TRANSFER` for every other own-account match. Runs as part of the sync task, after categorization, before save. |
| `enablebanking/subscriptions.py` (new) | `detect_subscriptions()` — groups non-`TRANSFER` `BankTransaction`s by normalized merchant name, flags a group as recurring when it has 2+ occurrences at a consistent cadence (monthly ±5 days / weekly ±2 days / yearly ±14 days) and stable amount (±10% tolerance), upserts `Subscription` rows by `merchant_key` without clobbering an existing `dismissed=True`. |
| `enablebanking/tasks.py` | New `sync_enablebanking_transactions` (per bank, per linked account: `strategy=longest` backfill on first sync, else `date_from` = latest stored `booking_date`; paginates via `iter_transactions`; applies `categorization.categorize` then `transfers.mark_transfers`; upserts by `external_id`). New `detect_enablebanking_subscriptions` periodic task (daily) calling `subscriptions.detect_subscriptions()`. Both write `BankSyncRun(kind=...)` rows, same error-handling shape as `sync_enablebanking_balances`. |
| `enablebanking/views.py` | `EnableBankingConnectView` accepts an optional `iban` query param, threaded to `client.build_authorize_url`. New `BankTransactionListView` (filterable by account/category/date range, mirrors `transactions.views.TransactionListView`), `BankTransactionCategoryView` (`PATCH`, sets/clears `category_override`), `SpendingSummaryView` (category totals over a date range, computed on demand via ORM `annotate`/`Sum` — same style as `transactions.services.get_monthly_cash_flow`, no precomputed summary table), `SubscriptionListView` + `SubscriptionDetailView` (`PATCH` to toggle `dismissed`). |

### Data flow

**Transaction sync (per bank, per linked account, on the existing periodic
schedule):**

1. If no `BankTransaction` exists yet for this account, fetch with
   `strategy=longest` (full available history). Otherwise fetch with `date_from` =
   the latest stored `booking_date` for that account (incremental).
2. Page through `continuation_key` until exhausted; keep only `status=BOOK` rows.
3. Map each to `BankTransaction` fields, run `categorization.categorize`, then
   `transfers.mark_transfers` across the batch (so a same-day transfer pair on two
   different accounts can see each other).
4. Upsert by `external_id`. `category` is recomputed every time; `category_override`
   is never touched by this path.

**Subscription detection (daily periodic task):** re-scans all non-transfer
`BankTransaction`s, upserts `Subscription` rows, preserves `dismissed`.

**Spending page (read path):** `SpendingSummaryView` aggregates `effective_category`
totals for outflows over the requested range, returning `TRANSFER` as its own
line (excluded from the headline spending total, but present and visible — Q10).
`SubscriptionListView` returns non-dismissed subscriptions; dismissing one is a
`PATCH`, no resync needed.

**Manual category correction:** `PATCH` sets `category_override`; the effective
category flips immediately, survives every future sync.

## Frontend

| File | Change |
|---|---|
| `pages/Spending.jsx` (new) | Category breakdown chart, spending-over-time chart, subscriptions list (dismiss action), visible Transfers line beneath the categorized total. |
| `components/Sidebar.jsx` | New nav entry `/spending`. |
| `App.jsx` | New route `path='spending'`. |
| `pages/Accounts.jsx` | Each account card becomes a link to a new per-account transaction list route (flat list, not a mini Spending view — Q9). |
| `pages/AccountTransactions.jsx` (new) | The flat drill-down list for one account. |
| `pages/Dashboard.jsx` | One new summary tile: this month's spending total + top category, matching the visual weight of the existing attention-flags/movers tiles. |
| `api/client.js` / `api/queries.js` | `getBankTransactions`, `updateBankTransactionCategory`, `getSpendingSummary`, `getSubscriptions`, `updateSubscription`, and `connectEnableBanking` gains an optional `iban` param. |

## Error Handling

- **Rate limits / transient ASPSP errors** on the transactions endpoint (documented
  `ASPSP_RATE_LIMIT_EXCEEDED` / `429`): same `autoretry_for` + `retry_backoff`
  pattern already used by `sync_enablebanking_balances`.
- **Per-transaction mapping failures**: caught per-item inside the pagination loop,
  logged with account/entry_reference context, same shape as the existing
  per-account catch in `sync_enablebanking_balances`.
- **Consent lapse mid-backfill**: reuses the existing `credentials.connection_state`
  / `needs_reauth` machinery unchanged — a bank already flagged `needs_reauth` is
  skipped by the transaction sync the same way it's skipped by the balance sync.

## Testing

Mirrors the existing Enable Banking testing shape:

- `categorization.py`, `transfers.py`, `subscriptions.py`, `mapping.py` — pure
  functions, unit-tested against fixture data, no network or DB where avoidable.
- `client.py` additions — mocked HTTP, including a multi-page `continuation_key`
  sequence and a `strategy=longest` vs incremental `date_from` call each tested
  explicitly.
- `tasks.py` additions — `CELERY_TASK_ALWAYS_EAGER=True`, asserting DB state
  including the backfill-then-incremental transition, transfer-pair detection
  across two accounts, and subscription upsert preserving `dismissed`.
- `views.py` additions — DRF `APITestCase`, including category override
  persistence across a simulated re-sync.
- Frontend — component tests for `Spending.jsx` (category chart, subscription
  dismiss action, visible Transfers line) and the Accounts drill-down link,
  following existing patterns (e.g. `EnableBankingConnectionStatus.test.jsx`).
- **Manual/live verification** (per the Prerequisite section): both banks
  reconnected with transaction access; a real sync populates real categorized
  transactions; the savings-IBAN request (Plan A) tested live against at least one
  bank, with the outcome (worked / needed Plan B) recorded in the implementation
  plan the same way every other live-verified fact in this project has been.

## Constraints (carried from the codebase / working agreement)

- Local dev only, no deployment/process-management concerns.
- Two hardcoded banks (KBC, Argenta) — unchanged by this feature.
- No multi-user/tenancy scaffolding.
- EUR-only, confirmed live against the current dev database rather than assumed.
