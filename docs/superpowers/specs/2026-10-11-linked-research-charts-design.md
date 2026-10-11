# Linked Research Charts (Phase 5C) — Design

Scoping note: `docs/superpowers/plans/2026-10-10-phase-5c-research-chart-linking.md`.

## Goal

In the multi-pane Research chart workspace (`/research/chart`, up to four panes), let the user compare timing across symbols: the same period in every pane, and hovering a day in one pane shows that day in the others.

## Scope

In: linked time range and linked crosshair, behind one workspace-level **Link panes** toggle.

Out: the compare overlay (second symbol drawn in one pane). Any change to single-pane behaviour. Intraday horizons (bars stay daily or coarser).

## Decisions

- **One toggle**, "Link panes", linking both time range and crosshair. Off by default, so today's behaviour is unchanged. Saved per browser with the layout.
- **Linking is by date, not bar offset.** `timeView.offset` counts bars back from each pane's own latest bar, so it means a different day for symbols that end on different days or keep different holiday calendars.
- **Leader/follower.** The pane the user pans or zooms is the leader. No pane stores a second source of truth; followers derive their `timeView` from the leader's date range.
- `lib/timeWindow.js` remains the only module that knows window rules.

## Time range

`lib/timeWindow.js` gains two pure functions:

- `windowToDates(window, bars)` returns `{ from, to }`, the dates of the first and last visible bar.
- `timeViewForDates({ from, to }, bars, range)` returns a `timeView` (`offset`, `barCount`) for a pane's own bars: `to` maps to the last bar dated on or before `to`, `from` to the first bar dated on or after `from`, then the result goes through `zoomTimeView`/`panTimeView` so the existing clamps apply (minimum `MIN_VISIBLE_BARS`, offset within `maxOffset`).

`usePaneViews` takes `linked`. When linked and a pane's `setTimeView` runs, the hook computes the leader's resolved window, converts it to dates, and writes the derived `timeView` into every other filled pane. It needs each pane's bars, so the pane's bar dates are passed up through a small registration callback rather than refetched.

Edges:

- A follower whose history does not cover the window shows what it has and clamps at its own edge. It does not blank.
- A follower whose bars are entirely outside the date range clamps to its nearest edge.
- Empty panes are skipped.
- A range button pick, a symbol switch, or a double-click on the date strip resets all linked panes to `LATEST_TIME_VIEW` (extends `rangePicked`).
- Turning the toggle on aligns the other panes to the active pane's current window. Turning it off leaves every pane where it is.
- `yScale` and `yShift` are never linked; each pane's price axis is its own.

## Crosshair

A shared hover date lives in a workspace-level store (a context provider around the panes, value `date | null`).

- The pane under the pointer keeps its own index-based `hover` unchanged, and publishes `bars[hover].date` to the store when linked, clearing it on leave.
- Every other pane maps the shared date to its nearest bar at or before that date (`barIndexForDate(bars, date)` in `lib/timeWindow.js`, beside the other date-window functions).
- If the matching bar is earlier than the date (holiday or missing day), the guide is drawn dimmed. If the date is outside the pane's visible window, nothing is drawn.
- The OHLC readout in a following pane shows the matched bar's values. When the match is a previous day, the readout shows that bar's date so it is not mistaken for the hovered day.
- Not linked: the store is never written and panes behave exactly as now.

## Persistence

The saved workspace shape gains `linked: boolean`. `sanitizeWorkspace` defaults it to `false` for layouts saved before this change, so no migration beyond sanitising is needed. `useChartWorkspace` exposes `linked` and `setLinked`.

## UI

A toggle in the existing chart toolbar, next to the layout picker, using the shared toggle primitive from `docs/design-system.md` and the `saxodash-design-system` skill. It is shown only when the layout has more than one pane. 44px target below `md`, tab/switch semantics with an accessible name ("Link panes"), no new colour tokens.

## Testing

Test-first, vitest.

- `lib/timeWindow`: date round-trips; mismatched calendars; follower shorter than the window; follower entirely outside the window; minimum-bar clamp; offset clamp.
- Crosshair mapping: exact date, holiday (previous bar, dimmed flag), before first bar, after last bar, outside visible window.
- `chartWorkspace`: `linked` sanitised from absent, non-boolean and valid values.
- `usePaneViews`: linked pan/zoom propagates; unlinked does not; range pick and symbol switch reset; empty panes skipped.
- Component specs: toggle visible only with more than one pane; linked pan moves a second pane; hover in one pane draws the guide in another.
- Screenshot harness at 1440 and 390, including four panes with some empty.

eslint clean (no setState in effects), zero code comments.

## Not changing

Chart data fetching and caching (`useChartData`, one 1,200-bar fetch per instrument), the active-pane-is-the-URL rule, annotations, indicators, and the bars-as-identified-by-date rule.
