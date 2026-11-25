# Phase out Money and Enable Banking

Status: ready for planning, 2026-11-24.

## Problem Statement

SaxoDash is meant to become a product other people can pay for. The Money page is built on Enable Banking, which is licensed for personal use only, so it can never ship to customers. All of Money has to go: bank aggregation, the spending, budgets, subscriptions and transactions views built on it, and the accounts entered by hand. Money is a separate future app (Money Tracker), not part of SaxoDash.

Removing it is risky because Money is not self-contained:

- **Net worth.** The headline figure and its history add every row in the shared accounts table. That table holds the bank balances and the Saxo cash. Deleting the bank rows without restating history would show a fake loss of thousands of euros on the day of the release.
- **Order of operations.** `main` deploys itself to the homelab through `poll.sh`. Each release has to be safe to apply on its own, in the order it lands.
- **Leftovers.** Beat task rows, database tables, environment variables marked as required, and an outside consent with the banks would all outlive the code if nobody removes them.

## Solution

From the owner's point of view, Money disappears completely:

- No Money page, tab, command-palette entry or settings panel.
- No bank connection and no background bank syncing.
- Net worth means one thing: the Saxo portfolio plus Saxo cash. It reads that way across all of its history, with no step on removal day.
- Old links to Money land on Overview instead of an error.
- The banks no longer hold a consent for SaxoDash, and the server no longer needs Enable Banking secrets.

The data was exported before removal. The dev database export is done: five CSVs beside the project folder. The production export is an owner step before the first release.

The work ships in **two releases**, each going through `develop` and then `main`:

1. **Switch off and drop the data.** Every Money feature, endpoint, task and UI piece is removed. The `enablebanking` app is kept as an empty shell whose last migration drops its tables and the non-Saxo account rows. Net-worth history is restated in the same release.
2. **Remove the shell.** Once production has applied release 1, the `enablebanking` app is uninstalled and its folder deleted.

## User Stories

1. As the owner, I want the Money page gone from the navigation, so that the app only shows what it can sell.
2. As the owner, I want `/money`, `/money/accounts/:id` and the older `accounts`, `spending` and `spending/transactions` links to land on Overview, so that bookmarks don't break.
3. As the owner, I want the Accounts and Spending command-palette entries gone, so that search never leads to a dead page.
4. As the owner, I want the bank connection panel gone from Settings, so that I'm never asked to connect a bank.
5. As the owner, I want my net worth to be my Saxo portfolio plus Saxo cash, so that the headline means one thing.
6. As the owner, I want past net-worth snapshots restated without bank money, so that the history chart shows no fake drop on removal day.
7. As the owner, I want the day, week, month, YTD and all-time changes on Overview to use the restated history, so that no change figure counts bank money leaving as a loss.
8. As the owner, I want the Portfolio page's cash figure to keep showing my Saxo cash, so that nothing I rely on for investing disappears.
9. As the owner, I want the investment-performance series (Saxo account value) left exactly as it is, so that the analytics returns don't move.
10. As the owner, I want the background bank syncs (balances, transactions, subscription detection) stopped and their schedule rows deleted, so that the worker never tries to run a task that no longer exists.
11. As the owner, I want the bank transactions, subscriptions, IBAN labels, budgets, sync runs and encrypted bank credentials deleted from the database, so that no personal banking data lingers in a product database.
12. As the owner, I want the bank accounts synced from KBC and Argenta and every account entered by hand deleted, so that only the Saxo cash account remains.
13. As the owner, I want the Saxo cash account kept and still updated by the Saxo balance sync, so that net worth and the Portfolio cash panel stay correct.
14. As the owner, I want all `/api/enablebanking/` endpoints and the account-list endpoint to return 404, so that no client or script can reach banking.
15. As the owner, I want the net-worth endpoint to stop returning a bank-only figure, so that the API matches what the UI shows.
16. As the owner, I want the server to deploy without `ENABLE_BANKING_*` variables, so that a fresh install doesn't demand secrets for a removed feature.
17. As the owner, I want CI to stop setting Enable Banking placeholders, so that the pipeline only knows about what exists.
18. As the owner, I want the frontend build to stop taking an Enable Banking connect URL, so that the image has no dead configuration.
19. As the owner, I want `scripts/dev.sh` to stop starting the ngrok tunnel that only bank redirects needed, so that the dev stack starts fewer things.
20. As the owner, I want the Saxo connect flow to keep working in dev and production after the shared connect-ticket code loses its bank callers, so that I can still re-authenticate Saxo.
21. As the owner, I want the demo seed and purge commands to stop creating hand-entered bank accounts, so that demo data matches the product.
22. As the owner, I want the housekeeping prune task to keep pruning Saxo sync runs without the bank sync runs, so that the nightly job doesn't fail.
23. As the owner, I want release 1 safe to apply on its own in production, so that the auto-deploy never leaves the app half broken.
24. As the owner, I want release 2 shipped only after production has run release 1's migrations, so that the drop migrations are never skipped.
25. As the owner, I want a checklist of the steps only I can do (export production data, revoke the bank consents, delete the Enable Banking application, remove the secrets from the server `.env`), so that nothing outside the code is forgotten.
26. As another user of the multi-user app, I want my net worth and history to follow the same Saxo-only rule, so that every account is treated the same way.
27. As another user, I want any accounts I entered by hand removed along with the feature, so that I'm not left with figures the app no longer shows or counts.
28. As a future reader of the docs, I want AGENTS.md, `docs/decisions.md` and GLOSSARY.md to describe the app without Money, so that nobody rebuilds against a removed module.
29. As a future reader, I want the decisions log to record why Money was removed (personal-use licence, Money Tracker as a separate app), so that the decision isn't reopened by accident.
30. As the owner, I want the MCP server to keep working unchanged, so that my assistant tooling isn't affected. It has no banking tools today.

## Implementation Decisions

### Release order

- **Release 1** removes every Money behaviour and drops the data. Release 2 only removes the app registration and folder.
- Release 2 does not start until production shows the `enablebanking` drop migration applied.

### Owner steps before release 1 reaches `main`

- Export the production banking data if it holds any, the same way as the dev export: accounts, transactions, subscriptions, labels and budgets as CSVs. Leave out credentials and sync runs.
- Revoke the bank consents and delete the session at Enable Banking.

### Owner steps after release 1

- Remove the `ENABLE_BANKING_*` variables from the server `.env`.
- Delete the application in the Enable Banking control panel.

### Data removal (release 1)

- The `enablebanking` app keeps only its migrations package, plus one new final migration. That migration:
  - deletes every account row except the Saxo cash mirror: every row whose external id isn't the Saxo cash id, which covers synced bank rows and hand-entered rows (null external id);
  - then deletes all six `enablebanking` models.
- This migration lives in `enablebanking`, depending on the latest `accounts` migration, so no other app's migration ever depends on `enablebanking`. That is what lets release 2 uninstall it cleanly.
- The `accounts` app and its table stay, because the Saxo cash mirror lives there. Renaming the model or table away from "bank" is out of scope.

### Net-worth history (release 1)

A `core` data migration restates every snapshot:

- When a bank-only total is recorded: subtract it from the bank total, then set net worth to portfolio value plus the new bank total.
- When it was never recorded (25 dev rows from 2026-08-28 to 2026-09-21): count it as zero. This is the convention `restate_saxo_history` already uses. Their bank total already matches Saxo cash in the rows checked.
- The Saxo account value column is untouched.

A second `core` migration drops the bank-only total column once the restatement has used it.

### Net-worth rule going forward

- Net worth stays portfolio value plus the total of the remaining account rows, and that total is now only the Saxo cash. The existing current-net-worth rule needs no new formula.
- The bank-only balance service is removed.
- The broker-cash service stays: the Portfolio cash panel reads it through the net-worth endpoint.

### API contract changes

- **Net-worth endpoint:** drops `bank_only_total` and keeps `portfolio`, `bank_total`, `broker_cash` and the total.
- **Insights `value` block:** drops `bank_only`.
- **Snapshot serializer:** drops `bank_only_total`.
- **Removed outright:** the account-list endpoint and all of `/api/enablebanking/*`.

### Beat schedule

- The three Enable Banking entries are removed from the declared schedule. Their task names go on the dead-task list, which the schedule sync deletes.
- A migration runs the schedule sync, so existing databases lose the rows automatically. Today's sync only *warns* about undeclared enabled rows, so dropping the declaration alone would leave beat dispatching tasks that don't exist.

### Shared code

- The connect-ticket module stays for Saxo. Only its bank callers go.
- Housekeeping stops pruning bank sync runs.

### Frontend

Removed:

- the Money page and its sections
- the account transactions page
- the Money panels, bank account tiles, spending, budget, subscription and review-queue components
- the bank connection status in Settings
- the Enable Banking API client and query modules, and the bank paths in the HTTP layer
- the spending and category helpers that exist only for Money
- the Money navigation item and command-palette entries

Changed:

- The Money routes and their legacy aliases redirect to Overview.
- The shared "sync now" hook: if it is bank-only it goes; if it is shared with Saxo, only its bank branch goes.

### Config and deploy

Remove the `ENABLE_BANKING_*` settings, the system check, the required list in `install.sh`, the CI env, the `.env` examples, the frontend build argument, and the ngrok block in `dev.sh`.

### Demo data

The seed and purge commands stop creating and expecting hand-entered accounts. Seeded snapshots get a bank total equal to the seeded Saxo cash.

### Release 2

- Remove `enablebanking` from installed apps and delete the folder.
- Run `remove_stale_contenttypes` once per environment. Its leftover `django_migrations` rows are harmless and stay.

### Docs (release 1)

- **AGENTS.md:** drop Money from "Shipped" and drop the banking paragraph.
- **`docs/decisions.md`:** add an entry recording the removal and its reasons. Mark the banking entries as superseded instead of deleting them.
- **GLOSSARY.md:** drop the "Money and banking" section. Move any term the investing side still uses, such as Saxo cash, to Portfolio.

## Testing Decisions

A good test here checks behaviour a client or the owner sees: what an endpoint returns, which rows survive a migration, which beat rows exist after a sync. It never checks which function was called. Deleted features need no tests; their test modules go with them.

Seams, from highest to lowest. Most of the coverage sits on the first:

1. **The API (primary seam).** `APITestCase` tests on the existing net-worth and insights endpoints:
   - net worth equals the portfolio plus Saxo cash;
   - `bank_only_total` and `bank_only` are absent;
   - a snapshot history restated by the migration produces day, week and all-time changes with no step;
   - `/api/enablebanking/...` and the account list return 404.
   - Prior art: the existing tests in `accounts`, `core` and the portfolio insights tests.
2. **The restatement rule, as one pure function** used by the migration and tested directly with two snapshots: one with a recorded bank-only total, one with a null one. Prior art: the tests for `repair_networth_history` and `restate_saxo_history`.
3. **The schedule sync.** After a sync over a database holding the three Enable Banking rows, those rows are gone and every declared task is present. Prior art: the existing scheduling tests in `core`.
4. **The frontend router.** One vitest spec: `/money`, `/money/accounts/1`, `/accounts` and `/spending` render Overview, and the nav has no Money item. Prior art: the navigation and `App`-level specs.

Existing tests change too:

- The user-isolation and acting-as tests in `users` lose their banking cases.
- The housekeeping test loses its bank sync-run case.
- The Settings, `client.test.js` and `useSyncNow` specs lose their bank cases.

Manual checks:

- Against the dev database, before release 1: the restated chart has no step on removal day.
- Saxo re-authentication still works in dev without ngrok.
- After release 1 on production: the drop migration is applied before release 2 is merged.

## Out of Scope

- Money Tracker and ETFScanner as separate apps, and any API for linking them. No seams or "for later" code.
- Broker CSV/XLSX import and a licensable price source for a sold version, both far off.
- Renaming the accounts model, table, or the `bank_total` column and field to cash-oriented names. They now only hold Saxo cash. This is a follow-up once the dust settles.
- Scrubbing historical specs and plans in `docs/superpowers/` that mention banking. They are history.
- Re-deriving net-worth history from Saxo's own records. The restatement only removes the bank share.

## Further Notes

- The dev export is at `../SaxoDash-money-export-2026-11-24/` beside the project folder: 2 accounts, 358 transactions from 2026-06-22 to 2026-11-25, 7 subscriptions, 8 labels and 2 budgets. It holds personal data (name, masked card numbers) and is outside the repo on purpose.
- Other sessions share this checkout. Do the work in a worktree under `.worktrees/`, branched from `develop`.
- Before release 1, check whether the production database has bank rows at all. If it has none, the production export step is a no-op, but the consent revocation still applies to the dev connection.
