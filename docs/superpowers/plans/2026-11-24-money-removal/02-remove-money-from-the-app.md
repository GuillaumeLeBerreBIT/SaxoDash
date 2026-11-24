# 02: Remove Money from the app

**What to build:** Money disappears for every user. No Money page, no account transactions page, no Money nav item, no Accounts or Spending command-palette entries, no bank connection panel in Settings. Visiting `/money`, `/money/accounts/:id` or the legacy `accounts`, `spending` and `spending/transactions` links lands on Overview. On the backend, every Enable Banking endpoint (connect, callback, status, sync, transactions, spending, subscriptions, budgets, labelled accounts) and the account-list endpoint return 404. The bank tasks, services, client, mapping, categorisation and admin code are deleted. The `enablebanking` models and migrations stay until ticket 03 drops the data. The shared "sync now" hook loses its bank branch, or goes entirely if it is bank-only.

**Blocked by:** 01 (the task code deleted here must no longer be scheduled).

**Status:** ready-for-agent

- [ ] `/money`, `/money/accounts/1`, `/accounts` and `/spending` render Overview, and the nav has no Money item (vitest spec)
- [ ] The Settings page has no bank connection status, and its spec is updated
- [ ] The Enable Banking API client and query modules, Money components and Money-only helpers are deleted, and the command palette has no Money entries
- [ ] `/api/enablebanking/...` and the account list return 404 (APITestCase)
- [ ] The user-isolation and acting-as tests lose their banking cases and still pass
- [ ] The Portfolio cash panel still shows Saxo cash
- [ ] Backend tests, frontend tests, eslint and build green
