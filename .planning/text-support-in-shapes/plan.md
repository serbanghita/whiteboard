# Text Support In Shapes

Add editable text to the interior of rectangles and circles: double-click a shape to type into
it, text wraps inside a padded interior box, overflow is clipped, and the text renders in the
WebGL canvas so it pans/zooms with the world.

## Locked decisions (agreed 2026-07-19, extended 2026-07-20)

| Topic | Decision |
|---|---|
| Rendering | Rasterize each shape's text block on an offscreen 2D canvas, upload as a WebGL texture, draw as a textured quad. Re-rasterize on content/box change and on zoom bucket change. |
| Editing | Double-click a shape opens a transparent DOM `textarea` positioned over the shape interior. Commit on blur or Escape. |
| Overflow | Wrap, then clip lines that do not fit vertically. No ellipsis, no auto-grow, no font shrink. Hidden text stays in the data. |
| Scope | Rectangle + circle only. Lines get no text (design must not block future midpoint labels). |
| Circle interior | Largest inscribed axis-aligned square (side = r·√2), minus padding. |
| Alignment | Centered horizontally and vertically. |
| Padding | Fixed world-space constant (`TEXT_PADDING = 8`), lives in the layout module. |
| Styling | Fixed defaults (font family/size/color constants) stored per-shape in the component; no styling UI. |
| Persistence | Serialize full text props (`content`, `fontSize`, `fontFamily`, `color`) in every snapshot, so future styling needs no migration. |
| History | One history snapshot per committed edit (blur or Escape alike), never per keystroke. |

## Chapter 1: TextComponent (data model)

New `src/component/TextComponent.ts`:

```ts
interface TextComponentProps {
  content: string;      // raw text incl. explicit \n
  fontSize: number;     // world units — text scales with zoom like shape strokes
  fontFamily: string;
  color: string;
}
```

- Follows the existing component pattern (props required, getters/setters like `RectangleComponent`).
- Registered in `Whiteboard.setupECS()` `registerComponents` list — and **only** there: the ecs
  `ComponentRegistry` is a process-wide singleton and re-registering a class assigns it a fresh
  bitmask, desyncing every query created earlier. The static `componentsRegistered` guard must
  remain the single registration site.
- Attached lazily: first successful text edit adds the component with defaults
  (`DEFAULT_FONT_SIZE = 14`, `DEFAULT_FONT_FAMILY = "sans-serif"`, `DEFAULT_TEXT_COLOR = "#000"`).
  Committing an empty string removes the component (so empty shapes carry no text data).
- Font props are per-shape data set to the defaults for v1; a styling UI later is additive only.

## Chapter 2: Text layout engine (pure module)

New `src/textLayout.ts` — pure functions, no WebGL, no DOM, in the spirit of `camera.ts`:

- `getInteriorBox(entity) : {x, y, width, height} | null`
  - Rectangle: `(x+PAD, y+PAD, w−2·PAD, h−2·PAD)`.
  - Circle: inscribed square centered on `(cx, cy)` with `side = r·√2 − 2·PAD`.
  - Returns `null` when the padded box has non-positive width or height (shape too small).
- `layoutText(content, box, fontSize, measure) : { lines: Array<{text, x, y}>, lineHeight }`
  — `x`/`y` are box-local (relative to the box top-left), already centered. **Layout is the
  single owner of placement**: the rasterizer and any future DOM-overlay centering consume
  these positions verbatim and never re-center (no `textAlign: center` second implementation
  that could drift from the layout's block math).
  - `measure: (text: string) => number` is injected (returns width in world units for the given
    font size). Production impl uses a shared offscreen 2D canvas `measureText`; tests inject a
    fake monospace measurer (jsdom's `measureText` returns 0).
  - Greedy word wrap against `box.width`; words longer than the box break by character;
    explicit `\n` always breaks.
  - `lineHeight = fontSize × LINE_HEIGHT_FACTOR` (1.25).
  - Clip: keep only the first `floor(box.height / lineHeight)` lines. If that is 0, return
    empty lines (nothing renders).
  - Centering: block is centered vertically in the box; each line centered horizontally —
    expressed entirely in the returned per-line `x`/`y` positions.
- Unit-space note (must be a code comment): fontSize is in **world units**, the box is in world
  units, and the injected measurer must return world units for that fontSize — one coordinate
  space throughout, zoom is applied only at rasterization time.
- Line labels later: `layoutText` takes an arbitrary box, so a future line midpoint label only
  needs a box provider — no rework.

## Chapter 3: Renderer — textured quad path

`src/renderer/` changes:

- New shader pair (`shaders/textured.ts`): vertex adds `a_texcoord` varying; fragment samples
  `uniform sampler2D u_texture` and multiplies by nothing (color is baked into the raster).
  Same camera uniforms (`u_resolution`, `u_translate`, `u_scale`) as the basic shader.
- `WebGLRenderer`:
  - Second `ShaderProgram` + a texcoord buffer; `gl.useProgram` switches per draw call.
    After a textured draw, switch back to the basic program (existing calls assume it is active).
  - **Uniforms are per-program**: the textured program has its own `u_resolution`/`u_translate`/
    `u_scale`. `setResolution`/`setCamera` currently write only to the basic program — they must
    update both (write-through to both programs, or cache the values and push on program
    switch). Missing this renders text with an identity camera — wrong position at any pan/zoom.
  - Enable alpha blending once in the constructor:
    `gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)` — premultiplied alpha,
    paired with `gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true)` at upload. Verify the
    existing solid-color shapes still render identically (they write alpha=1, so blending is a
    no-op for them).
  - New `IRenderer` methods (the old `text(str, x, y)` stub is **removed** — it never worked and
    nothing calls it):
    - `createTextureFromCanvas(source: HTMLCanvasElement): TextureHandle`
    - `deleteTexture(handle: TextureHandle): void`
    - `texturedQuad(handle, x, y, width, height): void` — world-space quad, full 0..1 texcoords.
  - `TextureHandle` is an opaque type so `IRenderer` stays WebGL-agnostic.
  - WebGL1 NPOT constraint: text textures are arbitrary-sized, so set
    `TEXTURE_WRAP_S/T = CLAMP_TO_EDGE`, `MIN/MAG_FILTER = LINEAR`, and generate **no mipmaps**.
  - Y-orientation gotcha: a 2D canvas is y-down, texture space is y-up. Resolve with
    `gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true)` at upload **or** flipped texcoords — pick one,
    assert with a deliberately asymmetric test raster during implementation.

## Chapter 4: Rasterization + texture cache (RenderSystem-owned)

New `src/textRaster.ts` (or a private helper class used by RenderSystem):

- Rasterize: offscreen canvas sized `boxWidth × S` by `boxHeight × S` where
  `S = clamp(zoomBucket × devicePixelRatio, MIN_RASTER_SCALE, MAX_RASTER_SCALE)`,
  `MIN_RASTER_SCALE = 0.125 × DPR`, `MAX_RASTER_SCALE = 8 × DPR` (the camera clamp is 0.1–8,
  so the power-of-two buckets already span it; the clamp only defends pathological DPR/box
  combinations, and the `MAX_TEXTURE_SIZE` cap below still applies). Draw each layout line at
  `(line.x × S, line.y × S)` with `font = (fontSize × S) + "px " + family`,
  `textAlign = "left"`, `textBaseline = "top"` — no centering here, placement comes entirely
  from the layout (Chapter 2). Upload via `renderer.createTextureFromCanvas`.
- Cache: `Map<entityId, { texture, key }>` where
  `key = content | boxW | boxH | fontSize | fontFamily | color | zoomBucket` — family and
  color are constants in v1 but are baked into the raster pixels, so they belong in the key
  now or a later styling UI would silently serve stale textures. On key mismatch: delete old
  texture, re-rasterize. `zoomBucket = 2^round(log2(scale))` — power-of-two buckets, so pinch-zoom does
  not re-rasterize per wheel tick and text is never more than ~√2 away from its ideal
  resolution.
- Resize-gesture exception: while `selectionComp.resizeHandleId` targets the entity, do NOT
  re-rasterize on box-size mismatches — draw the previous texture stretched to the current box
  (`texturedQuad` takes arbitrary w/h) and re-rasterize once when the handle is released
  (release edge / `resizeHandleId` back to null). Otherwise a handle drag costs a full 2D
  raster + GPU texture upload per frame (~60/s). Text is briefly distorted during the gesture,
  crisp on release (Risk 6).
- Eviction: each frame (cheap — iterate cache, not entities), drop entries whose entity no
  longer exists or no longer has a non-empty `TextComponent`; also drop the entity being
  edited (its DOM overlay replaces the render).
- Cap texture size at `gl.getParameter(gl.MAX_TEXTURE_SIZE)`; if exceeded, clamp `S`.
- Degenerate guard: skip rasterization entirely when `boxWidth × S < 1` or `boxHeight × S < 1`
  (a 0-px canvas throws / uploads garbage at extreme zoom-out).
- Null-context guard: `canvas.getContext('2d')` can return null (notably in jsdom, which has
  no 2D implementation without the `canvas` package) — treat it as "no texture" and skip that
  entity's text, same contract as the degenerate guard. The visible canvas stays WebGL; this
  offscreen canvas is only the rasterizer, and tests assert component/overlay state, never
  pixels.

RenderSystem owns the cache instance (fits ECS: renderer stays immediate-mode; per-entity
retained state lives beside the system that uses it).

## Chapter 5: RenderSystem integration

In the per-entity draw branch of `RenderSystem.update`:

- After drawing the rect/circle fill+stroke, if the entity has a non-empty `TextComponent` and
  is not currently being edited: `getInteriorBox` → cache lookup (layout+rasterize on miss) →
  `renderer.texturedQuad(texture, box.x, box.y, box.width, box.height)`.
- Draw order is unchanged: shapes (now shape+its text) first, selection overlay last — text
  stays under the selection box/handles, and a shape drawn later still covers an earlier
  shape's text (correct painter's order).
- The in-progress draw preview entity can never have text (component is added only via edit),
  so no guard is needed there.

## Chapter 6: TextEditSystem + DOM overlay

New `src/system/TextEditSystem.ts` + edit-state tracking:

- Edit state lives on `ToolStateComponent` as plain class fields (mirroring MouseComponent's
  counters — NOT constructor props, so `addComponent` call sites stay unchanged and nothing is
  implicitly `undefined`): `editingEntityId: string | null = null` (single source of truth;
  RenderSystem and the keydown guards read it) and `suppressedPressCount = 0` (see click-away
  handling below). `reset()` touches neither.
- Trigger: `dblclick` canvas listener in `Whiteboard.bindEvents` records
  `dblClickCount++` and event-time world coords (`dblClickX/Y`) on `MouseComponent`, mirroring
  the existing `pressCount` edge pattern. `TextEditSystem` consumes the counter each frame,
  cursor tool only; hit-test via `hitTestEntity` reusing the existing
  `connectableShapesQuery` (rect + circle, no lines — exactly the text-capable set; topmost
  wins, same reverse iteration as `MousePressSystem`). Reuse, don't recreate: `createQuery`
  throws on a duplicate query id.
- Entering edit:
  - Create a `textarea` appended to `$wrapper` (already `position:relative`);
    `position:absolute`, `zIndex` above canvas but below the floating menu (menu is 1000 → use
    500), transparent background, no border/outline/resize, `overflow:hidden`, centered
    `text-align`, padding 0.
  - Geometry: interior box mapped through `worldToScreen`; `font-size = fontSize × scale` px,
    `line-height = LINE_HEIGHT_FACTOR`. (Vertical centering inside the textarea is approximated
    by sizing it to the box and letting text start at top — see Risks; acceptable for v1.)
  - Prefill with current content, `focus()` + select-all.
  - The system needs DOM access: pass `$wrapper` (and a `worldToScreen` provider or the camera
    entity lookup) to the system constructor via `world.createSystem(TextEditSystem, query, deps)`
    — same pattern as RenderSystem receiving the renderer.
- During edit:
  - RenderSystem skips the editing entity's text (shape itself still renders).
  - Camera: the canvas `wheel` handler, when `editingEntityId` is set, **commits first** (by
    blurring the textarea — commit is the blur handler, no extra API needed), then applies the
    wheel. Note: wheel events **over the textarea** never reach the canvas handler (the overlay
    is a sibling of the canvas), so zooming there is simply inert (`overflow:hidden`, nothing
    scrolls) — accepted v1 quirk, listed under Risks.
  - Container resize (`ResizeObserver`) while editing also commits — the overlay geometry
    derives from `worldToScreen` at entry and would go stale (same v1 simplification as wheel).
  - The editing shape cannot be dragged/resized while the overlay has focus (clicks land on the
    textarea, not the canvas). A click-away on the canvas must commit without also
    selecting/dragging/resizing/connecting. Mechanism — `suppressedPressCount`: browsers fire
    `mousedown` **before** the resulting `blur`, so by commit time the canvas press is already
    recorded; commit sets `suppressedPressCount = mouseComp.pressCount`. Each of the four
    press consumers (`ResizeSystem`, `ConnectionSystem`, `MousePressSystem`, `DragSystem`)
    then returns early whenever `mouseComp.pressCount <= toolState.suppressedPressCount` —
    after its own edge bookkeeping, before acting. The guard is **press-scoped, not
    edge-scoped**: `pressCount` doesn't change for the duration of a hold, so the whole
    suppressed press is covered. This matters specifically for DragSystem, which drags on
    every frame where `IsMousePressed` is present (no edge gate in front of `moveEntityBy`) —
    edge-only suppression would let a click-away-and-hold drag the shape; the guard must sit
    in front of the movement logic. Monotonic counter — no clearing step, no frame-ordering
    race. (A boolean "clear next frame" flag would NOT work: ToolStateSystem runs *first* in
    the frame and would wipe it before MousePress ever saw it.)
    Consequence: clicking another shape while editing takes two clicks (first commits, second
    selects) — same as Excalidraw, accepted. Corollary: the suppressed click also does NOT
    clear the selection on empty canvas — after a click-away commit the shape stays selected
    (desirable: its handles show the shape that just got text).
- Commit/cancel:
  - `blur` → commit; `Escape` → commit (decision: Escape commits, not cancels — matches the
    "blur commits" model and avoids surprise text loss; document in CHANGELOG). Enter inserts a
    newline (textarea default), it does not commit.
  - Commit must be **idempotent** (guard flag): Escape-commit removes the textarea, which fires
    `blur`, which calls commit again.
  - Commit: trimmed-empty → remove `TextComponent` (or don't add it); else write `content`.
    Remove textarea, clear `editingEntityId`.
  - Tool switch / menu click while editing needs **no special hook**: pressing a menu button
    blurs the textarea, so the blur-commit runs before the tool-click handler.
  - Keydown guard in `Whiteboard.bindEvents`: while `editingEntityId` is set, the existing
    Escape draw-cancel branch must not run (belt: textarea's own keydown handler calls
    `stopPropagation()`; braces: the document handler checks `editingEntityId`).
  - `destroy()` removes any live textarea and its listeners.
- System order (current order includes LineAttachmentSystem and HistorySystem):
  `ToolState → draws → Resize → Connection → TextEdit → MousePress → Drag → LineAttachment →
  MouseOver/Out → Selection → Render → History`. History must stay last so a click-away text
  commit is already applied when its release-edge snapshot fires. TextEdit's exact slot only
  needs to be before Render;
  placing it before MousePress keeps all press/dblclick interpretation adjacent. The two
  single-clicks that precede a dblclick will have already selected the shape — that is fine and
  must be covered by a test. `ToolStateComponent.reset()` must NOT touch
  `editingEntityId`/`suppressedPressCount` (reset is draw-state bookkeeping only).

## Chapter 7: Persistence (saveShapes/loadShapes reconcile)

The serialization core is `saveShapes()`/`loadShapes()`: a flat shapes array with preserved
entity ids, applied as a **differential update** (existing entities patched in place, missing
recreated, absent removed) — it doubles as the undo/redo snapshot unit. `save()`/`load()` are
thin wrappers adding camera state; they need no text-specific changes.

- `saveShapes()`: when the entity has a `TextComponent`, emit
  `data.text = { content, fontSize, fontFamily, color }` — full props (locked decision), so
  future styling needs no snapshot migration. Optional field: legacy snapshots load unchanged
  and the byte-identical load→save round-trip property is preserved.
- `loadShapes()`: reconcile `TextComponent` exactly like the existing
  `LineAttachmentComponent` reconciliation block, in the rect and circle branches of **both**
  the create and patch paths: snapshot has `text` → add-or-update; snapshot has none → remove
  the component if present. Without the remove branch, undoing "added text to shape X" leaves
  the text behind (patched entities keep their components).
- Update means mutating fields on the existing component instance — never a bare re-`addComponent`:
  the ecs `Component.init` quirk resets `properties` to `{}` when props are omitted
  (Entity.ts re-inits existing instances instead of erroring).

## Chapter 8: Undo/redo integration

`HistorySystem` snapshots only on mouse **release edges**, and `Whiteboard`'s document keydown
handler intercepts Ctrl/Cmd+Z/Y globally — three gaps to close:

- **Commit records history**: pass the `recordHistory` callback into `TextEditSystem` at
  construction (mirroring `createSystem(HistorySystem, query, () => this.recordHistory())`)
  and call it on every commit whose content actually changed — blur AND Escape paths (Escape
  produces no mouse event, so the release-edge path never sees it; relying on it would merge
  the text edit into some later gesture's undo step). One snapshot per committed edit (locked
  decision), never per keystroke. Verified: `HistoryManager.pushState` dedups by string
  equality (HistoryManager.ts:24-25 — its docblock explicitly invites push-on-every-candidate),
  so the click-away double-snapshot is already safe at the data-structure level. Keep the
  changed-check in TextEditSystem anyway: it avoids serializing the entire board
  (`saveShapes()`) on every no-op commit, since dedup only happens after the full
  serialization has been paid for.
- **Keyboard guard**: skip the Ctrl/Cmd+Z/Y branch in the keydown handler while
  `editingEntityId` is set — the textarea's native undo of typing must win (belt: textarea
  `stopPropagation`; braces: handler checks `editingEntityId` — same pattern as the Escape
  guard).
- **`canApplyHistory()`** additionally returns false while `editingEntityId` is set: applying
  a snapshot mid-edit could delete or mutate the entity under the open textarea (orphaned
  overlay, commit into a dead entity).

## Chapter 9: Tests

- `src/__mocks__/webgl.ts`: `enable`, `disable`, `blendFunc` already exist. Actually missing:
  `createTexture`, `deleteTexture`, `bindTexture`, `texImage2D`, `texParameteri`,
  `activeTexture`, `pixelStorei`, `uniform1i` (samplers have no float variant — the textured
  program sets `u_texture` via `uniform1i(location, 0)`), `getParameter` (return e.g. 4096 for
  `MAX_TEXTURE_SIZE`), plus the texture/blend constants (`TEXTURE_2D`, `TEXTURE0`, `RGBA`,
  `UNSIGNED_BYTE`, `LINEAR`, `CLAMP_TO_EDGE`, `TEXTURE_WRAP_S/T`, `TEXTURE_MIN/MAG_FILTER`,
  `BLEND`, `ONE`, `ONE_MINUS_SRC_ALPHA`, `UNPACK_PREMULTIPLY_ALPHA_WEBGL`,
  `UNPACK_FLIP_Y_WEBGL`). The second shader program reuses the existing shader/program mocks
  unchanged. Optionally extend the same file's `getContext` override to return a stub 2D
  context for `'2d'` (`fillText`/`measureText`/font-prop no-ops) so the raster path itself is
  exercised and the jsdom virtual console stays clean; the null-context guard in Chapter 4 is
  the mandatory layer either way.
- New `src/__tests__/textLayout.test.ts` (pure, no DOM): interior boxes (rect, circle inscribed
  square, too-small → null), wrapping (word wrap, long-word char break, explicit `\n`),
  vertical clipping, centering origins — all with the injected fake measurer.
- Smoke test additions (`app.smoke.test.ts`): the suite drives input by mirroring the DOM
  handlers on the ECS directly (its `press()`/`moveTo()` helpers), because jsdom `MouseEvent`
  has no settable `offsetX/Y`. Add a matching `dblclick(screenX, screenY)` helper that sets
  `dblClickX/Y` + increments `dblClickCount` on `MouseComponent` — do NOT dispatch a DOM
  `dblclick` on the canvas. Then: draw a rect → `dblclick` → frame → assert textarea exists in
  the wrapper → set value + dispatch `blur` on the textarea → assert `TextComponent.content`;
  re-open edit shows existing content; empty commit removes the component; Escape-in-textarea
  commits and does not cancel/remove anything; click-away suppression (press on empty canvas +
  textarea `blur` → commit, selection still contains the shape, no drag/resize/move started —
  including with the button held).
- Persistence & history tests: `loadShapes(saveShapes())` is a no-op with text present;
  loading a snapshot without text removes previously present text; Escape-commit → `undo()`
  removes the text; text survives undo→redo; Ctrl/Cmd+Z simulated while editing leaves shapes
  untouched.
- Measurer seam: jsdom `measureText` returns 0, so `textLayout.ts` exports
  `setMeasurer(fn)` / `resetMeasurer()`; the default (lazily created shared offscreen-canvas
  measurer) is used in production, and the smoke suite calls `setMeasurer(fakeMonospace)` in
  `beforeAll`. No `vi.mock` — module-graph mocking under the real app entry is order-sensitive
  brittleness this suite deliberately avoids.
- Typecheck: `npx tsc --noEmit` stays green.

## Chapter 10: Docs & constants

- Constants live in `textLayout.ts` (`TEXT_PADDING`, `LINE_HEIGHT_FACTOR`, font defaults) and
  `textRaster.ts` (zoom bucketing, raster scale clamps).
- Update `CLAUDE.md` (directory structure, features, input flow: dblclick + edit-mode guards,
  system order) and `src/CHANGELOG.md`.

## Execution order

Chapters 3+4 (renderer texture path + raster cache) carry most of the implementation risk
(per-program uniforms, NPOT, y-flip, blending) and have no dependency on the editing UX.
Execute and test them first — renderer/mock tests green before starting Chapter 6. Sensible
sequence: 3 → 4 → 2 → 1 → 5 → 6 → 7 → 8 → 9 → 10 (layout (2) is pure and can be built/tested
any time before 5).

## Risks / known compromises (accepted for v1)

1. **Textarea vs. rendered-text mismatch**: the overlay is top-aligned while committed text is
   vertically centered → small visual jump on commit for short text. Accepted; fixing needs
   measured-height repositioning of the textarea.
2. **Zoom bucket blur**: between buckets text can be up to ~√2 under-resolved. Accepted.
3. **Wheel-during-edit commits**: mildly surprising but predictable; avoids per-frame overlay
   sync. Accepted.
4. **2D-canvas vs. injected measurer drift**: smoke tests use a fake measurer, so wrap points
   in tests differ from the browser. Layout correctness is covered by unit tests; smoke tests
   only assert content/lifecycle, never pixel positions.
5. **Wheel over the overlay is inert**: while editing, zoom/pan gestures made with the cursor
   on the textarea do nothing (events never reach the canvas). Moving the cursor off the
   overlay and scrolling commits-then-zooms as designed.
6. **Text stretches during handle resize**: the cached texture is scaled to the live box while
   a resize drag is active and re-rasterized (re-wrapped, crisp) on release — trades momentary
   distortion for not paying raster + GPU upload per frame.

## Acceptance criteria

- Double-click a rect or circle (cursor tool) → type → click away: text appears centered in
  the shape, wrapped to the padded interior, clipped when too tall.
- Text moves/resizes with the shape (drag re-uses the texture; handle resize re-wraps on
  release) and pans/zooms with the camera — readable at every zoom, re-sharpened at each
  power-of-two zoom bucket (Risk 2).
- Lines cannot be text-edited; double-click on empty canvas does nothing.
- Escape while editing commits; Escape otherwise still cancels in-progress drawing.
- Every committed text edit (blur or Escape) is exactly one undo step; Ctrl/Cmd+Z while
  editing performs the textarea's native undo only, never the whiteboard's.
- `loadShapes(saveShapes())` round-trips text as a no-op; `npm test` and `npx tsc --noEmit`
  pass.
