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
- **Leader/follower.** The pane the user pans or zooms is the leader. Followers store only the leader's date range (`followDates`) and derive their `timeView` from it against their own bars; a pane's own pan or zoom clears its `followDates`, so any pane can lead.
- `lib/timeWindow.js` remains the only module that knows window rules.

## Time range

`lib/timeWindow.js` gains the date-window functions:

- `windowToDates(window, bars)` returns `{ from, to }`, the dates of the first and last visible bar.
- `timeViewForDates({ from, to }, bars)` returns a `timeView` (`offset`, `barCount`) for a pane's own bars: `to` maps to the last bar dated on or before `to`, `from` to the first bar dated on or after `from`, clamped to at least `MIN_VISIBLE_BARS`, at most every bar, and an offset inside the data.
- `resolveTimeViewChange(next, current, { bars, range })` applies a pan or zoom to the view the pane is displaying (which for a follower is the derived one, not its stored offset) and returns the new `timeView` with the dates of its window.

`usePaneViews` takes `linked`. A pane's pan or zoom goes through `commitTimeView(timeView, dates)`: the leader stores the `timeView` and, when linked, every other filled pane stores the `dates` as `followDates`. Nothing is written into a follower's `timeView`: only the pane knows its own bars, so `useChartData` derives the follower's effective `timeView` from `followDates`. Each pane also reports the dates it is showing (`reportWindow`), kept in a ref, so turning the toggle on can align the others to the active pane.

Edges:

- A follower whose history does not cover the window shows what it has and clamps at its own edge. It does not blank.
- A follower whose bars are entirely outside the date range clamps to its nearest edge.
- Empty panes are skipped.
- A range button pick resets every pane to `LATEST_TIME_VIEW` and clears the linked window (extends `rangePicked`).
- A symbol switch does not reset the other panes. The pane that got the new symbol adopts the last linked window, so every pane keeps showing the same period.
- A double-click on the date strip publishes the leader's latest window as dates, so followers match the leader's latest period (not necessarily their own latest bar).
- A layout loaded with linking already on is not aligned until a pane leads; each pane starts on its own latest bars.
- Turning the toggle on aligns the other panes to the active pane's current window. Turning it off leaves every pane where it is.
- `yScale` and `yShift` are never linked; each pane's price axis is its own.

## Crosshair

A shared hover date lives in a workspace-level store (a context provider around the panes, value `date | null`).

- The pane under the pointer keeps its own index-based `hover` unchanged, and publishes `bars[hover].date` to the store when linked, clearing it on leave.
- Every other pane maps the shared date to its nearest bar at or before that date (`matchBarByDate(bars, date)` in `lib/timeWindow.js`, beside the other date-window functions; it answers `{ index, exact }`).
- If the matching bar is earlier than the date (holiday or missing day), the guide is drawn dimmed. If the date is outside the pane's visible window, nothing is drawn.
- The OHLC readout in a following pane shows the matched bar's values. The legend already prints the hovered bar's date, so a match on a previous day shows that bar's date and is not mistaken for the hovered day; only the guide is dimmed.
- Not linked: the store is never written and panes behave exactly as now.

## Persistence

The saved workspace shape gains `linked: boolean`. `sanitizeWorkspace` defaults it to `false` for layouts saved before this change, so no migration beyond sanitising is needed. `useChartWorkspace` exposes `linked` and `setLinked`.

## UI

A `RailButton` in the chart tool rail, beside the Layout menu, with `aria-pressed` and the accessible name "Link panes". It is shown only when the layout has more than one pane, and is hidden below `lg` exactly like Layout: below `lg` only the active pane is shown, so there is nothing to link. No new colour tokens.

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
