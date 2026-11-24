# 05: Owner checklist

**What to build:** the steps only the owner can do, outside the code. Steps 1 and 2 happen before release 1 reaches `main`, because its migrations delete the data.

**Blocked by:** None (can start immediately). Steps 3 and 4 wait until release 1 is deployed.

**Status:** needs-owner

- [ ] 1. Check whether the production database holds bank rows. If it does, export accounts, transactions, subscriptions, labels and budgets to CSV, the same way as the dev export in `../SaxoDash-money-export-2026-11-24/`
- [ ] 2. Revoke the KBC and Argenta consents and delete the session at Enable Banking
- [ ] 3. After release 1 is deployed: remove the `ENABLE_BANKING_*` variables and the private key from the server `.env`
- [ ] 4. Delete the application in the Enable Banking control panel
