# One P/E consensus: spec

Status: ready for agent. Supersedes the P/E parts of the 2026-11-17 and 2026-11-18 design notes and the 2026-11-25 band entry. Decision record: `docs/decisions.md`, entry "One consensus for the P/E range (2026-11-26)". Graded evidence: `docs/research/2026-11-valuation-yardsticks.md`.

## Problem Statement

The app gives the owner three different P/E readings that disagree. The chart band, the verdict's valuation word, the Discover value sort and filters, and the growth line each use a different rule or word for "cheap" and "expensive". The owner cannot tell which reading to trust, and the docs describe a different design from the one the code ships.

The graded research makes the situation worse. The P/E range has no demonstrated edge as a buy or sell signal. The cheap flag did worse than average: -2.6% over the full history and -7.4% since 2023, measured as forward returns over 250 sessions. The expensive flag showed no edge. The growth line's cheap flag showed no edge, and its expensive flag did worse than average (-2.5% full history, -5.5% since 2023). Yet the app still tells the owner a stock is "cheap" or "expensive" on P/E, and sorts and filters Discover by it. That claims an edge the evidence does not show.

## Solution

One P/E consensus, used everywhere:

- The usual P/E range is the single rule the app uses: the same function computes the range for the chart, the percentile figures and the verdict's valuation word. It uses earnings as they were known on each day, not as later restated.
- P/E is an indication of where the price sits against its own history. It is never a buy or sell signal. It does not open, block, or label a call.
- On the chart, the zones show where the price sits within the usual range. They are off by default. The owner turns them on in settings. When on, they are shaded in neutral colours and labelled by position only: "Lower part of usual range", "Middle", "Upper part". The words cheap and expensive are not used for P/E anywhere.
- The verdict's valuation word stays, reads "Below / Within / Above usual P/E", and carries the caption "rule of thumb, not a buy or sell signal" wherever it appears.
- Discover drops the value sort and the value filters. Its position filter uses the same three position labels and ranks nothing.
- The growth line is not shown anywhere in the product. Its flags stay in the backend as research-only, with the grading report.
- The graded evidence is stated once, in the band's explanation, with the caveat that "worked against" means the forward return was negative, not that the flag's direction was right.
- Any future P/E call requires a new, pre-registered out-of-sample test before it ships.
- "Valuation Grade" is the user-facing name for where today's P/E sits within the usual range.

## User Stories

1. As the owner, I want one P/E range rule used on the chart, in the verdict and in Discover, so that I never see two readings that disagree.
2. As the owner, I want the P/E range to be computed from earnings as they were known on each day, so that the history does not look better than it was at the time.
3. As the owner, I want P/E described as an indication of value and never as a buy or sell signal, so that I do not act on it as a trading rule.
4. As the owner, I want the chart zones to be off when I open a chart, so that the chart starts clean.
5. As the owner, I want to switch the zones on in settings, so that I can see where the price sits in the usual range when I want to.
6. As the owner, I want the zones shaded in neutral colours, so that a shaded area does not read as a buy or a sell.
7. As the owner, I want the zone labels to say only where the price sits ("Lower part of usual range", "Middle", "Upper part"), so that the chart never says cheap or expensive for P/E.
8. As the owner, I want the zones and labels to show only when I have switched them on, so that they never intrude on a chart I have not chosen to annotate.
9. As the owner, I want the verdict's valuation word to read "Below / Within / Above usual P/E", so that the wording matches the chart.
10. As the owner, I want the verdict's valuation word captioned "rule of thumb, not a buy or sell signal" everywhere it appears, so that the caveat travels with the word.
11. As the owner, I want the valuation word never to change the verdict's call, so that a P/E reading cannot open, block or relabel a call.
12. As the owner, I want Discover to stop sorting by how far below its usual P/E a stock is, so that the list does not rank stocks as bargains.
13. As the owner, I want Discover's value filters removed, so that I am not offered a cheap or expensive screen.
14. As the owner, I want Discover's position filter to use the same three position labels as the chart, so that the vocabulary is the same on every screen.
15. As the owner, I want the position filter to filter only and never rank, so that position does not look like a recommendation.
16. As the owner, I want the chart guide's P/E entry to describe the zones as they now behave (off by default, shown on request), so that the guide is not wrong.
17. As the owner, I want the chart guide to state the evidence once: the cheap flag did worse than average, and the expensive flag showed no edge, so that I know the range is not a proven signal.
18. As the owner, I want the evidence sentence to say what "worked against" means, so that I do not read it as the flag having been right in the wrong direction.
19. As the owner, I want the growth line absent from the product, so that I am not shown a valuation I have not validated.
20. As the owner, I want the growth flags kept in the research report, so that the grading can be re-run and reviewed.
21. As the owner, I want any future P/E-based call to require a new out-of-sample test first, so that the product never ships a P/E signal on the strength of an in-sample result.
22. As the owner, I want the term "Valuation Grade" used for where today's P/E sits, so that the name is consistent across the app and docs.
23. As the owner, I want the decision record and the code to say the same thing, so that the docs are not a second source of truth.
24. As the owner, I want the old 17 Nov and 18 Nov P/E wording removed from the design notes, so that nobody builds from superseded text.
25. As the owner, I want the existing settings for the range colours to keep working, so that my colour choice is not lost, with only the labels changed.
26. As a future maintainer, I want the usual-range computation to have one test that fails when the rule changes, so that a change in the rule is noticed.
27. As a future maintainer, I want the verdict's caption tested, so that the caveat cannot disappear by accident.
28. As a future maintainer, I want Discover's sort and filter behaviour tested against the new contract, so that a value sort cannot come back unnoticed.
29. As a future maintainer, I want the zone default tested, so that the zones cannot quietly switch on for everyone.
30. As a future maintainer, I want the position labels tested in one place, so that the wording cannot drift between the chart, the verdict and Discover.

## Implementation Decisions

- The usual P/E range is one rule. It is computed by the existing valuation module from point-in-time earnings, and every consumer calls that single function. No consumer keeps its own cheap or expensive threshold for P/E.
- The usual-range response keeps its current shape: a list of dated low and high P/E levels, and a list of warnings. Prices are derived from the same trailing earnings as before. No new field is added unless a consumer needs one.
- The verdict's valuation word is a derived label from the usual range. It has three values (below, within, above) plus not judged. It is informational and carries a fixed caption. It has no input into the verdict's call, its blocking rules or its labels.
- Position labels are the only vocabulary for P/E position on the chart, in Discover and in the verdict's sentence. Their names are fixed: "Lower part of usual range", "Middle", "Upper part".
- Chart zones are a per-user display setting, default off. When on, they use neutral colours. The colour settings keep their storage and behaviour; only their labels change.
- Discover's ranking is unchanged for every other lens. The P/E value sort and the P/E value filters are removed. The position filter returns a subset and never reorders.
- The growth line has no user-facing surface. Its computation and grading stay in the backend and research report, behind no screen or API.
- The evidence sentence is a fixed string. It states the graded forward returns for the cheap and expensive flags and what "worked against" means. It appears once, in the band's explanation.
- Shipping any new P/E-based call requires a pre-registered out-of-sample test. This is a process rule recorded in the decisions log, not code.
- The P/E valuation module's constants and its release-lag assumptions are not changed by this spec.
- Schema changes: none. API contract changes: none beyond the removal of the cheap and expensive labels from user-facing text.

## Testing Decisions

- Test external behaviour only: what the usual-range endpoint returns for a fixture series, what the verdict's valuation word and caption are, what Discover returns for a sort and filter request, and what the chart shows by default.
- The usual-range rule gets one test that fails if the rule changes: the range at a given day uses earnings known on that day, not later restatements.
- The verdict test checks that the valuation word and its caption are present, and that the call is identical with and without a P/E reading. This is the regression guard for "P/E never changes the call".
- Discover tests check that no value sort or value filter exists in the contract, and that the position filter returns the same rows in the same order as the unfiltered list.
- The chart default test checks that zones are off for a fresh user and that turning them on shows only the three position labels.
- Frontend label tests check the three position labels in one place, so the chart, the verdict and Discover cannot drift apart.
- Prior art: the backend usual-band and valuation test modules, the verdict and verdict-engine tests, the Discover and Boards component tests, the chart pane tests, and the Research page test.
- Existing tests that assert cheap or expensive P/E wording are updated to the new contract, not deleted.

## Out of Scope

- Changing the valuation maths, the release-lag constants, or the usual-range window.
- Fixing the grading's limits: survivorship (the universe is today's 513 stocks), unadjusted split suspects, stored rather than first-reported fundamentals, and the release-lag assumptions. These are reported, not fixed here.
- Re-running or extending the research beyond the existing graded report.
- Any new P/E-based signal, screen or alert.
- Explaining the growth flags in depth. The owner has deferred this to a later session.
- Merging PR #88 or deploying.
- The planned deletion of the two superseded plan files and the commit of the decisions-log edit. These are handled as a separate housekeeping step on the branch.

## Further Notes

- The grading result is a forward-return result, so "worked against" means the forward return was negative after the flag fired. It does not mean the flag's intended direction was right. The copy must say so wherever the evidence is stated.
- The owner's stated principle, which governs every decision above: P/E is an indication of value, not a buy or sell signal, and zones show position.
- Open for confirmation before coding: the exact wording of the caption and the evidence sentence. The labels and the default are settled.
