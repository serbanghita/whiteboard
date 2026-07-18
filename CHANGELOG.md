# Changelog
All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

## [Unreleased]
### Added
- `ConnectionSystem` to allow drawing new lines by dragging from blue midpoint connection handles (n, e, s, w) on selected shapes.
- High test coverage (over 93%) across systems and components, including native DOM event listener tests.
- `CHANGELOG.md` file to track project history.

### Changed
- Improved test harness in `app.smoke.test.ts` to dispatch and validate real DOM events natively.

### Removed
- `RenderSelectionSystem.ts` (dead scaffolding code replaced by `RenderSystem`).
