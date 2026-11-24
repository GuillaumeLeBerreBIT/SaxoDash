# Financial correctness

**Status**: approved for development, 2026-11-23. Source: the three audits of 2026-11-22 (application,
product and Discover), de-duplicated into one backlog and checked against the code. A1, A2, B1 and B2 were
confirmed in the code; B3–B5 are taken from the audits and are verified before they are fixed.

## Problem Statement

SaxoDash tells the owner things about their own money and about the stocks they research that are not true.

- A sync where Saxo sends one row the app cannot read deletes that Position, as if it had been sold. The
  dashboard, the allocation and the alerts then describe a portfolio the owner does not have.
- The owner adds money every month. Analytics counts each deposit as a gain, so the return, the risk
  figures and the comparison with the S&P 500 are all inflated, and get more inflated with every deposit.
- A ticker of one letter (F, T, V) cannot be found, and a chart's per-symbol state is reset by ticker rather
  than by Instrument.
- The historical P/E counts a quarter's earnings from the last day of the quarter, weeks before they were
  published. Every usual-P/E range, Cheap Zone / Expensive Zone, Valuation Grade and yardstick grade is built on
  that.
- Copy Performance replays a Tracked Fund's filing with holdings taken from amendments filed later, and a
  stock split reads as the fund buying ("Added 100%" for 100 shares becoming 200).
- Missing data can read as a positive conclusion, inputs carry no date, and Discover's filter and card can
  answer the same question two ways (audit findings, not yet verified).

The MCP tools call the same code as the pages, so Claude Desktop repeats every one of these.

## Solution

Fix the numbers about the owner's own money first (group A), release, then fix the research numbers (group
B) with a one-off recalculation of everything already stored, release again.

- A sync that cannot read every row keeps the last complete set of Positions and reports the sync as
  incomplete. Only a reply that is fully understood can remove a Position.
- Analytics shows the Investment Return as Saxo measures it, time-weighted, so a deposit or withdrawal changes
  the Portfolio Value but never the Investment Return. This revives work built on 2026-10-29 and never
  merged.
- Instrument search finds one-letter tickers, and chart state follows the Instrument.
- Earnings count in the P/E only from the day they were published.
- Copy Performance treats each amendment as new information on the day it was filed, and a share change that
  the reported value shows to be a split is not a purchase.
- Stored grades, copy returns and investor moves are recalculated once on dev and once on production, so
  the fixes reach what is already on screen.

## User Stories

### Positions and sync

1. As the owner, I want a sync that could not read one of Saxo's rows to leave my Positions as they were, so
   that a parsing problem never looks like a sale.
2. As the owner, I want to be told when the last sync was incomplete, so that I know the figures are from the
   last complete sync and not from today's.
3. As the owner, I want a Position I really sold to disappear after the next sync, so that keeping old rows
   safe never keeps a closed Position on screen.
4. As the owner, I want a reply from Saxo with no positions field at all to be treated as an incomplete sync
   rather than as "you hold nothing", so that a malformed reply cannot empty my portfolio.
5. As the owner, I want a genuinely empty portfolio (I sold everything) to still clear my Positions, so that
   the safety rule does not trap me with stale holdings.
6. As the owner, I want the entry trades written from the same sync to follow the same rule, so that
   Positions and their trades never disagree after a partial sync.
7. As the owner, I want alerts that depend on my Positions to stay quiet after an incomplete sync, so that I am
   not alerted about a "sale" that never happened.

### Investment Return

8. As the owner who adds money monthly, I want a deposit to leave my Investment Return unchanged, so that I can
   see how my investments did rather than how much I paid in.
9. As the owner, I want a withdrawal to leave my Investment Return unchanged, so that taking money out does not
   look like a loss.
10. As the owner, I want my Investment Return since the account opened, so that I can judge the whole record.
11. As the owner, I want each calendar year and year to date measured from the previous year's last value, so
    that a year's figure covers exactly that year.
12. As the owner, I want the S&P 500 measured over the same window as my portfolio, so that the comparison is
    fair in my first, partial year.
13. As the owner, I want no calendar-year rows before my account existed, so that the table does not compare
    against years I was not invested.
14. As the owner, I want risk figures (volatility, drawdown, Sharpe, beta) computed from the same time-weighted
    series, so that deposits do not distort them either.
15. As the owner, I want the last good history shown with a warning saying up to when, if Saxo cannot answer,
    so that a Saxo outage does not blank the page.
16. As the owner, I want the Portfolio Value and the Investment Return named differently on screen, so that I
    never read a change in value as a gain.
17. As an MCP user, I want the performance tool to return the same Investment Return as the page, so that
    Claude does not tell me a different number.

### Finding instruments

18. As the owner, I want to search "F", "T" or "V" and find Ford, AT&T and Visa, so that one-letter tickers are
    reachable like any other.
19. As the owner, I want switching between two Instruments that share a ticker to reset the chart's zoom, line
    tool and per-symbol state, so that settings from one listing never carry over to the other.

### Historical P/E

20. As the owner, I want each quarter's earnings to count in the P/E only from the day they were published, so
    that the usual P/E range never uses a number nobody could have known on that day.
21. As the owner, I want the publication date to be the company's earnings release when the app knows it, so
    that the P/E changes on the real report day.
22. As the owner, I want a conservative fallback when the release date is unknown (40 days after a quarter, 60
    after a fiscal year), so that an unknown date never counts too early.
23. As the owner, I want the Cheap Zone and Expensive Zone on the candles to use only earnings published by each
    date, so that the bands are what I would have seen at the time.
24. As the owner, I want the Valuation Grade to use the same dating, so that "below its usual P/E" means the
    same thing everywhere.
25. As the owner, I want the yardstick and Signal Lab grades that read the P/E history recalculated once with
    the corrected dating, so that their published results are not built on the old figures.
26. As the owner, I want Discover's "below usual P/E" to use the same corrected range, so that it agrees with
    Research.
27. As an MCP user, I want the valuation history and verdict tools to use the corrected P/E, so that Claude's
    answers match the app.

### Copy Performance and fund moves

28. As the owner, I want a filing replayed with only the holdings that filing reported, so that Copy
    Performance never uses information that arrived later.
29. As the owner, I want an amendment to count from the day it was filed, as a new change to the basket, so
    that late-disclosed positions are bought when the public learned of them.
30. As the owner, I want a share-count change that the reported value shows to be a split to read as unchanged,
    so that NVDA's 10-for-1 split is not shown as a fund buying.
31. As the owner, I want genuine buying after a split still to read as Added, so that the split rule does not
    hide real moves.
32. As the owner, I want stored investor moves, signal shelves and new-filing alerts recalculated with the
    split rule, so that past "Added" claims are corrected.
33. As the owner, I want stored Copy Performance recalculated once with the amendment rule, so that the fund
    rankings reflect the corrected replay.
34. As the owner, I want House trade replays checked for the same "filed later, used earlier" problem, so that
    Congress Member results meet the same standard.

### Research honesty (verify, then fix)

35. As the owner, I want a missing figure to read as unknown, never as a pass or a quiet review, so that absence
    of data is never good news.
36. As the owner, I want reported EPS with no estimate to show as reported, not as a beat or a miss, so that a
    missing comparison is not a conclusion.
37. As the owner, I want each research figure to show how current it is (market close, fundamental period,
    release date, last successful fetch), so that I can tell stale from fresh.
38. As the owner, I want Discover's filter and its card to use one definition of each measure, so that the
    same company never passes and fails the same test.
39. As the owner, I want "one-year high" to mean one thing on every screen, so that the label is trustworthy.
39a. As the owner, I want a company with several unanswered Quality Checks never to read as strong, so that
    missing figures cannot add up to a good grade (added 2026-11-24).

### Release

40. As the owner, I want groups A and B kept in develop and released to production together in one release
    (revised 2026-11-24; the first plan released A on its own).
41. As the owner, I want each recalculation to run as a one-off command on dev first and on production after
    release, so that the stored numbers change once, deliberately, and can be checked.

## Implementation Decisions

- **Delivery**: one branch and one pull request into `develop` per item, each carrying its acceptance test.
  `develop` is released to `main` after A1, A2 and A4 (search part) are merged, and again after B.
- **Sync (A1)**: the position sync counts the rows it could not map. If any row failed, or the reply has no
  positions field, the sync upserts the rows it understood, deletes nothing, and records itself as incomplete
  through the existing sync-run record. Pruning happens only on a fully mapped reply, including a genuinely
  empty one. The Saxo client distinguishes "no positions field" from "an empty list" instead of defaulting to
  an empty list. Entry trades follow the same rule because they come from the same fetch. Paged replies are
  followed to the end before deciding.
- **Investment Return (A2)**: built on `fix/financial-correctness-a` (merged as PR #85). Analytics reads
  Saxo's account performance timeseries (time-weighted, daily since the account opened) through a portfolio
  module, runs the existing metrics on the growth of one euro, caches it for an hour, and serves the last good
  history with a dated warning when Saxo cannot answer. Calendar years and year to date start at the previous
  year's last value; the benchmark is measured over the portfolio's own window. The second commit rebuilds the
  pre-live SIM days of the net-worth history; it was already applied to the dev database on 2026-10-29 and is
  checked against production before running there. The rebase is checked against everything merged since
  (multi-user accounts, the Analytics redesign, the MCP performance tool) rather than resolved blindly.
- **Search and identity (A4, this pass)**: instrument search accepts a one-character query. Per-symbol chart
  resets key on the Instrument (uic and asset type), not the ticker. The broader collision work (two listings
  sharing a ticker across boards, saved lists and targets) and the 1,000-row transaction export are after B.
- **P/E dating (B1)**: each quarterly EPS point carries the date it became public. That date is the EDGAR
  results-release date the earnings module already finds (8-K item 2.02) when known, otherwise 40 days after the
  quarter end, or 60 days after a fiscal-year end. The trailing P/E and the percentile range include a quarter
  only from that date. Everything downstream reads the same history: the Valuation Grade, the Cheap/Expensive
  Zones, the yardsticks, the verdict and Discover. A foreign filer with no EDGAR release uses the fallback.
- **Copy Performance (B2)**: the replay builds one period per filing, each with the holdings that filing
  reported, at the first session after its own filed date. An amendment starts a new period on its filed date
  rather than replacing the original's holdings back to the original date. The share-change classifier
  compares shares and reported value: when shares change by a whole split ratio and the value does not move in
  proportion, the change is a split and reads as unchanged. The existing rebuild commands for copy performance
  and moves are the recalculation path; new-filing alerts derived from moves are regenerated with them.
- **House replays (B2)**: the House replay is checked for the same rule (a trade counts from its disclosure
  date, not its transaction date) and fixed the same way if it does not hold.
- **Recalculation (B1, B2)**: each B pull request ships a one-off management command, or uses an existing one,
  that recalculates what it changes: the stored scan P/E history and grades, verdict calls, yardstick and
  Signal Lab results for B1; copy performance, moves and alerts for B2. Run on dev before merge and on
  production after release.
- **B3–B5**: each finding is checked against the code before work starts and gets its own pull request if it
  holds. Missing values read as unknown; each input carries its market close, fundamental period, release date
  and last successful fetch; Discover's filter and card share one definition per measure.
- **B6 (added 2026-11-24, owner decision)**: the Quality Grade gains an `incomplete` outcome. A stock that would
  grade strong on its answered checks but has two or more unanswered checks is incomplete, not strong, and gets
  no action. Mixed, weak and unknown are unchanged; open calls keep the grade they opened with.
- **Usual P/E range on candles (follow-up after B, owner agreed 2026-11-24)**: drawn day by day from the range as
  it stood on each candle and B1's release dates, neutral colours, off by default, toggled from Analysis. It
  takes signal colours only if the re-run `grade_valuation` test supports it.
- **Glossary**: Investment Return, the Cheap/Expensive Zone dating and the Copy Performance amendment rule are
  already in the glossary. A `docs/decisions.md` entry records that the Investment Return is Saxo's
  time-weighted figure rather than computed from the app's own snapshots.

## Testing Decisions

- A good test drives the behaviour through the existing entry point and asserts what the owner would see:
  the Positions after a sync, the Investment Return from the performance endpoint, the P/E on a given date,
  the copy return of a fund. No test asserts on internal helpers or call order.
- **Sync**: the position sync task with Saxo's reply faked, in the existing sync task tests. Cases: one good
  and one unreadable row (both Positions kept, sync incomplete), a reply with no positions field (nothing
  deleted), a paged reply (all pages read), a genuinely empty reply (Positions cleared), a sold Position on a
  complete reply (removed). The existing test that expects a malformed row to drop a Position is reversed.
- **Investment Return**: the Analytics performance endpoint with Saxo's performance timeseries faked, in the
  analytics tests. Headline case: a deposit into a flat account yields an Investment Return of zero. Also: a
  first partial year against the same benchmark window, no rows before inception, the stale-history warning.
  The MCP performance tool test asserts the same figure.
- **Search**: the instrument search endpoint returns results for "F".
- **Chart reset**: the existing chart component tests switch between two Instruments with the same ticker and
  assert the per-symbol state resets.
- **P/E dating**: the valuation history with EPS points carrying a publication date, in the valuation tests.
  Cases: the P/E on the day before a release uses the previous four quarters; on the release day it uses the
  new quarter; an unknown release date uses the 40/60-day fallback; a quarter is never counted before its
  period end.
- **Copy Performance**: the replay in the copying tests. The existing May 15 / June 1 fixture is reversed: the
  May 15 basket holds 600, and the June 1 amendment starts a new period holding 700. A split case (100 shares
  to 200 at the same value) classifies as unchanged; a purchase after a split (100 to 250) still reads as
  Added.
- **Recalculation commands**: each command test runs on a small fixture and asserts the stored figure changes
  to the corrected one, following the existing command tests.
- Prior art: the sync task tests, the analytics API tests, the valuation tests, the investors copying and
  changes tests, the users isolation suite for anything that touches per-user rows.

## Out of Scope

- Group C wording findings ("fund buying", the default Discover ranking, a golden symbol set for candles), and
  the 1,000-row transaction export and the two-listings ticker collision: after this pass.
- Group D product direction: the review loop, beta hardening (sessions, shared caches), measuring a pilot
  group, the audit's simplify/remove list. The owner is the only real user, so session hardening waits.
- The Automated Discover shortlist: parked until B5 is done; only the explorer shipped.
- Removing bank accounts: a separate project, kept apart because it also touches net worth.
- New MCP tools and the Cowork plugin: the existing tools inherit these fixes.
- Rebuilding 13F portfolios from raw filings beyond the amendment and split rules above.
- Favicon and brand assets.

## Further Notes

- The SaxoDash homelab still has two unverified steps (a `restore.sh` test against a scratch database, and
  retiring the Mac's `db.sqlite3`). Run the restore test before the first production recalculation, so a bad
  recalculation can be undone.
- The production recalculations should be preceded by the documented backup-before-migration step.
- The Saxo TWR commits were written before multi-user accounts; the performance cache must be per user.
