# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- Endpoint re-attach: dragging a line's start/end ring handle now glues the endpoint to nearby
  shapes' connection points and re-attaches it on release (ResizeSystem, sharing the
  `connectionSnapTarget` rule) — previously an endpoint drag could only detach. The other end's
  shape is excluded (no both-ends-on-one-shape), a never-attached line gains its
  `LineAttachmentComponent` on drop, a grab-and-release-in-place re-attaches with zero extra undo
  steps, and each re-attach is exactly one undo step.
- Save/Load semantic JSON (v2): `Whiteboard.save()` exports an LLM-friendly `{v, camera, nodes,
  edges}` document — nodes carry the system-design type (`"gw"`, `"db"`, ... via the new
  `RectangleComponent.sysType`, stamped when a SYS tool draws), edges encode attachments as
  `"entityId:handleId"`, coordinates are rounded to integers and default styles (white fill,
  black stroke) are omitted — export-time only; undo snapshots keep full precision.
  `Whiteboard.load()` detects and imports v2, v1.1 (`{version, camera, shapes}`) and v1.0 (bare
  array) documents, validates attachment pins, skips entries without finite geometry (returns
  `{loaded, skipped}` — partial success, never a whole-load failure) and records one undo step.
  New 💾 Save / 📂 Load menu buttons open a popup: Save shows the pretty-printed document
  read-only; Load accepts pasted JSON with inline error/skip reporting. Opening either commits
  an in-flight text edit first. Covered by `src/__tests__/serialization.test.ts` (16 tests).
- Contextual properties panel (`src/PropertiesPanel.ts`): a horizontal bar over the single
  selected shape, 40px above it (flipping below when the shape is near the viewport top),
  following the shape every frame and hiding during drags/resizes/draws/text edits. Rectangles
  and circles get Fill + Stroke rows of 8 preset color swatches; lines get Start/End None|Arrow
  segmented controls. Every change is exactly one undo step; colors and arrows survive
  save/load, undo/redo, and Cmd+D duplication.
- Line arrowheads: `LineComponent.arrowStart`/`arrowEnd` draw a filled triangle at that endpoint
  in the line's stroke color (world-sized, zooming with the line, clamped to half the line
  length on short lines), via a new `IRenderer.triangle` primitive.
- New draw defaults: rectangles and circles are created with a white fill and black stroke
  (previously unfilled). Shape text still renders on top of the fill; previously saved shapes
  without a fill stay transparent.
- Project tooling: the `typescript-lsp` Claude Code plugin is enabled at project scope
  (`.claude/settings.json`), and CLAUDE.md now directs code navigation/diagnostics through the
  TypeScript language server.
- Menu hover feedback: every floating-menu and SYS-panel button tints light grey (#f0f0f0) while
  hovered. The active-tool and open-SYS highlights are preserved (only the hover tint is reset on
  mouse-out); disabled undo/redo buttons don't react.
- System-design shapes: a blue SYS button on the floating menu toggles a 2-column grid panel to
  its right listing 17 primitives by full name, in importance order (Client, Server, Database, Cache, Load
  Balancer, Gateway, Queue, CDN, Object Storage, Worker, Stream/Pub-Sub, External API, Search
  Index, DNS, Monitoring, Scheduler/Cron, Auth/Identity), all defined in a single
  `src/systemDesign.ts` registry. Each tool draws a rectangle stamped with the primitive's name
  as regular shape text (editable, serialized, undoable). Replaces the six inline SRV/DB/CCH/
  QUE/LB/GW menu buttons.
- Cmd/Ctrl+D duplicates the selected shapes (`Whiteboard.duplicateSelection()`), offset by a
  constant 16 screen pixels (converted to world units at the current zoom) so the copy never
  hides the original. The copy keeps the shape's text; line attachments are not copied (the
  duplicate is a free line). The selection moves to the copy, so repeated Cmd+D chains. Exactly
  one undo step per duplicate; no-op mid-gesture or while the text editor is open.
- Delete/Backspace removes the selected shapes (`Whiteboard.deleteSelection()`). Lines attached
  to a deleted shape survive and are detached in the same step; the deletion is exactly one
  undo step. No-op mid-gesture (mouse held, draw in progress, or text editor open).
- Text inside shapes: double-click a rectangle or circle (cursor tool) to type into it. Text wraps
  inside a padded interior box (rect inset by 8 world units; circle uses its inscribed square),
  is centered both ways, and clips lines that don't fit vertically. Editing happens in a
  transparent `textarea` overlay; blur or Escape commits (Escape commits, it does not cancel),
  Enter inserts a newline, and an empty commit removes the text. Rendered in WebGL via a new
  textured-quad path: text blocks are rasterized on an offscreen 2D canvas and cached as
  textures per entity, re-sharpened at each power-of-two zoom bucket; during a handle resize the
  cached texture stretches and re-wraps crisply on release.
- Text persists through `saveShapes()`/`loadShapes()` (full props: content, font size/family,
  color) and participates in undo/redo: every committed edit is exactly one history step,
  including Escape commits; Cmd/Ctrl+Z inside the editor stays the textarea's native undo.
- `textLayout.ts` (pure layout: interior boxes, greedy wrap, clip, centering, injectable
  measurer), `textRaster.ts` (raster + texture cache), `TextComponent`, `TextEditSystem`, and
  `IRenderer.createTextureFromCanvas`/`texturedQuad`/`deleteTexture`/`maxTextureSize`.

### Changed
- Connection snapping rule: the free endpoint now snaps to the **topmost** shape whose bounding
  box, inflated by 12 screen px (`CONNECTION_SNAP_RADIUS` / zoom), contains the cursor — hovering
  anywhere over a shape's body glues to its **nearest** connection dot (was: only within 12px of
  the exact dot, nearest dot across all shapes). `connectionPointNear` is replaced by
  `connectionSnapTarget` in `src/handles.ts`.
- Snap-dot reveal: while dragging a line endpoint (connection draw or endpoint re-drag), connection
  dots are shown **only on the current snap target** with a ring on the glue point (was: all
  shapes' dots during a connection draw, and none at all during an endpoint re-drag).
- A two-click line's committing press is now suppressed (`autoSelectFreshShape` stamps
  `suppressedPressCount`), so the same-frame switch to the cursor tool can no longer hand that
  press to ResizeSystem as an endpoint grab — with snapping this would have yanked the fresh
  line's endpoint onto a nearby shape.

### Removed
- The never-implemented `IRenderer.text()` stub and `TextOptions` (replaced by the textured-quad
  path above).

## [1.2.0] - 2026-07-20
### Added
- Undo/redo (`HistoryManager` + `HistorySystem`): every completed action (draw, drag, resize, connect, detach) is snapshotted on mouse release and can be undone/redone via Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z (or Ctrl+Y), or the new menu buttons (disabled state reflects stack availability). Snapshots cover shapes only - the camera is untouched - and are applied as differential updates that preserve entity ids, so line attachments and selections survive. Capped at 100 steps.
- `save()`/`load()` now persist entity ids, per-field colors, and line attachments (fixes the attachments-don't-round-trip limitation); legacy v1.0 files still load.
- Connection-line snapping: while dragging a line out of a connection handle, the free endpoint snaps to other rectangles'/circles' connection points (12px screen-constant radius, nearest wins, live + on release); every shape's connection dots show during the drag and the active snap target gets a ring highlight.
- `LineAttachmentComponent` + `LineAttachmentSystem`: attached lines follow their shapes through drags and resizes. Dragging an attached line's body detaches both ends; grabbing an endpoint handle detaches just that side.
- A stray click on a connection handle no longer creates a zero-length line (min length 5, like the line tool).

### Changed
- App bootstrap refactored into a `Whiteboard` class (`src/Whiteboard.ts`): DOM construction, event binding, ECS setup, and serialization now live there; `src/index.ts` is a thin entry point and `src/render.ts` is removed.

### Fixed
- `ConnectionSystem` now passes the camera scale to `handleAtPoint`, so connection handles are grabbable at any zoom level (previously only correct at 1x).

## [1.1.0] - 2026-07-19
### Added
- `ConnectionSystem` to allow drawing new lines by dragging from blue midpoint connection handles (n, e, s, w) on selected shapes.
- High test coverage (over 93%) across systems and components, including native DOM event listener tests.
- `CHANGELOG.md` file to track project history.

### Changed
- Improved test harness in `app.smoke.test.ts` to dispatch and validate real DOM events natively.

### Removed
- `RenderSelectionSystem.ts` (dead scaffolding code replaced by `RenderSystem`).
