# Archive Info

> Title: Connection Snapping (Inflated-Bbox Snap + Endpoint-Drag Re-Attach)
> Keywords: connection snapping, reconnect, inflated bbox, endpoint drag, re-attach, ResizeSystem, connectionSnapTarget, dot reveal
> Archived: 2026-07-21 22:47:06
> Execution Status: COMPLETED

## Files Included

- plan.md
- critique.md
- execution-log.md

## Notes

- Originated from a user bug report ("line doesn't snap and no connector points show"); the
  confirmed repro was the endpoint-**reconnect** path (ResizeSystem had no snap logic — the
  long-standing CLAUDE.md TODO), with a secondary UX gap in the fresh-line path (12px per-dot
  aim, no body snapping).
- Refined through 3 critique iterations plus a full-file leftover-geometry audit of the shared-
  world smoke suite. Executed 2026-07-21 across 6 signed `plan-execute:` commits (c300d93..1487669)
  plus docs bookends; one mid-flight fix (suppressed commit press in autoSelect.ts) and one test
  harness fix (camera reset), both documented in the execution log.
- Final state: 247/247 tests, tsc clean, dist rebuilt, live Playwright check of both scenarios
  with screenshots, zero console errors.
