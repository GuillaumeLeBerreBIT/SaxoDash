# Money removal: tickets

Spec: `../../specs/2026-11-24-money-removal-design.md`.

| # | Ticket | Blocked by | Release |
|---|--------|------------|---------|
| 01 | Stop the bank background syncs | None | 1 |
| 02 | Remove Money from the app | 01 | 1 |
| 03 | Saxo-only net worth and drop the bank data | 02 | 1 |
| 04 | Config and docs cleanup | 02 | 1 |
| 05 | Owner checklist | None (gates release 1 reaching `main`) | 1 and after |
| 06 | Uninstall the empty enablebanking app | 03, 04, production on release 1 | 2 |

Work the frontier: any ticket whose blockers are done. 03 and 04 can run in parallel.
Do the work in a worktree under `.worktrees/`, branched from `develop`. Release 1 is
tickets 01 to 04 merged into `develop` and then promoted to `main`. Release 2 is ticket 06.
