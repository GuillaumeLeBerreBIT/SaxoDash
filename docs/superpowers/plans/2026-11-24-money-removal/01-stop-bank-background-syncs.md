# 01: Stop the bank background syncs

**What to build:** the worker stops syncing bank balances, syncing bank transactions and detecting subscriptions, and no environment keeps a beat row that points at those tasks. Taking them out of the declared schedule is not enough on its own: the schedule sync only warns about undeclared enabled rows, it doesn't delete them. So the three task names go on the dead-task list, and a migration runs the schedule sync so existing databases lose the rows automatically. Housekeeping stops pruning bank sync runs, so it no longer imports the bank models.

**Blocked by:** None (can start immediately).

**Status:** ready-for-agent

- [ ] The declared beat schedule has no Enable Banking entries
- [ ] Running the schedule sync on a database that holds the three Enable Banking rows deletes them and keeps every declared task (test)
- [ ] A migration applies the sync, so dev and production lose the rows on `migrate`
- [ ] Housekeeping still prunes Saxo sync runs and no longer touches bank sync runs (the housekeeping test is updated)
- [ ] Backend test suite green
