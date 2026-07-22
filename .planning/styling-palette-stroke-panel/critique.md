# Styling: Palette, Stroke Style/Thickness, Panel Redesign
> Keywords: palette, normalizeColor, case-sensitivity, no-color, transparent fill, hit-testing, slider commit, popover, strokeStyle, batching  
Iteration: 3

## Summary

- The merged plan resolves every iteration-1/2 finding: milestones are correctly split, strokeWidth is no longer re-planned, the renderer scope is right, the action-diff model is the stated invariant, serialization changes cover both directions, and the popover lifecycle hazards are pinned to code lines. Structure, ordering, and feasibility are sound.
- This iteration reviewed the merged plan fresh and found no structural problems — the remaining issues are five under-specified behaviors, four of them in Milestone A, that would otherwise surface as executor decisions or bugs mid-flight.
- Sharpest of the five: hex case-sensitivity will silently break active-swatch highlighting (the existing compare is string equality and `normalizeColor` lowercases, while DESIGN.md's palette is uppercase), and the thickness slider commits on the wrong DOM event unless told otherwise (`input` fires per pixel of drag → an undo action + peer broadcast per pixel).
- Table of contents of issues:
  1. Chapter 1 - normalizeColor needs an explicit mapping table, one case convention, and a compare-only role in export
  2. Chapter 1/4 - "no color" semantics unspecified: fill 'none' must store undefined; stroke grid must exclude it (or define no-stroke rendering)
  3. Chapter 2/4 - thick lines are only clickable near the centerline (hit tolerance ignores strokeWidth)
  4. Chapter 4 - thickness slider must commit on 'change', not 'input'
  5. Chapter 3 - selection bounds ignore stroke width (accept + document)

---

## Chapter 1 — normalizeColor: mapping table, case convention, compare-only in export

Description:    
Three under-specifications compound here. (a) plan Chapter 1 says "keep the existing `NAMED_TO_HEX` behavior and extend it" — but the existing behavior maps `'black'` → `'#000000'` (`PropertiesPanel.ts:30`), which is neither the new canonical default `#202020` nor any new palette entry, so "keeping" it verbatim strands legacy defaults outside the palette. (b) Case: `normalizeColor` lowercases its input (`PropertiesPanel.ts:34`), DESIGN.md's palette hexes are uppercase, and the active-swatch check is raw string equality (`swatch.dataset.color === current`, `PropertiesPanel.ts:170`) — mixed case means the active swatch never highlights. (c) Export role: Chapter 1 says omission runs values "through `normalizeColor`" but doesn't say what gets WRITTEN — if the exporter writes the normalized value, exporting silently recolors legacy boards. Related accepted behavior worth one sentence: a legacy board whose shapes carry the stored default `'black'` will, after export→import, render `#202020` (the omitted-key default changed) — that is the intended meaning of "default", but say so.

Suggested Solution:    
- Specify the full mapping in `palette.ts`: `'black'`/`'#000000'` → `#202020`, `'white'`/`'#ffffff'` → `#FFFFFF`, and each of the 6 remaining old hexes → its nearest new palette hex (list them literally in the module); unknown values pass through.
- Pick ONE case convention (recommend: palette hexes stored/compared uppercase; `normalizeColor` uppercases its output) and note that swatch `data-color`, component values written by the panel, and export comparisons all go through it.
- Export rule stated explicitly: `normalizeColor` is used for COMPARISON against the defaults only; the original stored value is written when not a default. Add the legacy-default rendering change as an accepted-behavior note.

---

## Chapter 1/4 — "No color" must be pinned to the existing undefined-fill convention

Description:    
The plan renders the `'none'` sentinel (`hex: null`) in pickers but never says what clicking it stores. The codebase already has the answer: transparent fill IS the absent key — v2 import maps `fill: 'none'` → `fillColor: undefined` (`Whiteboard.ts:1276`) and export writes `"fill": "none"` when `fillColor === undefined` (`Whiteboard.ts:1219-1220`). Two gaps follow: (a) `applyColor()` takes a string and assigns it (`PropertiesPanel.ts:174-190`) — it needs a null/'none' branch that DELETES the property (sets undefined, absent-key canonical) and an active-state rule highlighting the 'none' swatch when `fillColor` is undefined; (b) the Stroke popover's grid contents are unstated for 'none' — an undefined `strokeColor` currently renders BLACK, not "no stroke" (`RenderSystem.ts:86,93,99` fall back `|| "black"`), so offering 'none' for stroke would produce a lie.

Suggested Solution:    
- Chapter 4: clicking 'none' in the Fill popover sets `fillColor = undefined` (delete the key — JSON-identical to a never-filled shape, per the action-diff invariant); `refreshActiveStates` highlights 'none' when the value is undefined.
- Stroke popovers EXCLUDE the 'none' swatch in this plan (23 swatches for stroke, 24 for fill); "no stroke" would need a rendering/default change out of scope here. Add one line to `DESIGN.md`'s palette section noting "No color" applies to fills only, for now.

---

## Chapter 2/4 — Thick lines are only clickable near the centerline

Description:    
Milestone A ships the width slider, and a width-6 line's visible edge extends 3 world units either side of the centerline — but line hit-testing uses a flat screen-constant tolerance, `LINE_HIT_TOLERANCE = 5` divided by scale (`shape.ts:13,38` → `pointOnLine(..., 5/scale)`, `collision.ts:67-94`). At scale 2 a width-6 line is 12 screen px thick while the hit band is 5 screen px from center: clicking the visible edge of the line misses it. Selection, drag, and the properties panel all route through this hit test.

Suggested Solution:    
In `hitTestEntity` (`shape.ts:38`), widen the tolerance for lines to `max(LINE_HIT_TOLERANCE / scale, strokeWidth / 2 + 2 / scale)` — the visual half-width plus a small screen-constant grace. Pure function, add a unit case to the Milestone A tests (thick line clickable at its edge, thin line unchanged).

---

## Chapter 4 — Thickness slider: commit on 'change', not 'input'

Description:    
The plan specifies the slider element but not its commit event. `input[type=range]` fires `input` continuously during a drag; wiring the existing commit path to it produces one undo action AND one `shapeUpdated` broadcast per pixel of drag — exactly the phantom-traffic failure the plan's own action-diff invariant warns about. The "one undo step per property change" rule needs an event-level statement for the only non-click control in the panel.

Suggested Solution:    
Commit on the `change` event only (fires once on release): apply the width + `onCommit()` there. Optionally live-preview during `input` by setting `comp.strokeWidth` WITHOUT `onCommit()` — safe with the diff model, since `recordHistory` diffs against the pre-interaction baseline and the `change` commit captures the final value — but if previewing, the same-value no-op check must compare against the baseline value, not the previewed one. Simplest correct version: no live preview, commit on `change`; note the preview variant as optional polish.

---

## Chapter 3 — Selection bounds ignore stroke width (accept + document)

Description:    
`getEntityBounds` returns geometry bounds (`shape.ts`), so SelectionSystem's tight box and the selection overlay will sit inside a thick stroke's outer edge by half the width (a width-6 rect's stroke pokes 3 world units outside its selection box). Cosmetic, unavoidable without threading stroke width through bounds, and harmless for handles (they sit on geometry corners by design).

Suggested Solution:    
Accept for this plan; add one sentence to Chapter 3 declaring it known/accepted so the executor doesn't "fix" it ad hoc, and a TODO line in `DESIGN.md` if the inset ever bothers users.

---

No structural issues remain; after folding in these five specifications the plan is ready for `/plan:execute`.
