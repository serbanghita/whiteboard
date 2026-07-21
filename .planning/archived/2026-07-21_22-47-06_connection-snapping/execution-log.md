# Execution Log: connection-snapping

Executed 2026-07-21, seven signed commits (`5a39520..1487669`), all steps green on first run
except two documented mid-flight fixes (below). Final state: **247/247 tests, `tsc --noEmit`
clean, dist rebuilt, live browser check passed with screenshots.**

## Commits

| Step | Commit | Summary |
|---|---|---|
| bookend | `5a39520` | docs(plan): connection-snapping plan and critique (3 iterations) |
| 1 | `c300d93` | inflated-bbox snap rule (`connectionSnapTarget` replaces `connectionPointNear`; ConnectionSystem swap + scoped `stop()` guard) |
| 2 | `9f033a8` | smoke tests for margin/body/topmost snapping (new x ≥ 3000 block) |
| 3 | `8130dac` | dots only on the snap target; `renderConnectionTargets` gate extended to `resizeHandleId === 'start'/'end'`; first-ever unit coverage for the method |
| 4 | `2012173` | endpoint-drag snap + re-attach (ResizeSystem `connectableQuery`, exclusion, `finishEndpointDrag`); line-940 test redirected to open space |
| 5 | `037eba4` | smoke tests: endpoint re-attach + live pin, component creation, other-end exclusion, in-place dedup (undo/redo), one-step re-attach |
| 6 | `1487669` | CLAUDE.md + CHANGELOG rework, TODO removed, dist rebuilt |

## Deviations from plan

1. **`src/autoSelect.ts` gained a `suppressedPressCount` stamp** (part of step 4, not in the plan).
   Step 4's first test run failed two pre-existing tests ("draws a line with two clicks",
   "selects and drags a line…"): a two-click line commits on a **press edge**, and
   `autoSelectFreshShape` switches to the cursor tool mid-frame **before** ResizeSystem runs —
   ResizeSystem then claims that same press as an endpoint grab (pre-existing, previously a
   harmless no-op) and, with snapping, glued the fresh line's endpoint to any nearby leftover
   shape. Fix: the commit press is suppressed via the existing text-edit idiom, making it inert
   for all four press consumers. Documented in CLAUDE.md's system-order section.
2. **The new smoke-test block resets the camera in `beforeEach`** (step 2). The block runs last in
   the shared-world file and the properties-panel suite leaves the camera panned (+100y), which
   shifted every screen→world conversion. Mirrors the camera suite's own reset idiom.

## Verification

- `npx tsc --noEmit` clean after every step (LSP diagnostics checked; known bivariance false
  positives ignored per CLAUDE.md).
- Full vitest suite after every step; 237 → 242 → 247 tests as coverage landed.
- **Live browser check** (esbuild dev server on :8000, Playwright headless-shell driving board1
  of the real demo): (a) fresh drag from Client's east dot over GW's **body** → GW's dots appear
  with a ring on the glue point, line visibly glued mid-drag, release attaches; (b) the reported
  **reconnect repro** — endpoint detached to open space, re-dragged over GW → dots + ring appear
  (this exact interaction previously showed nothing), release re-attaches; (c) dragging GW
  afterwards moves the line endpoint with it (pin live). Zero console errors. Screenshots
  retained in the session scratchpad (`shots/A-*.png`, `shots/B-*.png`).
