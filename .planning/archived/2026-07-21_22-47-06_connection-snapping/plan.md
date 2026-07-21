# Connection snapping: inflated-bbox snap + endpoint-drag re-attach

## Context

**User-confirmed repro**: drawing a *fresh* connection line (drag out of a selected shape's dot, ConnectionSystem path) works — nearby shapes show their dots and the endpoint snaps. The failure is the **reconnect** path: after a line's endpoint is detached, dragging that endpoint's ring handle goes through `ResizeSystem`, which has **no snap logic at all** (`src/system/ResizeSystem.ts:138-147`) — shapes the cursor nears show no connection points and the endpoint can never re-attach. This is the documented CLAUDE.md TODO and the primary fix of this plan (Steps 3-5); the endpoint-drag tests are the primary regression coverage.

Secondary improvement: even on the working fresh-line path, attachment requires releasing within 12 screen px of the exact n/e/s/w dot (`CONNECTION_SNAP_RADIUS`, `src/handles.ts`) — hovering over the target's body does nothing, so lines easily land dangling (and once dangling, the broken reconnect path above compounds it).

Confirmed UX decisions: dots shown **only on the nearby (snap-target) shape**, not all shapes; hovering anywhere over a shape's body snaps to its **nearest** connection point.

## Execution protocol

- Each step ends with a commit `plan-execute: connection-snapping step N - <summary>`, created via the **github-commit-policy** skill (author identity, GPG signing, no Claude/co-author trailers).
- Planning-artifact bookends (repo convention, same skill): before Step 1, commit `.planning/connection-snapping/` as `docs(plan): connection-snapping plan and critique (3 iterations)`; after Step 6, write the execution log and archive the plan folder (`docs(plan): execution log for connection-snapping`, then `docs(plan): archive connection-snapping`). Never commit `.DS_Store`.
- Steps 1-3 land feature A (inflated-bbox snap + target-only reveal, fresh-line path) complete and consistent; Steps 4-5 land feature B (endpoint-drag re-attach, the primary fix); Step 6 is docs + bundle.
- A concurrent agent works in this repo — re-read each file immediately before editing it. Re-verified against HEAD 698c8c4 (clean tree): the v2 save/load + `sysType` work does not touch `handles.ts`, `ConnectionSystem.ts`, `ResizeSystem.ts`, or `renderConnectionTargets`, and line attachments already serialize.

## Tooling note (user request)

Use the TypeScript LSP (typescript-lsp plugin) for diagnostics, go-to-definition, and references while editing `.ts` files — prefer it over grep navigation. `npx tsc --noEmit` is the authority: the language server false-positives `ComponentConstructor` bivariance at `registerComponents` call sites (visible today in RenderSystem.test.ts), and flags `WebGLRenderer.test.ts`'s `jest.Mock` cast / unused `vi` import, which tsc accepts on HEAD (exit 0). None of these diagnostics are regressions this plan could cause — do not "fix" them here.

## Design

**Unified proximity rule**: a candidate shape is "near" when the cursor is within its bounding box inflated by `CONNECTION_SNAP_RADIUS / scale` on all sides. Topmost near shape wins (reverse-scan query order, like MousePressSystem). The endpoint glues live, every frame, to the nearest of that shape's 4 connection points. This subsumes the old per-dot 12px rule (all dots lie on the bbox boundary).

**Reveal = snap target**: `selectionComp.connectionSnap` doubles as glue state and dot-reveal target for both drag types — **no new component field needed**. RenderSystem draws dots only for `connectionSnap.entityId` (+ ring on the snapped handle); no target → no dots.

## Steps

### 1. Inflated-bbox snap rule — `src/handles.ts` + `src/system/ConnectionSystem.ts` (one commit: deleting the old helper and swapping its only call site must not be split, or `tsc` breaks between commits)

`src/handles.ts` — replace `connectionPointNear` with `connectionSnapTarget`, same signature `(candidates, x, y, scale, excludeEntityId)`. Logic: materialize candidates, scan **in reverse** (last = topmost); skip `excludeEntityId`; test cursor against `getEntityBounds(entity)` (`src/shape.ts` — already the bbox for circles) inflated by `CONNECTION_SNAP_RADIUS / scale`; first match wins; return its nearest `getConnectionPoints()` handle by squared distance, no distance cap. Reword `CONNECTION_SNAP_RADIUS`'s doc comment (now a bbox inflation margin).

`src/system/ConnectionSystem.ts`:
- `findSnap` (line ~150): call `connectionSnapTarget`. Drag/release/stray-click flow otherwise unchanged.
- `stop()` (line ~160): guard the snap clear — only `connectionSnap = null` when `selectionComp.resizeHandleId` is **not** `'start'`/`'end'`. In-code comment, precisely scoped: "prevents a one-frame dot flicker on the press frame of an endpoint drag (Resize runs first and set the snap this frame); attachment correctness never depends on this — ResizeSystem recomputes at release."

Existing smoke tests stay green through this commit: (1195,150) still snaps to B.w; (1180,350) is 20px from B's bbox, outside the 12px inflation; the endpoint-drag test at line ~940 is unaffected until Step 4 (ResizeSystem has no snap yet).

**Full-file leftover audit (done — do not re-derive)**: the smoke suite boots ONE app in `beforeAll`, so shapes persist across all suites and any drag ending near a leftover's inflated bbox could newly snap. Audited every press-drag-release against all leftover geometry: `"draws a connection line from a shape's connection handle"` (line ~691, dangling end at (300,150)) is clear — the rectangle-tool test at (300,100) cancels via Escape and leaves nothing; nearest real candidates are ≥113px away. `"resizes a line by dragging an endpoint handle"` (line ~461, endpoint to (150,650)) is clear of everything existing at its runtime (nearest inflated bbox ends at y=482); the camera-suite rect (400,600)-(450,650) is drawn later and doesn't reach either point. The preview-cancel test (~line 732) only asserts entity counts. The ONLY existing test the plan changes is line ~940 (Step 4). New tests must respect the same constraint — hence the x ≥ 3000 rule.

### 2. Feature-A smoke tests — `src/__tests__/app.smoke.test.ts`

New describe block, coords at x ≥ 3000 (clear of earlier suites; state the range in the block's header comment, matching file convention). Source shape for the drags: A = (3000,100)-(3100,200), dragging from A.e (3100,150) — far clear of every target below:
- **Margin snap** (the behavior change, concrete tie-free coords): target B = (3200,100)-(3300,200), cursor (3310,130) — 10px right of the east edge (inside inflated bbox, x ≤ 3312) but ≈22.4px from nearest dot e(3300,150), so the old rule would NOT snap; assert glue to `e` (n is ≈41px away, no tie).
- **Body snap**: same source A, target B2 = (3200,300)-(3300,400), cursor at interior point (3290,350) — nearest dot is `e`(3300,350) at 10px (n/s are 64px, w is 90px; no tie). Live `connectionSnap` set mid-drag, endpoint glued to `e`; release attaches.
- **Topmost wins**: fresh row (y ≥ 600): draw R1 = (3200,600)-(3300,700) then R2 = (3250,650)-(3350,750) (R2 later = topmost); cursor (3280,680) inside both → snap target is R2.
- Refresh the comment on `"does not snap beyond the snap radius"` (now: "20px from B's bbox edge — outside the inflated bbox").

### 3. Target-only dot reveal — `src/system/RenderSystem.ts` + `src/system/__tests__/RenderSystem.test.ts`

Rewrite `renderConnectionTargets` (lines 150-175): active when `connectionHandleId` set **or** `resizeHandleId === 'start' || 'end'` (corner ids `nw/ne/sw/se` keep rect/circle resizes out; the endpoint-resize arm is inert-but-harmless until Step 4 — endpoint drags don't set `connectionSnap` yet, and the snap guard below no-ops). Then require `connectionSnap`, fetch that one entity via `world.getEntity(snap.entityId)` (null-check: it may have been deleted), draw its 4 dots + ring on the snapped handle. The loop over all renderables goes away. Update the doc comment.

`RenderSystem.test.ts` (mock-renderer harness exists; zero current coverage of `renderConnectionTargets`): gate closed → 0 dots; `connectionHandleId` + snap on r2 → exactly 4 dots on r2 + 1 ring, **0 on r1**; snap null → 0 dots; `resizeHandleId='start'` + snap → dots; `resizeHandleId='se'` → 0 dots. Set SelectionRectangleComponent fields directly (no selection membership, so overlay dots don't pollute counts).

### 4. Endpoint-drag snap + re-attach — `src/system/ResizeSystem.ts` + wiring (primary fix; includes the one existing-test redirect)

- Constructor gains `connectableQuery: Query` (3rd param); wire in `Whiteboard.setupECS` (line 245): `createSystem(ResizeSystem, selectionQuery, connectableShapesQuery)` — the query already exists (line 237).
- New private state: `excludeEntityId: string | null` — set on press (inside the existing detach block, lines 94-101) to the **other** end's attached `entityId` (null if none). Prevents both ends on one shape, mirroring ConnectionSystem's source exclusion.
- Hoist `const scale = getCameraScale(this.world)` to the top of `update` (held/release branches need it now).
- Held frames (~line 127): when `activeHandleId` is `'start'`/`'end'`, compute `connectionSnapTarget(connectableQuery.execute().values(), mouseComp.x, mouseComp.y, scale, excludeEntityId)`. Snapped → `applyResize(target, snap.handle.x, snap.handle.y)` (grab offset ignored while glued) + set `selectionComp.connectionSnap`. Unsnapped → existing offset move + `connectionSnap = null`. `applyResize` itself stays unchanged.
- Release (before `stop()` in the `!IsMousePressed` branch, ~line 112): `finishEndpointDrag(...)` — no-op unless an endpoint drag was live; **recomputes** the snap at release-time cursor (do NOT read `connectionSnap` — it can be wiped in the press+release-between-frames case). If snapped: set the line's endpoint coords, add `LineAttachmentComponent, { start: null, end: null }` if the line lacks it (ECS requires explicit props), set `attachment[side] = { entityId, handleId }`, `isDirty = true`. Unsnapped: nothing (endpoint stays put).
- `stop()`: when `activeHandleId` was `'start'`/`'end'`, clear `selectionComp.connectionSnap`; always null `excludeEntityId`. (Conditioning keeps idle-frame `stop()` calls from touching ConnectionSystem's state.)
- Same-frame pipeline is already correct: Resize → LineAttachment (re-pins) → Render → History (release-edge snapshot = one undo step, automatic).
- **Same commit**: `"detaches only the grabbed side..."` (app.smoke.test.ts ~line 940) breaks here — destination (1650,760) is inside shape B → now re-attaches. Redirect to open space (e.g. `moveTo(1650, 900)`, clear of every inflated bbox in that column) and update expectations, keeping it a pure detach-behavior test.

### 5. Feature-B smoke tests — `src/__tests__/app.smoke.test.ts` (same x ≥ 3000 block)

- **Endpoint-drag re-attach**: dangling connection line; select it, grab its `end` ring handle, drag into shape C's inflated bbox; mid-drag assert `connectionSnap` set and endpoint glued; release → `LineAttachmentComponent.end = {c, dot}`; then drag C and assert the line endpoint follows (pin is live).
- **Component creation**: line-tool line (never attached), drag an endpoint onto a shape → `LineAttachmentComponent` added with that side set, other side null.
- **Exclusion**: line with `start` attached to A; drag `end` inside A → `connectionSnap` null mid-drag, `end` still null after release.
- **Grab-and-release-in-place, no history step**: press an attached endpoint's handle, release without `moveTo` → attachment unchanged (same `{entityId, handleId}`), endpoint coords unchanged. Assert the dedup behaviorally through the public API: one `whiteboard.undo()` reverts past the attach to the state before the line's previous snapshot (proving no intermediate snapshot was inserted), then `whiteboard.redo()` restores it.
- **Undo/redo of a re-attach**: after the re-attach test's gesture, `whiteboard.undo()` restores the detached/dangling state (side null, endpoint at pre-drag coords); `whiteboard.redo()` restores the attachment — exactly one step.

### 6. Docs + bundle

- `CLAUDE.md`: delete the endpoint-re-snap TODO (line 304); update the Connecting-lines bullet (new snap rule + target-only dot reveal), Attached-lines bullet and ResizeSystem entry (endpoint drag re-snaps/re-attaches; releasing while snapped re-attaches, creating the component if needed), handles.ts entry (`connectionSnapTarget`), RenderSystem entries (dots only on the current snap target, during connection **and** endpoint drags).
- `CHANGELOG.md` `[Unreleased]`: Added (endpoint-drag re-attach, one undo step) + Changed (snap rule: per-dot 12px radius → topmost inflated-bbox + nearest-of-4; dot reveal: all shapes → snap target only).
- Rebuild the bundle: `npm run build`; commit the regenerated `dist/demo.js` + `dist/demo.js.map` with the doc changes.

## Edge cases (assert in tests)

- Grab attached endpoint + release without moving → re-attaches to the same point; history dedup → no spurious undo step (see Step 5 for the assertion mechanism).
- Dragging `end` into the shape `start` is attached to → excluded, stays dangling.
- Stray click in ConnectionSystem (< 5 length, unsnapped) still creates nothing.
- `connectionSnap` cleared on every exit path of both systems → dots never linger.
- Release+press landing between frames aborts the endpoint drag without attaching (matches ConnectionSystem's existing abort semantics; comment only).

## Verification

1. Per step: LSP diagnostics on touched files, then `npx tsc --noEmit` (authority).
2. `npm test` (= `vitest run`) — full suite; single-file iteration via `npx vitest run src/__tests__/app.smoke.test.ts`.
3. Live check via `npm run dev` (esbuild serve + watch, so the bundle is always fresh), mirroring the confirmed repro **first**: (a) draw two rects, connect them, detach the line (drag its body, or grab an endpoint), then re-drag the dangling endpoint toward a shape → its dots appear with the ring on the nearest point, release re-attaches, and the line follows the shape afterwards — primary acceptance check; (b) then the fresh-drag improvement: drag from a selected shape's dot over the other shape's **body** → dots + ring appear, release attaches.

## Files touched

`src/handles.ts`, `src/system/ConnectionSystem.ts`, `src/system/ResizeSystem.ts`, `src/system/RenderSystem.ts`, `src/Whiteboard.ts` (wiring), `src/__tests__/app.smoke.test.ts`, `src/system/__tests__/RenderSystem.test.ts`, `CLAUDE.md`, `CHANGELOG.md`, `dist/demo.js` + `dist/demo.js.map` (rebuilt).
