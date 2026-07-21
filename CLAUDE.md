# Whiteboard - Claude Code Context

A lightweight, portable drawing application built with TypeScript using an Entity Component System (ECS) architecture, rendered with a local WebGL renderer.

## Product Goal

Draw and resize the basic shapes: **rectangle**, **circle**, and **connecting lines** between shapes.

## External Dependencies (local file: links)

`@serbanghita-gamedev/ecs` and `@serbanghita-gamedev/quadtree` are consumed **from the local
`~/work/gamedev-published-repos/` folder** via `file:` links in package.json (npm symlinks them
into node_modules). Do not switch them back to `github:` specs.

```
@serbanghita-gamedev/ecs       - ECS framework (World, Entity, Component, System, Query)
@serbanghita-gamedev/quadtree  - Spatial partitioning (installed, not yet used)
```

Notes on consuming these packages from TS source:
- Their `main` points at `src/index.ts`, so tsconfig needs `moduleResolution: "bundler"`,
  `allowImportingTsExtensions`, `noEmit`.
- `strictFunctionTypes` is disabled: the ecs `ComponentConstructor` type relies on bivariant
  constructor params.
- `World.removeEntity(id)` takes a **string id**, not an Entity.

## Code Intelligence

Always attempt to use the TypeScript LSP tool first (typescript-lsp plugin, enabled at project
scope in `.claude/settings.json`) for diagnostics, go-to-definition, references, and type info —
prefer it over grep-based navigation and over running tsc for spot checks. Requires the
`typescript-language-server` binary on PATH. Caveat: the language server does not apply this
project's `strictFunctionTypes: false`, so it reports false-positive `ComponentConstructor`
bivariance errors at `registerComponents` call sites — `npx tsc --noEmit` is the authority there.

## Directory Structure

```
CHANGELOG.md                    # Project history and milestone tracker (repo root)
src/
├── index.ts                    # Thin entry point: re-exports Whiteboard, exposes window.Whiteboard
├── Whiteboard.ts               # The app class: builds DOM (wrapper/canvas/floating menu/save-load
│                               #   popup), binds all input events, registers components/entities/
│                               #   queries/systems, save()/load() (v2 semantic JSON export/import,
│                               #   loads v1.1/v1.0 too), saveShapes()/loadShapes() (id-preserving
│                               #   differential snapshots for undo - NEVER rounded/reformatted),
│                               #   undo()/redo(), destroy()
├── HistoryManager.ts           # Pure undo/redo stack over saveShapes() JSON strings (string-equality
│                               #   dedup, redo-clear on push, 100-step cap, onStateChange callback)
├── PropertiesPanel.ts          # Contextual DOM bar over the single selected shape (fill/stroke
│                               #   swatches for rect/circle, start/end None|Arrow segments for
│                               #   lines); repositioned every frame via world.start's
│                               #   callbackFnAfterSystemsUpdate, 40px above the shape (flips
│                               #   below at the viewport top), hidden during any gesture; every
│                               #   change is one undo step via the canCommit/onCommit closures
├── collision.ts                # pointInRectangle / pointInCircle / pointOnLine helpers
├── shape.ts                    # Shape-agnostic hitTestEntity / getEntityBounds / moveEntityBy
├── camera.ts                   # Pure camera math: screenToWorld/worldToScreen, zoom-at-cursor, pan, applyWheel
├── textLayout.ts               # Pure text layout: interior boxes (rect inset / circle inscribed square),
│                               #   greedy word wrap + char-break, vertical clip, centering (box-local
│                               #   per-line positions - single owner of placement), measurer seam
│                               #   (setMeasurer/resetMeasurer for tests), TEXT_PADDING + font defaults
├── textRaster.ts               # TextTextureCache: rasterizes text blocks to an offscreen 2D canvas at
│                               #   power-of-two zoom buckets, uploads via IRenderer, per-entity cache
│                               #   (key: content|box|font|color|bucket), freeze-stretch during resizes
├── handles.ts                  # Handle geometry: selection handles + connection points
│                               #   (getConnectionPoints / connectionPointNear for snap targets)
├── autoSelect.ts               # Post-draw auto-switch to cursor tool with fresh shape selected
├── systemDesign.ts             # SYSTEM_DESIGN_TOOLS registry (17 primitives, importance order):
│                               #   single source of truth for the ToolType union, the SYS panel
│                               #   buttons and the label stamped on drawn shapes
├── renderer/                   # WebGL renderer (IRenderer, WebGLRenderer, shaders, colorUtils);
│                               #   primitives: rectangle, circle, line, triangle (filled, used
│                               #   for line arrowheads), dot, textured quads
├── __mocks__/webgl.ts          # Mock WebGL context for headless tests
├── __tests__/app.smoke.test.ts # Boots the real app in jsdom, drives tools frame-by-frame
├── __tests__/serialization.test.ts   # save()/load() v2 + fallbacks, roundtrip identity, undo
│                                     #   byte-stability, sysType survival, popup flows
├── __tests__/historyManager.test.ts  # Unit tests for the undo/redo stack
├── __tests__/textLayout.test.ts      # Pure layout tests (fake monospace measurer, no DOM/ECS)
├── component/                  # Data containers (no logic)
│   ├── RectangleComponent.ts   # x, y, width, height, colors, sysType? (SYS tool id, e.g. 'gw' -
│   │                           #   absent on plain rects; the durable semantic type, since the
│   │                           #   label text is user-editable)
│   ├── CircleComponent.ts      # x, y (center), radius, colors
│   ├── LineComponent.ts        # x1, y1, x2, y2, colors, length getter, arrowStart/arrowEnd
│   │                           #   ('arrow' | undefined; 'none' is never stored - absent key
│   │                           #   keeps snapshots canonical)
│   ├── LineAttachmentComponent.ts  # Per-endpoint pins {entityId, handleId} tying a line to shapes
│   ├── MouseComponent.ts       # Cursor position (world) + last screen pos + event-time press/release
│   │                           #   AND dblclick counters
│   ├── CameraComponent.ts      # x, y (world coords of viewport top-left), scale (zoom)
│   ├── TextComponent.ts        # content, fontSize (world units), fontFamily, color - only on shapes
│   │                           #   that have text; removed on empty commit
│   ├── ToolStateComponent.ts   # currentTool (cursor|rectangle|circle|line|<system-design id>),
│   │                           #   drawState, preview id;
│   │                           #   class fields editingEntityId + suppressedPressCount (text editing,
│   │                           #   NOT touched by reset())
│   ├── SelectionRectangleComponent.ts  # Selected entities map + isDirty + claim flags + connectionSnap
│   ├── Layer.ts / DrawnOnLayer.ts      # Layer support (registered, not yet used)
│   └── Is*.ts                  # Tag components (IsRendered, IsMouseOver, IsMousePressed, IsSelected)
└── system/
    ├── ToolStateSystem.ts      # Tool-mode housekeeping
    ├── RectangleDrawSystem.ts  # Press-drag-release rectangle drawing (min size 5); also handles
    │                           #   every system-design tool (same flow + stamps the registry's
    │                           #   label as a TextComponent AND the tool id as sysType on the
    │                           #   finished rect)
    ├── CircleDrawSystem.ts     # Press-drag-release circle drawing (fits bounding box, min r 3)
    ├── LineDrawSystem.ts       # Two-click line drawing (min length 5)
    ├── ResizeSystem.ts         # Resize selected shape via handle drag (runs BEFORE MousePress/Drag,
    │                           #   claims the press via SelectionRectangleComponent.resizeHandleId);
    │                           #   grabbing an attached line endpoint detaches that side
    ├── TextEditSystem.ts       # Double-click a rect/circle -> transparent textarea overlay over the
    │                           #   interior box; commit on blur/Escape (Escape commits, not cancels);
    │                           #   empty commit removes TextComponent; commit stamps
    │                           #   suppressedPressCount so the click-away press is inert; calls
    │                           #   recordHistory() when content changed (Escape has no release edge)
    ├── MousePressSystem.ts     # Click selection, all shape types (cursor tool only, edge-triggered, empty click clears)
    ├── DragSystem.ts           # Move selected shapes of any type (cursor tool only); dragging an
    │                           #   attached line's body detaches both ends first
    ├── LineAttachmentSystem.ts # Re-pins attached line endpoints to their shapes' connection points
    │                           #   every frame (after Drag/Resize, before Selection/Render)
    ├── MouseOverSystem.ts / MouseOutSystem.ts  # Hover enter/exit tags (cursor tool only; tags only, NO visual effect)
    ├── SelectionSystem.ts      # Selection bounding rectangle: tight union of selected shapes' bounds (no padding)
    ├── RenderSystem.ts         # Clears canvas, draws all IsRendered entities plainly (each shape's
    │                           #   text right after it, as a textured quad from the owned
    │                           #   TextTextureCache; skips the entity being edited; lines get
    │                           #   filled arrowhead triangles per arrowStart/arrowEnd, clamped to
    │                           #   half the line length), the selection
    │                           #   overlay, then snap-target dots while a connection drag is active
    ├── ConnectionSystem.ts     # Draws new lines from connection handles, snapping the free endpoint
    │                           #   to other shapes' connection points and recording attachments
    └── HistorySystem.ts        # Runs LAST: on each mouse-release edge (skipped while a draw is
                                #   mid-gesture, so previews are never snapshotted) calls back into
                                #   Whiteboard.recordHistory()

dist/
├── index.html                  # Entry HTML (the floating tool menu is built by Whiteboard.ts)
└── demo.js                     # Bundled output
```

## ECS Rules (local ecs package)

- Register every component class in `world.registerComponents([...])` before use.
- Components extend `Component<Props>`; tag components use `Component<Record<string, never>>`.
- Constructor props are **required** (no defaulted/optional constructor params) — pass explicit
  props at `addComponent` call sites.
- Systems extend `System`, implement `update(now)`; created via `world.createSystem(Sys, query, ...args)`
  (extra args reach the constructor, e.g. RenderSystem gets the renderer).
- `world.removeEntity(entity.id)` — string id.

### Fixed Entities

| Entity | Components | Purpose |
|--------|------------|---------|
| `cursor` | MouseComponent (+IsMousePressed while down) | Mouse position/button state |
| `selection` | SelectionRectangleComponent | Selected entities collection |
| `tool` | ToolStateComponent | Active tool + in-progress draw state |
| `default-layer` | Layer | Layer placeholder |
| `camera` | CameraComponent | View transform: zoom + pan |

### System Execution Order (Whiteboard.setupECS)

ToolState → Rectangle/Circle/LineDraw → **Resize** → **Connection** → **TextEdit** → MousePress → Drag → **LineAttachment** → MouseOver → MouseOut → Selection → Render → **History** (last).
Resize/Connection must precede MousePress/Drag: a press on a handle sets `resizeHandleId`/`connectionHandleId` and the others skip it.
A text-edit click-away commit stamps `ToolStateComponent.suppressedPressCount`; all four press consumers (Resize, Connection, MousePress, Drag) skip any press with `pressCount <= suppressedPressCount` for its **entire hold** (Drag has no edge gate, so the guard sits before its movement logic).
LineAttachment must follow every system that mutates shapes (Resize, Connection, Drag) and precede Selection/Render, so re-pinned lines render in the same frame.
History must run last so its release-edge snapshot sees the frame's fully finalized state (draw committed, drag ended, lines re-pinned).

## Input Flow

All input handlers live in `Whiteboard.bindEvents`:

1. `mousemove` → stores raw `offsetX/offsetY` in `MouseComponent.screenX/screenY`, then `setXY(screenToWorld(...))` — **MouseComponent.x/y/pressX/pressY are world coordinates**; the screen→world conversion happens only at these handlers
2. `mousedown` (canvas) → `MouseComponent.press(worldX, worldY)` (records event-time position, increments `pressCount`) + add `IsMousePressed` tag
3. `mouseup` (bound on **window**, so releases outside the wrapper still end the press) → `MouseComponent.release()` (increments `releaseCount`) + remove `IsMousePressed`
4. `wheel` (canvas, `passive: false` + `preventDefault`) → `applyWheel`: ctrl/cmd+wheel (= trackpad pinch) zooms at the cursor (world point under cursor stays fixed, clamped 0.1–8), plain wheel pans; afterwards the mouse world position is re-derived from `screenX/screenY` so mid-gesture zooms don't go stale
5. `dblclick` (canvas) → `MouseComponent.doubleClick(worldX, worldY)` (event-time counter, same
   idiom as press) — consumed by TextEditSystem to open the text editor
6. Floating menu clicks (`data-tool`) → removes any in-progress preview entity, then sets `ToolStateComponent.currentTool` (+ `reset()`); the blue **SYS** button (`data-action="toggle-sys"`) instead toggles the system-design grid panel flying out to the right of the menu (panel buttons are `data-tool` too, so the same delegation handles them — the panel stays open across tool picks); the 💾/📂 buttons (`data-action="save"/"load"`) open the Save/Load popup (lazy-built overlay — while closed there is NO popup textarea in the DOM, which the text-edit overlay lookup and smoke tests rely on; both open paths commit an in-flight text edit first). Delegated mouseover/mouseout on the menu tint resting buttons light grey (`hoverTint` dataset flag; only the tint is ever reset, so the active-tool/open-SYS highlights survive — any explicit background set deletes the flag)
7. Escape → cancels in-progress drawing (removes preview entity)
8. Cmd/Ctrl+Z → undo; Cmd/Ctrl+Shift+Z or Ctrl+Y → redo (gated on `isActive` like Escape,
   `preventDefault` blocks native undo; no-ops while the button is held or a draw is mid-gesture)
9. Delete/Backspace → `deleteSelection()`: removes all selected shapes, synchronously detaches
   surviving attached lines (so the history snapshot matches next-frame state), records one undo
   step via `recordHistory()` (a key press has no release edge). Gated on `canApplyHistory()`
10. Cmd/Ctrl+D → `duplicateSelection()`: copies selected shapes at a 16-screen-px offset
   (÷ camera scale), text included, line attachments dropped (LineAttachmentSystem would re-pin
   the copy onto the original's points, undoing the offset); selection moves to the copies so
   repeated presses chain; one undo step. Gated on `canApplyHistory()`; `preventDefault` blocks
   the browser bookmark dialog
11. **While a text edit is open** (`ToolStateComponent.editingEntityId` set): the document keydown
   handler skips all keyboard shortcuts including delete (the textarea owns the keyboard — its own
   keydown listener also stops propagation as the belt); wheel and container-resize **commit the
   edit first** by blurring the textarea (the blur handler IS the commit), then proceed;
   `canApplyHistory()` refuses so undo can't mutate the entity under the open editor

Systems detect press/release **edges** by comparing `pressCount`/`releaseCount` against their own last-seen values (consumed every frame, even when tool-gated). This is event-driven, so a release+press pair landing between two frames is still seen; never frame-sample `IsMousePressed` for edge detection. Hit-tests and drag anchors use the event-time `pressX/pressY`, not the frame-time position.

## Current Features

- After every successful draw the tool auto-reverts to cursor with the fresh shape selected, so its
  handles show and it can be dragged immediately (`src/autoSelect.ts`; note: the menu highlight is
  NOT synced on auto-revert since the Whiteboard refactor — known regression)
- Click-to-select and drag-to-move for **all three shape types** (cursor tool only; single select,
  empty click clears; lines hit within 5px tolerance; topmost shape wins on overlap)
- Selection visuals (RenderSystem overlay, drawn on top): **tight blue bounding box + gray ring
  handles at the corners** (rect: box coincides with the shape; circle: box = circle's bbox, per
  design mockups); a single selected line gets ring handles at its endpoints instead of a box.
  Additionally, **blue filled dots appear at midpoints (n, e, s, w) for connection handles**.
- **Resize by dragging handles** (ResizeSystem): rect/circle keep the opposite bbox corner fixed
  (crossing it flips the shape; circle stays inscribed, hugging the fixed corner); line endpoints
  move individually. Grab offset preserved (no jump), 8px hit radius (`handles.ts`), min sizes as
  in the draw systems
- **Connecting lines** (ConnectionSystem): drag out of a selected shape's blue n/e/s/w dot to draw a
  line whose start is attached to that handle. While dragging, every other rect/circle shows its
  connection dots and the free endpoint **snaps** to the nearest one within 12 screen px
  (`CONNECTION_SNAP_RADIUS`, nearest wins, source shape excluded); the active target gets a ring
  highlight (`SelectionRectangleComponent.connectionSnap`). Release on a point attaches the end;
  release elsewhere leaves a dangling end; a stray click (< 5 length, unsnapped) creates nothing
- **Attached lines track shapes** (`LineAttachmentComponent` + `LineAttachmentSystem`): endpoints
  pinned to `{entityId, handleId}` are recomputed from the shape's bounds every frame, so lines
  follow drags AND resizes. Dragging an attached line's body detaches both ends (DragSystem);
  grabbing an endpoint handle detaches just that side (ResizeSystem). Dangling refs self-clean;
  a fully detached line loses the component
- **Undo/redo** (`HistoryManager` + `HistorySystem` + menu buttons): every completed action is
  snapshotted via `saveShapes()` on mouse release (dedup by string equality, so no-op releases don't
  pollute the history; previews excluded; 100-step cap). Undo/redo applies snapshots as
  **differential updates** (`loadShapes()`): entities patched in place by preserved id, missing ones
  recreated with their original id, extras removed, selection cleared first — so line attachments
  and z-order survive. Camera is never touched. Keyboard: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z, Ctrl+Y
- **Text inside shapes** (TextComponent + TextEditSystem + textLayout/textRaster): double-click a
  rect/circle (cursor tool) to edit; transparent textarea overlay over the interior box (rect inset
  by `TEXT_PADDING` = 8 world units; circle: inscribed square side r·√2 − 2·PAD); blur/Escape
  commits (Escape commits, never cancels; Enter = newline; empty commit removes the component).
  Text wraps greedily (long words char-break, `\n` respected), clips whole lines vertically, and is
  centered both ways — all placement computed in `textLayout.ts` (box-local per-line positions).
  Rendered as WebGL textured quads: rasterized on an offscreen 2D canvas at
  `zoomBucket(2^round(log2 scale)) × DPR`, cached per entity, re-sharpened per bucket; during a
  handle resize the cached texture stretches and re-wraps on release. Text serializes through
  `saveShapes()` (full props) with add/update/remove reconcile in `loadShapes()`, and every
  committed edit is exactly one undo step (TextEditSystem calls `recordHistory()` on change —
  Escape commits produce no release edge for HistorySystem to see). fontSize is **world units**
  (text zooms with the world); the layout measurer is injectable (`setMeasurer`) because jsdom
  has no `measureText`
- **System-design shapes** (`src/systemDesign.ts` registry + SYS menu panel): 17 primitives in
  importance order (Client, Server, Database, Cache, Load Balancer, Gateway, Queue, CDN, Object
  Storage, Worker, Stream/Pub-Sub, External API, Search Index, DNS, Monitoring, Scheduler/Cron,
  Auth/Identity). The blue SYS button on the left menu toggles a 2-column grid panel to its right
  showing each primitive's full name (styled like the menu; hidden again on a second SYS press).
  Each tool is a rectangle-tool
  variant: RectangleDrawSystem draws the rect and stamps the registry's label as a centered
  TextComponent plus the tool id as `RectangleComponent.sysType`, then auto-reverts to cursor
  like any draw. The label is ordinary shape text (editable via double-click, serialized,
  duplicated, undoable); `sysType` is the durable semantic record (copied by Cmd+D, reconciled
  through undo/redo snapshots, exported as the v2 node `type`)
- Hovering has **no visual effect** — IsMouseOver tags are still maintained (cursor mode only) for
  future cursor feedback, but RenderSystem ignores them
- **Zoom + pan camera** (`camera` entity, `src/camera.ts`): pinch / ctrl/cmd+wheel zooms toward the
  cursor (0.1×–8×), plain wheel pans. Shapes stay in world coords; the vertex shader applies
  `u_translate`/`u_scale` (RenderSystem pushes them via `IRenderer.setCamera` each frame).
  Screen-constant UI divides by scale: line hit tolerance (`hitTestEntity(..., scale)`), handle
  hit radius (`handleAtPoint(..., scale)`), selection stroke + handle sizes (RenderSystem).
  Shape strokes scale with the world; draw min-sizes stay world-space. DPR backing-store scaling
  is independent of camera zoom
- **Contextual properties panel** (`src/PropertiesPanel.ts`): a horizontal DOM bar appears 40px
  above the single selected shape (cursor tool only; flips below when the shape is near the
  viewport top, clamped inside the wrapper), repositioned every frame via
  `world.start({ callbackFnAfterSystemsUpdate })`. Rect/circle: Fill + Stroke rows of 8 preset
  swatches (white, black, red, orange, yellow, green, blue, purple; active swatch gets a blue
  border, named `black`/`white` defaults normalize to their hex swatches). Line: Start/End
  segmented None|Arrow controls toggling `LineComponent.arrowStart/arrowEnd`. Hidden during any
  gesture (mouse held, draw in progress, text edit open). Each change is exactly one undo step
  (`recordHistory()`; same-value clicks are no-ops); colors and arrows serialize through
  `saveShapes()`/`loadShapes()` and are copied by Cmd+D. Panel clicks never reach the canvas
  (sibling element), so the selection survives them
- **Line arrowheads** (RenderSystem + `IRenderer.triangle`): filled triangles at either endpoint
  per `arrowStart`/`arrowEnd`, in the line's stroke color, world-sized 12×10 (zoom with the
  line) and clamped to half the line length so short lines stay sane; drawn after the line so
  they cap it
- **Draw defaults**: rectangles and circles are created with `fillColor: 'white'` +
  `strokeColor: 'black'` (previously no fill). A shape's text always draws on top of its own
  fill (shape first, text immediately after); legacy loaded shapes without a fill stay
  transparent
- **Save/Load v2 semantic JSON** (`Whiteboard.save()/load()` + 💾/📂 popup): `save()` exports
  `{v: 2, camera, nodes, edges}` — nodes are rects/circles (`type` = `sysType` for SYS shapes,
  else `rect`/`circle`; `text` collapses to a plain string at default font), edges are lines
  with `from`/`to` pins as `"entityId:handleId"`; coordinates rounded to integers and default
  styles (white fill / black stroke / width 1) omitted, `"fill": "none"` marking transparent
  legacy shapes — ALL export-time only, built from the untouched `saveShapes()` snapshot
  (byte-stable across exports; rounding must never enter the undo path). `load()` detects
  v2 / v1.1 (`{version, camera, shapes}`) / v1.0 (bare array), validates pins (bad handle →
  dangling line), skips entries without finite geometry, returns `{loaded, skipped}`, restores
  the optional camera, records one undo step, and throws only on unparseable/unrecognized
  input. The popup (lazy-built; class-queried refs, no DOM ids) shows the pretty-printed
  export read-only with Load disabled, or an editable paste target: confirm is gated on
  `canApplyHistory()`, parse errors red-border the textarea, `skipped > 0` keeps it open with
  a "Loaded N, skipped M" notice; Escape closes it (popup-scoped keydown with
  stopPropagation - the popup owns the keyboard while open)

## TODO / Incomplete

- Resize cursor feedback (nwse-resize etc. when hovering a handle)
- Re-snap/re-attach when dragging a line endpoint near a connection point (endpoint drag only detaches today)
- `Whiteboard.save()/load()` export/import the v2 semantic JSON via the popup (v1.1/v1.0 files
  still load), but there's no localStorage hookup or file download yet
- Menu highlight not synced when a draw auto-reverts to cursor (regression from the Whiteboard refactor)
- Multi-entity selection + SHIFT+click additive selection (needs keyboard state; SelectionSystem
  already computes union bounds, MousePressSystem is single-select)
- Quadtree integration for collision queries (package installed, unused)
- Text styling UI (font size/family/color are per-shape data already, but fixed to defaults)
- Text overlay niceties: vertical centering inside the textarea (currently top-aligned → small
  jump on commit), wheel over the overlay is inert, textarea doesn't follow camera/resize
  (both commit instead)
- Layers (components registered, unused)

## Performance Notes

All collision checks are O(n) per frame. The quadtree package is installed for future optimization but not yet integrated.
