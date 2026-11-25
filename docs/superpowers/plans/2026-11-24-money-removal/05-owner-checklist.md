# 05: Owner checklist

**What to build:** the steps only the owner can do, outside the code. Steps 1 and 2 happen before release 1 reaches `main`, because its migrations delete the data.

**Blocked by:** None (can start immediately). Steps 3 and 4 wait until release 1 is deployed.

**Status:** needs-owner

- [ ] 1. Check whether the production database holds bank rows. If it does, export accounts, transactions, subscriptions, labels and budgets to CSV, the same way as the dev export in `../SaxoDash-money-export-2026-11-24/`
- [ ] 2. Revoke the KBC and Argenta consents and delete the session at Enable Banking
- [ ] 3. After release 1 is deployed: remove the `ENABLE_BANKING_*` variables and the private key from the server `.env`
- [ ] 4. Delete the application in the Enable Banking control panel

## Commands on the server

Run from the server, in `/opt/saxodash`. `C` is the compose prefix every step uses:

```sh
cd /opt/saxodash
C="docker compose --env-file /srv/saxodash/.env -f deploy/compose.yaml"
```

**Before release 1 reaches `main`:**

1. See what bank data production holds, and which snapshots the restatement cannot correct (read-only):

   ```sh
   $C exec web python manage.py shell -c "from accounts.models import BankAccount as B; from core.models import NetWorthSnapshot as S; from enablebanking.models import BankTransaction as T; print(list(B.objects.values_list('user__username', 'bank', 'external_id', 'balance'))); print('bank transactions', T.objects.count()); print('snapshots with no bank-only total', S.objects.filter(bank_only_total__isnull=True).count())"
   ```

   Only `saxo:cash` rows, no transactions and 0 snapshots without a bank-only total: nothing to keep, go to 3. Otherwise continue with 2.

2. Keep a copy of the bank data. A backup holds every table, so take one and keep its file outside the rotation:

   ```sh
   $C run --rm --no-deps web python manage.py backup_database
   ls -l /srv/saxodash/backups
   ```

   For CSVs like the dev export, copy each table out of Postgres (`enablebanking_banktransaction`, `enablebanking_subscription`, `enablebanking_manualibanlabel`, `enablebanking_budget`, `accounts_bankaccount`):

   ```sh
   $C exec -T postgres psql -U saxodash saxodash -c "\copy enablebanking_banktransaction TO STDOUT WITH CSV HEADER" > bank_transactions.csv
   ```

   If step 1 counted snapshots with no bank-only total, check their bank total against Saxo cash before deploying: those rows keep any bank money they hold, so the chart would step down on removal day.

3. Revoke the KBC and Argenta consents at Enable Banking.

**Deploying release 1:** merge `develop` into `main`; `poll.sh` backs up, migrates and starts it. This release cannot be undone by rolling back the image alone (the old code reads a dropped column). Undoing it is `rollback.sh <previous sha>` then `restore.sh` with the pre-deploy dump.

**After release 1 is deployed:**

4. Check the Overview net-worth chart has no drop on removal day, and that Saxo cash still shows on Portfolio.
5. Delete the `ENABLE_BANKING_*` lines and the private key from `/srv/saxodash/.env` (nothing reads them any more).
6. Delete the application in the Enable Banking control panel.
