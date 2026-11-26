# 03: Saxo-only net worth and drop the bank data

**What to build:** net worth becomes the Saxo portfolio plus Saxo cash, today and across all of history, and the banking data is gone from the database. Everything happens in one release, so live net worth and the history chart never disagree.

- The last `enablebanking` migration depends on the latest `accounts` migration. It deletes every account row except the Saxo cash mirror (synced bank rows and hand-entered rows alike), then deletes all six `enablebanking` models. No other app's migration may depend on `enablebanking`.
- A `core` data migration restates each snapshot. When a bank-only total is recorded, it is subtracted from the bank total, and net worth becomes portfolio value plus the new bank total. A null bank-only total counts as zero, the same convention as `restate_saxo_history`. The Saxo account value is not touched. The rule lives in one pure function that the migration calls.
- A second `core` migration drops the bank-only total column.
- The net-worth endpoint drops `bank_only_total`, the insights `value` block drops `bank_only`, and the snapshot serializer drops `bank_only_total`. The bank-only balance service is deleted. The broker-cash service stays.
- The demo seed and purge commands stop creating and expecting hand-entered accounts. Seeded snapshots get a bank total equal to the seeded Saxo cash.

**Blocked by:** 02 (the models dropped here must have no remaining views, tasks or services).

**Status:** done

- [x] The restatement function, tested with one snapshot that has a recorded bank-only total and one with a null one
- [x] After migrating, only the Saxo cash account row remains, for every user
- [x] The net-worth endpoint returns portfolio plus Saxo cash, with no `bank_only_total` (APITestCase)
- [x] Insights day, week and all-time changes over a restated history show no step, and there is no `bank_only` key (APITestCase)
- [x] The investment-performance series (Saxo account value) is unchanged
- [x] Manual check on the dev database: the Overview and Portfolio net-worth chart has no drop on removal day
- [x] Backend test suite green
