# Styling: Palette, Stroke Style/Thickness, Panel Redesign

Implement Phase 1 of `DESIGN.md` ("Implementation roadmap → Phase 1 — Styling"): the
24-color palette as the single color source, stroke thickness UI (the `strokeWidth`
data path already exists end-to-end), stroke style (solid/dashed/dotted, the only new
engine work), and the icon-based properties panel with popovers replacing the inline
swatch rows.

Structured as two milestones with a green-suite checkpoint between them: Milestone A
(palette + panel + thickness) needs almost no renderer work; Milestone B
(dashed/dotted) carries all the rendering risk. Gate every milestone commit on
`npx tsc --noEmit` + full jest suite green.

Context that shapes this plan (verified against the code):

- `strokeWidth?: number` already exists on all three shape components and is fully
  wired: `saveShapes` (`Whiteboard.ts:716,727,734`), `loadShapes` reconcile
  (`819,828,834`), v2 export omit-when-1 (`1206,1222`), v2 import (`1278,1292`),
  duplicate (`1012,1020,1027`), renderer (`DrawOptions.strokeWidth`, quad-based
  `drawLineInternal`). Do NOT re-implement or retype it.
- The renderer has no GL line primitives; all strokes are already triangulated quads.
- Undo is ACTION-BASED: `recordHistory` diffs per-shape records into
  CREATE/UPDATE/DELETE actions (`Whiteboard.ts:1061-1118`) and every action also
  broadcasts to multiplayer peers. A no-op style commit must therefore produce a
  JSON-identical shape record — anything else becomes a phantom UPDATE in history AND
  on the wire.
- Multiplayer needs zero dedicated work: panel commits flow through `recordHistory` →
  `shapeUpdated` with the full shape record; the plugin applies inbound records via
  `applyShape`; the server relays payloads opaquely (`sanitizeShapeData` clamps text
  only). Once `strokeStyle` is in the shape record it syncs for free.

---

# Milestone A — Palette + panel redesign + thickness UI

## Chapter 1 — Palette module (single source of truth)

Create `src/palette.ts` by MOVING (not duplicating) the color logic out of
`PropertiesPanel.ts`:

- Export `PALETTE`: ordered array of 24 entries `{ id, label, hex }` matching the 6×4
  grid in `DESIGN.md` ("Color palette"), row-major. Replaces the 8-hex `PALETTE`
  currently at `PropertiesPanel.ts:12`.
- First entry is the "no color" sentinel: `{ id: 'none', label: 'No color', hex: null }`
  = transparent; rendered in pickers as a white swatch with a diagonal line.
- Export `paletteColor(id): string | null` and `normalizeColor(value)` with a
  LITERAL mapping table (replacing `NAMED_TO_HEX`, `PropertiesPanel.ts:30-36`):
  `'black'`/`'#000000'` → `#202020`, `'white'`/`'#ffffff'` → `#FFFFFF`, and each of
  the 6 remaining legacy swatch hexes (`#e53935`, `#fb8c00`, `#fdd835`, `#43a047`,
  `#1e88e5`, `#8e24aa`) → its nearest new palette hex, listed explicitly in the
  module; unknown values pass through unchanged.
- Case convention (one place, everywhere): palette hexes are stored and compared
  UPPERCASE; `normalizeColor` uppercases its output. Swatch `data-color` values,
  component values written by the panel, and export comparisons all go through it —
  the active-swatch check is raw string equality (`PropertiesPanel.ts:170`), so mixed
  case silently breaks highlighting.
- `PropertiesPanel.ts` imports both; no other module references them today.

### Canonical draw defaults (deliberate product change)

New shapes default to fill White `#FFFFFF`, stroke Black/Very Dark Gray `#202020`
(note: `#202020` is visibly not pure black). Replace the `'white'`/`'black'` stamps at
`RectangleDrawSystem.ts:67-68`, `CircleDrawSystem.ts:65-66`, `LineDrawSystem.ts:60`,
`ConnectionSystem.ts:86`. The hex values become canonical, which forces both
serialization directions to change together:

- v2 export (`Whiteboard.ts:1220-1222`): omit `#FFFFFF` fill / `#202020` stroke.
  `normalizeColor` is used for the COMPARISON against the defaults only — the
  original stored value is written when not a default (normalizing the written value
  would silently recolor legacy boards on export). `"fill": "none"` keeps marking
  transparent.
- v2 import (`Whiteboard.ts:1278,1292`): missing keys default to the new hexes
  (today `e.stroke ?? 'black'`).
- Extend the roundtrip-identity test with a legacy-defaults fixture: a board stamped
  with `'white'`/`'black'` must load and re-export byte-identically.
- Accepted behavior (intentional, don't "fix"): a legacy board whose shapes carry the
  stored default `'black'` renders `#202020` after an export→import cycle — the
  omitted-key default changed with the product default, which is what "default"
  means.

## Chapter 2 — Thickness data rule (no component changes)

`strokeWidth` stays `strokeWidth?: number` = raw world-unit width, absent = 1. The
4-level slider is purely a panel concern: level 1..4 writes widths `[1, 2, 4, 6]`;
on read, the nearest width highlights as the active level (hand-authored JSON width
3 shows level 3). No serialization work — it is already wired (see Context).

Style fields serialize into the per-shape record only when present, so the action
differ (`Whiteboard.ts:1085`) sees no-op toggles as JSON-identical — no phantom
UPDATE actions in history or on the wire.

## Chapter 3 — RenderSystem pass-through, corner joints, thick-line hit-testing

- `RenderSystem.ts:85-95`: pass `strokeWidth: comp.strokeWidth` for rectangles and
  circles, mirroring the line branch (`RenderSystem.ts:102`).
- Corner joints for thick strokes: extend each rectangle edge quad by half the stroke
  width at both ends (miter-by-overlap; overdraw is harmless on opaque strokes) and
  apply the same half-width extension to circle segments, so widths 4-6 show no
  corner notches or seams.
- Thick-line hit-testing: `hitTestEntity` uses a flat screen-constant band,
  `LINE_HIT_TOLERANCE / scale` (`shape.ts:13,38`), so a width-6 line's visible edge
  (3 world units off center) is unclickable at higher zooms. Widen the line tolerance
  to `max(LINE_HIT_TOLERANCE / scale, strokeWidth / 2 + 2 / scale)` — visual
  half-width plus a small screen-constant grace. Selection, drag, and the panel all
  route through this test.
- Known/accepted (don't fix ad hoc): `getEntityBounds` returns geometry bounds, so
  the tight selection box sits inside a thick stroke's outer edge by half the width.
  Cosmetic; handles stay on geometry corners by design. Add a TODO line to
  `DESIGN.md` instead of threading stroke width through bounds.

## Chapter 4 — Properties panel redesign (icons + popovers)

Rework `src/PropertiesPanel.ts` to the DESIGN.md "Whiteboard entity — panel" spec.

Bar composition — compact items whose icons depict the current value:

- **Stroke** (rect/circle/line): empty square icon whose border shows current stroke
  color, width and style. Popover below the icon with sections:
  - "Stroke Color": palette grid WITHOUT the 'none' swatch (23 colors) — an
    undefined `strokeColor` renders black today (`RenderSystem.ts:86,93,99` fall
    back `|| "black"`), so offering "no stroke" would lie; a real no-stroke mode is
    out of scope. Note "No color applies to fills only, for now" in `DESIGN.md`'s
    palette section.
  - "Stroke Thickness": 4-step slider (`input[type=range]`, min 1 max 4 step 1),
    mapping to widths per Chapter 2. Commit on the `change` event ONLY (fires once
    on release) — `input` fires per pixel of drag, which would push one undo action
    AND one peer broadcast per pixel. No live preview in this plan; if added later
    as polish, preview via `input` without `onCommit()` and keep the same-value
    no-op check against the pre-drag baseline.
  - "Stroke Style": three icon buttons — solid, dashed, dotted (buttons ship in
    Milestone A but the dashed/dotted rendering lands in Milestone B; wire the
    buttons to `strokeStyle` there, or hide the section until B — executor's call,
    note it in the execution log).
- **Fill** (rect/circle only): borderless filled square icon. Popover: "Fill Color"
  palette grid including the "no color" swatch (all 24). Clicking 'none' DELETES the
  property (`fillColor = undefined`, absent-key canonical — JSON-identical to a
  never-filled shape, matching v2's `fill: 'none'` ↔ `undefined` convention at
  `Whiteboard.ts:1276`); `refreshActiveStates` highlights the 'none' swatch when
  `fillColor` is undefined. `applyColor()` needs a null branch — today it assigns
  strings only (`PropertiesPanel.ts:174-190`).
- **Start / End** (line): same None|Arrow semantics, moved into popovers (icon shows
  current value; popover lists None as text and a left/right arrow icon).
- Line bar = Stroke + Start + End; no Fill.

Commit paths that must learn about lines: `applyColor()` currently early-returns
unless Rectangle/Circle (`PropertiesPanel.ts:176`) and `refreshActiveStates()` reads
only arrow state for lines (`PropertiesPanel.ts:157-163`) — extend both, plus the new
width/style commit paths, to handle `LineComponent` (strokeColor/strokeWidth/
strokeStyle; no fill). Line default stroke follows the Chapter 1 canonical default.

Popover lifecycle (the hazards live in existing code):

- `refreshActiveStates()` runs every frame (`PropertiesPanel.ts:111`): per-frame
  refresh must only PATCH state (active borders, slider value when not focused,
  style-button highlight) — never rebuild popover DOM, or slider drags fight the
  refresh.
- Track `openPopover: 'stroke' | 'fill' | 'start' | 'end' | null`; reset it in
  `hide()` and in `rebuildContent()` (`PropertiesPanel.ts:105-109,132-138`), which
  swaps `innerHTML` on entity/kind change and destroys any open popover.
- Position the popover absolutely INSIDE the panel element so per-frame panel
  repositioning moves it for free; clamp it within the wrapper the same way the panel
  clamps (`PropertiesPanel.ts:234-239`) and flip it above the bar when the bar sits
  below the shape (the flip/clamp math hard-codes `PANEL_HEIGHT` 48 at
  `PropertiesPanel.ts:16,228,238` — account for the popover footprint).
- Only one popover open at a time; outside click and Escape close it; popover is
  panel DOM so clicks never reach the canvas (existing guarantee).
- Update the jsdom fallback widths (`FALLBACK_WIDTH_COLORS/LINE`,
  `PropertiesPanel.ts:19-20`) for the compact icon bar and add a popover-height
  fallback.

Every property change is exactly one undo step through the existing
`canCommit`/`onCommit` closures; clicking the already-active value is a no-op (zero
actions, zero emitted events). The panel stays hidden during gestures exactly as
today.

## Chapter 5 — Milestone A tests + checkpoint

- Pure unit tests for `palette.ts` (normalization incl. legacy 8 hexes and named
  colors, sentinel, level↔width mapping helper if extracted).
- `serialization.test.ts`: new-defaults omission on export, missing-key import
  defaults, legacy-defaults roundtrip-identity fixture.
- `app.smoke.test.ts`: update the panel tests at lines 1898-1910 to import `PALETTE`
  and index into it (self-healing selectors, no hard-coded hexes). New cases: open
  Stroke popover, click swatch / slider level (dispatch `change`) — assert component
  state and exactly one undo action each; same-value click emits zero actions and
  zero events (spy on `whiteboard.events`); 'none' fill click deletes the key and
  highlights the 'none' swatch; Stroke popover has no 'none' swatch;
  Escape/outside-click closes the popover; line stroke color change works.
- Hit-test unit case (pure, alongside the collision tests): a width-6 line is
  clickable at its visible edge; a width-1 line's tolerance is unchanged.
- Multiplayer harness check (manual, note in execution log): on `/multiplayer.html`,
  change color/width on board A → board B converges; same-value click sends nothing.
- Checkpoint: `npx tsc --noEmit` + full suite green; commit.

---

# Milestone B — Stroke style: dashed/dotted

## Chapter 6 — strokeStyle component field + serialization

- Add `strokeStyle?: 'dashed' | 'dotted'` to `RectangleComponent`, `CircleComponent`,
  `LineComponent` — absent means solid; the string `'solid'` is never stored (same
  idiom as `arrowStart/arrowEnd`, `LineComponent.ts:12-15`).
- Mirror the existing `strokeWidth` handling at each call site: `saveShapes`
  (`Whiteboard.ts:716,727,734` region), `loadShapes` reconcile (`819,828,834`), v2
  export non-default only (`1206,1222`), v2 import (`1278,1292`), duplicate
  (`1012,1020,1027`). v1.1/v1.0 files keep loading as solid.

## Chapter 7 — Renderer: dash/dot geometry (batched)

- Add `strokeStyle?: 'dashed' | 'dotted'` to `DrawOptions` (`IRenderer.ts`).
- New pure module `src/renderer/strokeGeometry.ts`: input = polyline path (line = 1
  segment, rectangle = 4, circle = N segments) + width + style; output = geometry the
  renderer accumulates into ONE `Float32Array` per stroke — dashes as quads (8 on /
  6 off world units, 2 triangles each), dots as small squares or 8-segment fans
  (diameter = stroke width, spacing 2× width) appended to the same buffer. The dash
  pattern walks CONTINUOUSLY across corners/segments (accumulated distance) so the
  phase never resets at a corner. Do NOT route dots through `dot()`/`circle()` — that
  is a 16-segment fan and a separate draw call per dot (`WebGLRenderer.ts:306-310`).
- `WebGLRenderer` flushes each stroke with a single `drawTriangles` call; solid
  strokes keep the existing path. Dash pattern is world-space so it zooms with the
  shape.
- Arrowheads on styled lines: the triangle cap is always solid and the dash walk
  starts from the arrow base, so a gap never separates the head from the line.
- Selection overlay, connection dots, and preview rendering are unaffected (they keep
  screen-constant sizing).
- `RenderSystem` passes `strokeStyle` for all three shape kinds.

## Chapter 8 — Panel Style section + Milestone B tests

- Enable (or add, per the Chapter 4 note) the "Stroke Style" buttons in the Stroke
  popover, committing `strokeStyle` with the same no-op/undo rules.
- Pure unit tests for `strokeGeometry.ts` (like `textLayout.test.ts`): dash run
  lengths, phase continuity across rectangle corners, dot spacing, degenerate paths
  (zero-length line, tiny circle), arrow-base offset, batched output shape.
- `serialization.test.ts`: strokeStyle roundtrip, absent-key canonicality (toggle
  dashed→solid re-serializes byte-identically to never-dashed).
- `app.smoke.test.ts`: click dashed style — component state + one undo action;
  same-value click emits nothing.
- Optional smoke assertion: a dashed rectangle issues more draw activity than a solid
  one via `__mocks__/webgl.ts`, only if cheap — otherwise skip.
- Checkpoint: `npx tsc --noEmit` + full suite green; commit.

---

## Chapter 9 — Docs (tightly scoped)

- Update `DESIGN.md` status markers as each milestone lands (palette ✅, panel ✅,
  thickness ✅ after A; stroke style ✅ after B) and the styling-related `CLAUDE.md`
  sections (PropertiesPanel, draw defaults, renderer notes).
- Describe history interactions in action-diff terms (per-shape record
  canonicalization) — do NOT copy CLAUDE.md's current snapshot-undo wording, which is
  stale.
- Out of scope here: the broader CLAUDE.md refresh (action-based undo description,
  multiplayer components/plugin, EventEmitter) — file as its own small docs plan.
