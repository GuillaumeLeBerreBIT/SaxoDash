# Handoff: congress trades (House STOCK Act) — finish, then merge or PR

You are picking up a finished-but-unmerged feature. Read this, then do the steps in order.

## Where things are
- Branch `feat/congress-trades` on origin (forked from main `ab23ba6`; main has since gained PR #27 — rebase first, see Step 2). Work on this branch.
- Spec: `docs/superpowers/specs/2026-10-15-congress-trades-design.md`. Plan: `docs/superpowers/plans/2026-10-15-congress-trades.md`. (The task-by-task review ledger lives only on the user's Mac; everything you need from it is summarised here.)
- Setup in a fresh clone: `cd backend && python -m venv .venv && .venv/bin/pip install -r requirements.txt` (pypdf 6.20.1 is new on this branch); create `backend/.env` from `backend/.env.example` if tests need one; `cd frontend && npm ci`. Tests never hit the network (House/legislators calls are mocked).
- Test baseline at head `f3e095c`: backend 1632 tests, only 2 known env-dependent failures (`saxo...test_build_authorize_url_includes_client_id_and_state`, `saxo...test_valid_ticket_redirects_to_saxo_authorize_url_and_sets_session_state` — they fail on main too). Frontend `npx vitest run` 209 files / 2275 pass; `npx eslint src` and `npm run build` clean.
- Project rules: AGENTS.md (zero code comments; test-first; reuse existing components/helpers — the user asked for this explicitly; a migration isn't done until migrated on the dev DB).

## Step 1 — fix before merging: error handling in `backend/congress/house.py` (`_get`, `parse_pending`, ~lines 41-142)
Bug: any non-200 PDF answer (incl. 404) is treated as "host down" → loop breaks without using an attempt → that report stays first forever and blocks the whole parse queue, while SyncRun says `ok`.
Agreed design (user approved the direction; implement test-first):
1. Transient blips: give `requests` a Session with urllib3 `Retry(total=3, backoff_factor=1, status_forcelist=[429,500,502,503,504], respect_retry_after_header=True)` — library, not hand-rolled.
2. Host really down (connection error/timeout/5xx after retries): stop the run, keep reports untouched, and make the run visible as failed — raise a `HouseError` at the end of `parse_pending` (after recording what was parsed) or set the SyncRun detail to "Clerk unreachable, N reports waiting"; `sync_house` is `@synced(reports_health=False)` so it won't touch the Saxo badge.
3. One file missing (4xx): per-report backoff. Add `Report.retry_after` (DateTimeField, null) + migration; on 4xx increment attempts, set `retry_after` = now + 1d / 3d / 7d by attempt, status FAILED with reason; after attempt 3 give up (retry_after null, stays FAILED). `due` query skips reports whose `retry_after` is in the future, so one missing PDF never blocks others.
4. Parse errors (deterministic): mark FAILED at once with `attempts = MAX_ATTEMPTS` (no daily retries); `reparse_reports --failed` (already resets attempts) is the remedy after a parser fix — also reset `retry_after` there.
Tests (backend/congress/test_house.py, test_tasks.py): 404 on the first report doesn't block the second; retry_after spacing 1/3/7 then give-up; due-skipping; host-down leaves reports PENDING and the run is recorded failed; parse error → FAILED with attempts=3 and no further fetch.
Then: full backend suite (only the 2 known failures), commit `fix(congress): back off per report on missing PDFs, retry blips, surface outages`. Update the AGENTS.md "House trades are parsed…" entry with one sentence on the retry policy.

## Step 2 — integrate: open a PR (cloud session; the user merges)
- First: `git fetch origin && git log --oneline HEAD..origin/main` — if main moved, `git rebase origin/main` , resolve conflicts, re-run both suites.
- PR: `git push -u origin feat/congress-trades` then `gh pr create --base main --title "Congress trades: House STOCK Act portfolios in Investors, Portfolio and Research" --body "Implements docs/superpowers/specs/2026-10-15-congress-trades-design.md per docs/superpowers/plans/2026-10-15-congress-trades.md."` (end the body with the session's attribution lines if any).
- Push with `git push --force-with-lease` only if you rebased; never force-push otherwise.

## Step 3 — after merge, ON THE USER'S MAC (a cloud session cannot do this; list it in the PR description)
1. `backend/.venv/bin/python manage.py migrate` (congress 0001 + the new retry_after migration + core 0010 schedule seed) then `migrate --check`.
2. `manage.py backfill_house --since 2021` — ~45 min of PDFs at 1/s; Mac awake and on power. Afterwards spot-check `/api/congress/members/nancy-pelosi/`.
3. Copy performance fills in by itself after the nightly price refresh (01:30 UTC) and the next 14:00 UTC `sync_house` — no manual rebuild.

## Known, accepted gaps (don't fix unless asked)
- An amendment that CHANGES a trade's amount/date still double-counts (index doesn't link amendments to originals) — documented in AGENTS.md.
- No lock between backfill_house and the 14:00 sync (duplicate downloads only). Don't backfill near 14:00 UTC.
- Congress column can blank briefly when Portfolio positions change (useQueries chunking lost keepPreviousData).
- Unpriced sale leaves position held; alias-resolved member gets no party; member photos fetched but not shown.
- Senate is out of scope (efdsearch.senate.gov is geo-blocked from the user's location).
