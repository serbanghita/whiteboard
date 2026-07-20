# Whiteboard - Claude Code Context

A lightweight, portable drawing application built with TypeScript using an Entity Component System (ECS) architecture, rendered with a local WebGL renderer.

## Product Goal

Draw and resize the basic shapes: **rectangle**, **circle**, and **connecting lines** between shapes.

## Tech Stack

- **Language**: TypeScript (strict, typecheck with `npx tsc --noEmit`)
- **Build**: esbuild (ES modules) — `npm run build` / `npm run dev`
- **Architecture**: ECS (Entity Component System)
- **Rendering**: WebGL via the in-repo `src/renderer/` (`WebGLRenderer` implements `IRenderer`)
- **Testing**: Vitest + jsdom, WebGL mocked in `src/__mocks__/webgl.ts` — `npm test`

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

## Directory Structure

```
CHANGELOG.md                    # Project history and milestone tracker (repo root)
src/
├── index.ts                    # Thin entry point: re-exports Whiteboard, exposes window.Whiteboard
├── Whiteboard.ts               # The app class: builds DOM (wrapper/canvas/floating menu), binds all
│                               #   input events, registers components/entities/queries/systems,
│                               #   save()/load() JSON serialization, saveShapes()/loadShapes()
│                               #   (id-preserving differential snapshots for undo), undo()/redo(),
│                               #   destroy()
├── HistoryManager.ts           # Pure undo/redo stack over saveShapes() JSON strings (string-equality
│                               #   dedup, redo-clear on push, 100-step cap, onStateChange callback)
├── collision.ts                # pointInRectangle / pointInCircle / pointOnLine helpers
├── shape.ts                    # Shape-agnostic hitTestEntity / getEntityBounds / moveEntityBy
├── camera.ts                   # Pure camera math: screenToWorld/worldToScreen, zoom-at-cursor, pan, applyWheel
├── handles.ts                  # Handle geometry: selection handles + connection points
│                               #   (getConnectionPoints / connectionPointNear for snap targets)
├── autoSelect.ts               # Post-draw auto-switch to cursor tool with fresh shape selected
├── renderer/                   # WebGL renderer (IRenderer, WebGLRenderer, shaders, colorUtils)
├── __mocks__/webgl.ts          # Mock WebGL context for headless tests
├── __tests__/app.smoke.test.ts # Boots the real app in jsdom, drives tools frame-by-frame
├── __tests__/historyManager.test.ts  # Unit tests for the undo/redo stack
├── component/                  # Data containers (no logic)
│   ├── RectangleComponent.ts   # x, y, width, height, colors
│   ├── CircleComponent.ts      # x, y (center), radius, colors
│   ├── LineComponent.ts        # x1, y1, x2, y2, colors, length getter
│   ├── LineAttachmentComponent.ts  # Per-endpoint pins {entityId, handleId} tying a line to shapes
│   ├── MouseComponent.ts       # Cursor position (world) + last screen pos + event-time press/release counters
│   ├── CameraComponent.ts      # x, y (world coords of viewport top-left), scale (zoom)
│   ├── ToolStateComponent.ts   # currentTool (cursor|rectangle|circle|line), drawState, preview id
│   ├── SelectionRectangleComponent.ts  # Selected entities map + isDirty + claim flags + connectionSnap
│   ├── Layer.ts / DrawnOnLayer.ts      # Layer support (registered, not yet used)
│   └── Is*.ts                  # Tag components (IsRendered, IsMouseOver, IsMousePressed, IsSelected)
└── system/
    ├── ToolStateSystem.ts      # Tool-mode housekeeping
    ├── RectangleDrawSystem.ts  # Press-drag-release rectangle drawing (min size 5)
    ├── CircleDrawSystem.ts     # Press-drag-release circle drawing (fits bounding box, min r 3)
    ├── LineDrawSystem.ts       # Two-click line drawing (min length 5)
    ├── ResizeSystem.ts         # Resize selected shape via handle drag (runs BEFORE MousePress/Drag,
    │                           #   claims the press via SelectionRectangleComponent.resizeHandleId);
    │                           #   grabbing an attached line endpoint detaches that side
    ├── MousePressSystem.ts     # Click selection, all shape types (cursor tool only, edge-triggered, empty click clears)
    ├── DragSystem.ts           # Move selected shapes of any type (cursor tool only); dragging an
    │                           #   attached line's body detaches both ends first
    ├── LineAttachmentSystem.ts # Re-pins attached line endpoints to their shapes' connection points
    │                           #   every frame (after Drag/Resize, before Selection/Render)
    ├── MouseOverSystem.ts / MouseOutSystem.ts  # Hover enter/exit tags (cursor tool only; tags only, NO visual effect)
    ├── SelectionSystem.ts      # Selection bounding rectangle: tight union of selected shapes' bounds (no padding)
    ├── RenderSystem.ts         # Clears canvas, draws all IsRendered entities plainly, the selection
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

ToolState → Rectangle/Circle/LineDraw → **Resize** → **Connection** → MousePress → Drag → **LineAttachment** → MouseOver → MouseOut → Selection → Render → **History** (last).
Resize/Connection must precede MousePress/Drag: a press on a handle sets `resizeHandleId`/`connectionHandleId` and the others skip it.
LineAttachment must follow every system that mutates shapes (Resize, Connection, Drag) and precede Selection/Render, so re-pinned lines render in the same frame.
History must run last so its release-edge snapshot sees the frame's fully finalized state (draw committed, drag ended, lines re-pinned).

## Input Flow

All input handlers live in `Whiteboard.bindEvents`:

1. `mousemove` → stores raw `offsetX/offsetY` in `MouseComponent.screenX/screenY`, then `setXY(screenToWorld(...))` — **MouseComponent.x/y/pressX/pressY are world coordinates**; the screen→world conversion happens only at these handlers
2. `mousedown` (canvas) → `MouseComponent.press(worldX, worldY)` (records event-time position, increments `pressCount`) + add `IsMousePressed` tag
3. `mouseup` (bound on **window**, so releases outside the wrapper still end the press) → `MouseComponent.release()` (increments `releaseCount`) + remove `IsMousePressed`
4. `wheel` (canvas, `passive: false` + `preventDefault`) → `applyWheel`: ctrl/cmd+wheel (= trackpad pinch) zooms at the cursor (world point under cursor stays fixed, clamped 0.1–8), plain wheel pans; afterwards the mouse world position is re-derived from `screenX/screenY` so mid-gesture zooms don't go stale
5. Floating menu clicks (`data-tool`) → removes any in-progress preview entity, then sets `ToolStateComponent.currentTool` (+ `reset()`)
6. Escape → cancels in-progress drawing (removes preview entity)
7. Cmd/Ctrl+Z → undo; Cmd/Ctrl+Shift+Z or Ctrl+Y → redo (gated on `isActive` like Escape,
   `preventDefault` blocks native undo; no-ops while the button is held or a draw is mid-gesture)

Systems detect press/release **edges** by comparing `pressCount`/`releaseCount` against their own last-seen values (consumed every frame, even when tool-gated). This is event-driven, so a release+press pair landing between two frames is still seen; never frame-sample `IsMousePressed` for edge detection. Hit-tests and drag anchors use the event-time `pressX/pressY`, not the frame-time position.

## Current Features

- Canvas starts empty on load (no demo shapes)
- Tool palette: cursor / rectangle / circle / line (floating menu built by `Whiteboard.ts`)
- Rectangle & circle: press-drag-release drawing with live preview and min-size cancel
- Line: two-click drawing with live preview, Escape to cancel
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
- Hovering has **no visual effect** — IsMouseOver tags are still maintained (cursor mode only) for
  future cursor feedback, but RenderSystem ignores them
- **Zoom + pan camera** (`camera` entity, `src/camera.ts`): pinch / ctrl/cmd+wheel zooms toward the
  cursor (0.1×–8×), plain wheel pans. Shapes stay in world coords; the vertex shader applies
  `u_translate`/`u_scale` (RenderSystem pushes them via `IRenderer.setCamera` each frame).
  Screen-constant UI divides by scale: line hit tolerance (`hitTestEntity(..., scale)`), handle
  hit radius (`handleAtPoint(..., scale)`), selection stroke + handle sizes (RenderSystem).
  Shape strokes scale with the world; draw min-sizes stay world-space. DPR backing-store scaling
  is independent of camera zoom

## TODO / Incomplete

- Resize cursor feedback (nwse-resize etc. when hovering a handle)
- Re-snap/re-attach when dragging a line endpoint near a connection point (endpoint drag only detaches today)
- `Whiteboard.save()/load()` now persist entity ids + line attachments (v1.1 format; legacy v1.0
  `color`-field files still load), but there's no localStorage hookup yet
- Menu highlight not synced when a draw auto-reverts to cursor (regression from the Whiteboard refactor)
- Multi-entity selection + SHIFT+click additive selection (needs keyboard state; SelectionSystem
  already computes union bounds, MousePressSystem is single-select)
- Quadtree integration for collision queries (package installed, unused)
- WebGL text rendering (IRenderer.text is a stub)
- Layers (components registered, unused)

## Performance Notes

All collision checks are O(n) per frame. The quadtree package is installed for future optimization but not yet integrated.
