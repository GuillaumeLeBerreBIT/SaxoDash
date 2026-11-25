# 06: Uninstall the empty enablebanking app (release 2)

**What to build:** the `enablebanking` app no longer exists in the codebase. It is removed from installed apps, its folder (by now only migrations) is deleted, and each environment runs `remove_stale_contenttypes` once. The leftover `django_migrations` rows are harmless and stay.

**Blocked by:** 03, 04, and production showing the `enablebanking` drop migration applied after release 1 deployed. Merging this first would skip the drop in production and leave the tables orphaned.

**Status:** ready-for-agent (once production is confirmed on release 1)

- [ ] Production confirmed to have applied the final `enablebanking` migration before this is merged
- [ ] `enablebanking` is out of installed apps and its folder is gone
- [ ] `migrate` on a fresh database and on the dev database both succeed with no missing-dependency error
- [ ] `remove_stale_contenttypes` run on dev and production
- [ ] Backend test suite green; CI green
