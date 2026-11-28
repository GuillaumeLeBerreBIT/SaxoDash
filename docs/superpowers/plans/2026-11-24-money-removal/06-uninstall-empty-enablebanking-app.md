# 06: Uninstall the empty enablebanking app (release 2)

**What to build:** the `enablebanking` app no longer exists in the codebase. It is removed from installed apps, its folder (by now only migrations) is deleted, and each environment runs `remove_stale_contenttypes --include-stale-apps` once (without the flag Django skips apps that are no longer installed). The leftover `django_migrations` rows are harmless and stay.

**Blocked by:** 03, 04, and production showing the `enablebanking` drop migration applied after release 1 deployed. Merging this first would skip the drop in production and leave the tables orphaned.

**Status:** done

- [x] Production confirmed to have applied the final `enablebanking` migration before this is merged
- [x] `enablebanking` is out of installed apps and its folder is gone
- [x] `migrate` on a fresh database and on the dev database both succeed with no missing-dependency error
- [x] `remove_stale_contenttypes` run on dev and production (2026-11-26, before this release: the app was still installed but had no models, so its types already counted as stale)
- [x] Backend test suite green; CI green

## On the server, after this release deploys

```sh
cd /opt/saxodash
C="docker compose --env-file /srv/saxodash/.env -f deploy/compose.yaml"
$C exec web python manage.py remove_stale_contenttypes --include-stale-apps
```

It lists the `enablebanking` content types and asks before deleting them.
