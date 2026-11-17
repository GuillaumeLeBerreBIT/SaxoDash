# backend/AGENTS.md

Rules for work under `backend/`. The repo-wide rules are in `../AGENTS.md` and the reasoning
behind each module is in `../docs/decisions.md`.

## Commands

Run from `backend/`:

- `python manage.py test --noinput --parallel 4` runs the whole suite, as CI does. Name an app
  (`python manage.py test research`) while working on one.
- `python manage.py migrate` against the dev database after any new migration. The test suite
  builds its own database, so a green run does not prove the dev one has the column, and the
  live dev server then 500s on every request touching that model. `scripts/dev.sh` migrates
  on restart; mid-session it is a manual step.

## Conventions

- Test-first, one DRF `APITestCase` per app, next to the code.
- Every person's row carries `user`. Views scope by `request.user`; tasks write to
  `credential.user`. A new per-person model is added to `COVERED` in `users/test_isolation.py`
  or that test fails.
- Every sync task is wrapped in `@synced(...)`; choose `credential='each' | 'owner' | None`
  and `reports_health` deliberately.
- Totals go through `core.money.Money`. Prices stay in the instrument's currency; only
  converted figures (`value`, `cost`, `pnl`) are summed.
- A figure the provider did not return is omitted or `null`, never zero.
- Provider calls reach the API through `research/providers.py` (`ProviderError`,
  `ProviderNotConnected`, `ProviderUnavailable`) and `research/provider_cache.py::cached`.
  Apps that read stored rows (`verdicts`, `signals`, `investors`) import neither `saxo`,
  `finnhub`, `market` nor `requests`.
- Finnhub's budget is counted where calls leave (`finnhub._get`); background work runs inside
  `finnhub.background_calls()`.
- No comments in generated code (see the root file).
