# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]

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
