# Text Support In Shapes
> Keywords: text, TextComponent, textarea overlay, WebGL texture, rasterization, word wrap, clipping, suppressedPressCount, dblclick, zoom bucket, createQuery
Iteration: 2

## Summary

- plan.md is unchanged since iteration 1 (verified by mtime), so all six iteration-1 issues stand; they are restated below unmodified in substance.
- This iteration verified one assumption deeper in the stack and found a second blocking item: the local ecs package's `World.createQuery` throws on duplicate query ids, and `Whiteboard.save()`/`load()` both create an `"exportShapes"` query — the exact save→load round-trip Chapter 8 plans to test crashes today before any text code is written (issue 7).
- Also added: `suppressedPressCount` needs an explicit initial value to comply with the project's explicit-props rule (issue 8, minor).
- Blocking before execution: issues 1 and 7. Everything else is spec-tightening or optional.
- Split recommendation unchanged: optionally extract Chapters 3+4 (renderer texture path) as a prerequisite plan; the dependency is strictly sequential, so executing them first within this plan is equivalent.

Issues:
1. Chapter 6 — DragSystem suppression must cover the hold, not just the edge (blocking)
2. Chapter 2/4 — centering is specified twice (layout vs rasterizer)
3. Chapter 4 — per-frame re-rasterization while resize-dragging
4. Chapter 4 — raster clamp constants unspecified; acceptance wording contradicts risk #2
5. Chapter 8 — prefer `setMeasurer` export over `vi.mock`
6. Chapter 7 — pre-existing lossy color round-trip (observation)
7. Chapter 7/8 — duplicate `createQuery("exportShapes")` throws; round-trip test crashes (blocking)
8. Chapter 6 — `suppressedPressCount` initial value (minor)

---

## Chapter 6 — DragSystem suppression must cover the hold, not just the edge

Description:
plan.md:161-166 specifies that press-edge consumers treat `pressCount <= suppressedPressCount`
as consumed by "advancing lastPressCount and returning". That works for ResizeSystem,
ConnectionSystem and MousePressSystem, which act only on the press edge. DragSystem does not:
it re-anchors on the edge but performs the actual drag on every frame where `IsMousePressed`
is present (DragSystem.ts:54-104) — there is no edge gate in front of `moveEntityBy`. Sequence
that breaks: textarea focused → user presses on empty canvas (mousedown fires before blur, so
`pressCount` becomes P) → blur commits and sets `suppressedPressCount = P` → user moves the
mouse while still holding the button → DragSystem sees `IsMousePressed` + non-empty selection
+ no handle claim and drags the still-selected shape. The commit click turns into an
accidental move.

Suggested Solution:
Specify the guard as press-scoped rather than edge-scoped, uniformly in all four systems: skip
acting whenever the *current* press is the suppressed one. Because `pressCount` is monotonic
and does not change for the duration of a hold, `pressCount <= suppressedPressCount` is true
for the entire suppressed hold and false from the next mousedown on — no clearing needed, same
property the plan already relies on. In DragSystem the check must sit before the movement
logic (after the re-anchor bookkeeping), not inside the edge branch.

    ```ts
    // in each of Resize/Connection/MousePress/Drag, after reading mouseComp:
    if (mouseComp.pressCount <= toolState.suppressedPressCount) return; // suppressed press
    ```

---

## Chapter 2 / Chapter 4 — centering is specified twice (layout vs rasterizer)

Description:
plan.md:48-57 has `layoutText` return `originX, originY` and compute centering in world space;
plan.md:95-99 then has the rasterizer center again via the 2D canvas (`textAlign = "center"`,
"textBaseline per line"). Two independent implementations of the same centering can drift
(e.g. layout centers the block using `lines × lineHeight` while the canvas centers per glyph
metrics), and `originX/originY` are dead outputs in the renderer path — `texturedQuad` is
drawn at the box origin with the full box size (plan.md:121), so all placement inside the box
must live in the raster, not in world-space origins.

Suggested Solution:
Make layout the single owner of placement. Change the `layoutText` contract to return
box-local positions per line; the rasterizer multiplies them by `S` and draws with
`textAlign = "left"`, `textBaseline = "alphabetic"` (or "top"), no second centering. The same
box-local positions are what a future DOM-overlay vertical-centering fix (Risk 1) would
consume.

    ```ts
    layoutText(content, box, fontSize, measure):
      { lines: Array<{ text: string; x: number; y: number }>, lineHeight: number }
    // x, y relative to box top-left, already centered; raster draws at (x*S, y*S)
    ```

---

## Chapter 4 — per-frame re-rasterization while resize-dragging

Description:
The cache key (plan.md:100-104) includes `boxW | boxH`. ResizeSystem mutates the shape's
dimensions every frame during a handle drag (ResizeSystem.ts:121, applyResize), so resizing a
shape that has text triggers rasterize + `createTexture` + `deleteTexture` on every frame of
the gesture (~60/s): full 2D-canvas redraw and GPU upload per frame. Correct, but the only
hot path the plan creates.

Suggested Solution:
Pick one and state it in the plan:
- Accept and document (text blocks are small; likely fine on desktop) — minimum change.
- Recommended: while `selectionComp.resizeHandleId` is set for the entity, reuse the last
  texture stretched to the current box (`texturedQuad` already takes arbitrary w/h) and
  re-rasterize once on release (release edge or `resizeHandleId` returning to null). Text is
  briefly distorted during the gesture, crisp on release — same tradeoff Figma makes.
- Alternative: quantize `boxW/boxH` in the key (e.g. ceil to 16 world units) — cheaper misses
  but permanent slight misfit between raster and box.

---

## Chapter 4 — raster clamp constants unspecified; acceptance wording contradicts risk

Description:
plan.md:95-96 introduces `MIN_RASTER_SCALE`/`MAX_RASTER_SCALE` and Chapter 9 (plan.md:232)
says the constants live in `textRaster.ts`, but no values are given — the executor has to
invent the actual clamp range, which directly controls memory use and sharpness. Separately,
acceptance criterion plan.md:261-262 promises text "staying sharp at zoom buckets from 0.1× to
8×" while Risk 2 (plan.md:242) accepts up to ~√2 under-resolution between buckets — the two
statements contradict as written.

Suggested Solution:
Fix the constants in the plan, derived from the camera clamp (0.1–8) and the bucket formula:
`zoomBucket ∈ {0.125, 0.25, …, 8}` already spans the camera range, so
`MIN_RASTER_SCALE = 0.125 × DPR` and `MAX_RASTER_SCALE = 8 × DPR` (then capped by
`MAX_TEXTURE_SIZE`) — i.e. the clamp only defends against pathological DPR/box combinations.
Reword the acceptance criterion to "readable at every zoom, re-sharpened at each power-of-two
zoom bucket (Risk 2)".

---

## Chapter 8 — prefer `setMeasurer` export over `vi.mock`

Description:
plan.md:225-227 offers two ways to swap the text measurer in smoke tests: `vi.mock` of
`textLayout`'s default measurer, or a `setMeasurer` hook. `vi.mock` on a module consumed by
the real app entry is order-sensitive (hoisting, module graph) and this suite deliberately
boots the real `Whiteboard` — mocking underneath it is exactly the kind of brittleness the
suite has avoided so far (it fakes the WebGL context at the boundary instead).

Suggested Solution:
Commit to the explicit hook: `textLayout.ts` exports `setMeasurer(fn)` /
`resetMeasurer()`; production never calls it (default is the shared offscreen-canvas
measurer, created lazily so importing the module in jsdom stays safe); the smoke test calls
`setMeasurer(fakeMonospace)` in `beforeAll`. Delete the `vi.mock` alternative from the plan.

---

## Chapter 7 — pre-existing lossy color round-trip (observation)

Description:
Not introduced by this plan, but Chapter 7 builds on it: `save()` collapses
`fillColor || strokeColor` into a single `color` field and `load()` restores it as
`strokeColor` only (Whiteboard.ts save/load) — a filled shape silently becomes an outlined
one after a round-trip. The new `text` field is unaffected (own sub-object, faithful
round-trip), so the plan is fine as written; flagging so text round-trip tests don't get
tangled in failures caused by shape-color assertions.

Suggested Solution:
Out of scope for this plan — worth its own small fix (serialize `fillColor` and `strokeColor`
separately, keep reading legacy `color`). Keep the Chapter 8 save/load test assertions scoped
to `text` to avoid coupling to this bug.

---

## Chapter 7 / Chapter 8 — duplicate `createQuery("exportShapes")` throws; round-trip test crashes

Description:
New in this iteration, found by reading the local ecs package: `World.createQuery` throws
`A query with the id "..." already exists.` on a duplicate id
(~/work/gamedev-published-repos/ecs/src/World.ts:43-55). `Whiteboard.save()` and
`Whiteboard.load()` each call `createQuery("exportShapes", ...)`, so **any second call among
{save, load} on the same instance throws** — save() twice, or the save→load round-trip that
Chapter 8 explicitly plans as a smoke test (plan.md:218-219 "save→load round-trips text").
This is a pre-existing bug, but unlike issue 6 it does not just muddy assertions — it makes
the planned test impossible to write. It must be fixed by (not merely noted in) this plan.

Suggested Solution:
`setupECS` already creates `this.shapesQuery = createQuery("shapes", { any: SHAPE_COMPONENTS,
none: [SelectionRectangleComponent] })` — filters identical to `"exportShapes"`. Add a small
step to Chapter 7: replace both `createQuery("exportShapes", ...)` calls with
`this.shapesQuery`, deleting the duplicate query creation entirely. (Alternative if isolation
is preferred: `world.removeQuery("exportShapes")` in a finally-block after use — but reusing
the memoized query is simpler and matches how the rest of setupECS works.) Add a smoke test
asserting `save(); load(save())` does not throw even with zero shapes.

---

## Chapter 6 — `suppressedPressCount` initial value (minor)

Description:
plan.md introduces `suppressedPressCount` on `ToolStateComponent` but never states its initial
value. `pressCount <= undefined` happens to evaluate false, so an uninitialized field works by
accident — but CLAUDE.md mandates explicit constructor props ("no defaulted/optional
constructor params — pass explicit props at addComponent call sites"), and silent
`undefined` comparisons are exactly what that rule exists to prevent.

Suggested Solution:
Either initialize it as a plain class field (like `MouseComponent.pressCount = 0`, which is
not a constructor prop) or add it to `ToolStateComponentProps` and pass `suppressedPressCount: 0`
at the `addComponent(ToolStateComponent, ...)` site in `setupECS`. The class-field route is
simpler and mirrors the existing counter pattern; state the choice in Chapter 6.

---

## Recommended split (optional)

Description:
Chapters 3+4 (textured-quad shader path, texture lifecycle, raster cache, WebGL-mock
additions from Chapter 8) have no dependency on the editing UX, the component, or the layout
engine beyond a canvas-in/texture-out interface, and they carry most of the implementation
risk (per-program uniforms, NPOT, y-flip, blending). Executed and verified alone, the
remaining chapters become a much smaller, mostly-DOM/ECS change.

Suggested Solution:
If splitting: plan `renderer-textured-quad` = Chapter 3 + Chapter 4 (minus the cache's
TextComponent-specific eviction rule, which stays here) + the mock additions; this plan then
depends on it and shrinks to Chapters 1, 2, 5, 6, 7, remaining 8, 9. If not splitting,
execute Chapters 3+4 first and run the renderer tests before starting Chapter 6 — same risk
containment without the bookkeeping.
