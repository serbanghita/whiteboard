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
src/
├── CHANGELOG.md                # Project history and milestone tracker
├── index.ts                    # Entry point: world, entities, queries, systems, input wiring
├── render.ts                   # DOM/canvas setup, mouse events, floating menu, keyboard (Escape)
├── collision.ts                # pointInRectangle / pointInCircle / pointOnLine helpers
├── shape.ts                    # Shape-agnostic hitTestEntity / getEntityBounds / moveEntityBy
├── camera.ts                   # Pure camera math: screenToWorld/worldToScreen, zoom-at-cursor, pan, applyWheel
├── handles.ts                  # Selection handle geometry (shared by RenderSystem + ResizeSystem)
├── autoSelect.ts               # Post-draw auto-switch to cursor tool with fresh shape selected
├── renderer/                   # WebGL renderer (IRenderer, WebGLRenderer, shaders, colorUtils)
├── __mocks__/webgl.ts          # Mock WebGL context for headless tests
├── __tests__/app.smoke.test.ts # Boots the real app in jsdom, drives tools frame-by-frame
├── component/                  # Data containers (no logic)
│   ├── RectangleComponent.ts   # x, y, width, height, colors
│   ├── CircleComponent.ts      # x, y (center), radius, colors
│   ├── LineComponent.ts        # x1, y1, x2, y2, colors, length getter
│   ├── MouseComponent.ts       # Cursor position (world) + last screen pos + event-time press/release counters
│   ├── CameraComponent.ts      # x, y (world coords of viewport top-left), scale (zoom)
│   ├── ToolStateComponent.ts   # currentTool (cursor|rectangle|circle|line), drawState, preview id
│   ├── SelectionRectangleComponent.ts  # Selected entities map + isDirty
│   ├── Layer.ts / DrawnOnLayer.ts      # Layer support (registered, not yet used)
│   └── Is*.ts                  # Tag components (IsRendered, IsMouseOver, IsMousePressed, IsSelected)
└── system/
    ├── ToolStateSystem.ts      # Tool-mode housekeeping
    ├── RectangleDrawSystem.ts  # Press-drag-release rectangle drawing (min size 5)
    ├── CircleDrawSystem.ts     # Press-drag-release circle drawing (fits bounding box, min r 3)
    ├── LineDrawSystem.ts       # Two-click line drawing (min length 5)
    ├── ResizeSystem.ts         # Resize selected shape via handle drag (runs BEFORE MousePress/Drag,
    │                           #   claims the press via SelectionRectangleComponent.resizeHandleId)
    ├── MousePressSystem.ts     # Click selection, all shape types (cursor tool only, edge-triggered, empty click clears)
    ├── DragSystem.ts           # Move selected shapes of any type (cursor tool only)
    ├── MouseOverSystem.ts / MouseOutSystem.ts  # Hover enter/exit tags (cursor tool only; tags only, NO visual effect)
    ├── SelectionSystem.ts      # Selection bounding rectangle: tight union of selected shapes' bounds (no padding)
    ├── RenderSystem.ts         # Clears canvas, draws all IsRendered entities plainly, then the selection overlay
    └── ConnectionSystem.ts     # Handles drawing new lines from shape connection handles

dist/
├── index.html                  # Entry HTML incl. floating tool menu (data-tool buttons)
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

### System Execution Order (index.ts)

ToolState → Rectangle/Circle/LineDraw → **Resize** → **Connection** → MousePress → Drag → MouseOver → MouseOut → Selection → Render (last).
Resize must precede MousePress/Drag: a press on a handle sets `resizeHandleId` and the other two skip it.

## Input Flow

1. `mousemove` → stores raw `offsetX/offsetY` in `MouseComponent.screenX/screenY`, then `setXY(screenToWorld(...))` — **MouseComponent.x/y/pressX/pressY are world coordinates**; the screen→world conversion happens only at the index.ts handlers
2. `mousedown` (canvas) → `MouseComponent.press(worldX, worldY)` (records event-time position, increments `pressCount`) + add `IsMousePressed` tag
3. `mouseup` (bound on **window**, so releases outside the wrapper still end the press) → `MouseComponent.release()` (increments `releaseCount`) + remove `IsMousePressed`
4. `wheel` (canvas, `passive: false` + `preventDefault`) → `applyWheel`: ctrl/cmd+wheel (= trackpad pinch) zooms at the cursor (world point under cursor stays fixed, clamped 0.1–8), plain wheel pans; afterwards the mouse world position is re-derived from `screenX/screenY` so mid-gesture zooms don't go stale
5. Floating menu clicks (`data-tool`) → removes any in-progress preview entity, then sets `ToolStateComponent.currentTool` (+ `reset()`)
6. Escape → cancels in-progress drawing (removes preview entity)

Systems detect press/release **edges** by comparing `pressCount`/`releaseCount` against their own last-seen values (consumed every frame, even when tool-gated). This is event-driven, so a release+press pair landing between two frames is still seen; never frame-sample `IsMousePressed` for edge detection. Hit-tests and drag anchors use the event-time `pressX/pressY`, not the frame-time position.

## Current Features

- Canvas starts empty on load (no demo shapes)
- Tool palette: cursor / rectangle / circle / line (floating menu in dist/index.html)
- Rectangle & circle: press-drag-release drawing with live preview and min-size cancel
- Line: two-click drawing with live preview, Escape to cancel
- After every successful draw the tool auto-reverts to cursor with the fresh shape selected, so its
  handles show and it can be dragged immediately (`src/autoSelect.ts`; also syncs the menu highlight)
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
- Lines that **connect** to shapes (drawing from handles is done, but dynamic tracking of shape movement/resizing is pending)
- Multi-entity selection + SHIFT+click additive selection (needs keyboard state; SelectionSystem
  already computes union bounds, MousePressSystem is single-select)
- Quadtree integration for collision queries (package installed, unused)
- WebGL text rendering (IRenderer.text is a stub)
- Layers (components registered, unused), localStorage save/load

## Performance Notes

All collision checks are O(n) per frame. The quadtree package is installed for future optimization but not yet integrated.
