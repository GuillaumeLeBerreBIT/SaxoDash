# Phase 5C: Linked Research Charts (future plan, not started)

> Status: scoping note saved on 2026-10-10 for a later session. Not approved, not implemented. When picked up, run brainstorming first (architectural path: it changes how the chart panes share state), then write the full TDD plan with superpowers:writing-plans.

**Goal:** In the multi-pane Research chart workspace (`/research/chart`, up to four panes), let panes share a crosshair and a time range, and let one pane overlay a second symbol for comparison.

## Why this is the riskiest Phase 5 item

The chart is a hand-built canvas, not a library chart. Time window, y-scale and annotations are each owned by small modules, and each pane currently fetches and holds its own state. Linking panes means introducing shared state across panes without making the single-pane case worse or the pan/zoom code (`lib/timeWindow.js`, `usePaneViews`) wrong. AGENTS.md records several decisions that constrain it; do not reverse them silently:
- The visible bars are a time window `{start, end}` into one 1,200-bar fetch; `lib/timeWindow.js` is the only module that knows the window rules; the controls store a `timeView`.
- The active pane is the URL (`?symbol=`); other panes render from stored uic + asset type and never re-resolve (`useChartWorkspace`, keyed on `location.key`).
- Bars are identified by date, so horizons are daily or coarser; a pane's price scale is the bars' own (`priceGeometry`), never widened by annotations.

## Existing building blocks (verified 2026-10-10)

`frontend/src/components/research/`: `ChartPane.jsx`, `ChartCanvas.jsx`, `TVChart.jsx`, `panes.jsx`, `usePaneViews.js`, `useChartControls.js`, `useChartData.js`, `useChartWorkspace.js`; `frontend/src/lib/chartLayouts.js` (layout presets), `lib/timeWindow.js`, `lib/chartGeometry.js`, `lib/chartWorkspace.js`.

## Scope candidates (decide in brainstorming; each can ship alone)

1. **Linked time range.** A workspace-level toggle "Link time range": panning/zooming one pane applies the same `{start, end}` date window to the others (clamped to each pane's own bars, since symbols have different histories). Open: link by date window or by bar offset; what happens when a pane's data does not cover the window.
2. **Linked crosshair.** Hovering a bar in one pane shows a vertical guide and the OHLC readout at the same date in the other panes. Open: panes with no bar on that date (different calendars); a shared hover store versus callbacks.
3. **Compare overlay.** Add a second symbol to one pane as a line normalised to 100 (or % change) at the left edge of the visible window; separate price axis or shared percent axis. Open: whether the overlay reuses `/api/research/chart` caching with a second Uic key (`instrumentKey` includes asset type), overlay persistence in the saved workspace shape (`saxodash:chart-workspace`), and how it interacts with indicators (they are computed per primary symbol).

## Constraints to carry into the plan

- Zero code comments; test-first; eslint clean (no setState in effects); the Phase 4 accessibility conventions (tab semantics, 44px targets below md).
- The single-pane layout must not change behaviour when nothing is linked.
- Workspace storage is per browser; a shape change needs a migration of the saved layout (`chartWorkspace.js`).
- Check `docs/design-system.md` and the `saxodash-design-system` skill for the toolbar and toggle primitives before adding controls.

## First steps when resumed

1. Read `lib/timeWindow.js`, `usePaneViews.js` and `useChartWorkspace.js`; write down how a pane's `timeView` is stored and who owns it.
2. Pick one of the three scope candidates (linked time range is the smallest) and brainstorm it to a spec.
3. Verify with the screenshot harness at 1440 and 390, including the four-pane layout with empty panes.
