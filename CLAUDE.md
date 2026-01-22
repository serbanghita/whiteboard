# Whiteboard - Claude Code Context

A lightweight, portable drawing application built with TypeScript using an Entity Component System (ECS) architecture for 2D canvas manipulation.

## Tech Stack

- **Language**: TypeScript 5.4.5
- **Build**: esbuild (ES modules)
- **Architecture**: ECS (Entity Component System)
- **Rendering**: HTML5 Canvas 2D via external `@serbanghita-gamedev/renderer`
- **Testing**: Vitest (not yet implemented)

## External Dependencies (GitHub packages)

```
@serbanghita-gamedev/ecs       - ECS framework (World, Entity, Component, System, Query)
@serbanghita-gamedev/geometry  - Geometry primitives (Point, Rectangle, Circle)
@serbanghita-gamedev/quadtree  - Spatial partitioning (installed, not yet used)
@serbanghita-gamedev/renderer  - Canvas 2D wrapper (NOT in package.json yet)
```

### About the Renderer Package

The `@serbanghita-gamedev/renderer` package is a Canvas 2D abstraction providing drawing primitives:
- `rectangle(ctx, x, y, width, height, options)` - Draw rectangles
- `circle(ctx, x, y, radius, options)` - Draw circles
- `dot(ctx, x, y, options)` - Draw points
- `dashedLine(ctx, x1, y1, x2, y2, options)` - Draw dashed lines
- `text(ctx, text, x, y, options)` - Draw text
- `image(ctx, img, x, y, options)` - Draw images

Options typically include: `strokeStyle`, `fillStyle`, `lineWidth`

## Directory Structure

```
src/
├── index.ts                    # Entry point, creates world, entities, systems
├── render.ts                   # Canvas setup & mouse event bindings
├── component/                  # Data containers (no logic)
│   ├── RectangleComponent.ts   # Shape geometry (x, y, width, height)
│   ├── MouseComponent.ts       # Cursor position tracking
│   ├── SelectionRectangleComponent.ts  # Selected entities collection
│   ├── IsRendered.ts           # Tag: entity should be rendered
│   ├── IsMouseOver.ts          # Tag: mouse is hovering
│   ├── IsMousePressed.ts       # Tag: mouse button is down
│   └── IsSelected.ts           # Tag: entity is selected (unused)
└── system/                     # Logic processors
    ├── RenderSystem.ts         # Draws all shapes to canvas
    ├── MouseOverSystem.ts      # Detects hover enter
    ├── MouseOutSystem.ts       # Detects hover exit
    ├── MousePressSystem.ts     # Handles click selection
    ├── SelectionSystem.ts      # Updates selection bounding box
    └── RenderSelectionSystem.ts # Selection UI (disabled)

dist/
├── index.html                  # Entry HTML
└── demo.js                     # Bundled output
```

## ECS Architecture

### Core Concepts

- **Entity**: Unique ID container that holds components (e.g., `cursor`, `selection`, `shape1`)
- **Component**: Pure data class, no behavior (e.g., `RectangleComponent`)
- **System**: Logic that operates on entities matching a Query pattern
- **Query**: Filter defining which entities a system processes

### Fixed Entities

| Entity | Components | Purpose |
|--------|------------|---------|
| `cursor` | MouseComponent | Tracks mouse position |
| `selection` | SelectionRectangleComponent | Manages selected entities |

### Component Patterns

```typescript
// Data component with properties
class RectangleComponent extends Component {
  properties: { x, y, width, height }
  rectangle: Rectangle  // from geometry lib
}

// Tag component (marker, no data)
class IsMouseOver extends Component {}
```

### System Execution Order

1. **MouseOverSystem** - Add IsMouseOver to hovered entities
2. **MouseOutSystem** - Remove IsMouseOver when mouse leaves
3. **MousePressSystem** - Add clicked entity to selection
4. **SelectionSystem** - Update selection bounding rectangle
5. **RenderSystem** - Clear canvas, draw all shapes with state-based styling

### Query Examples

```typescript
// All rectangles for rendering
query.all(RectangleComponent)

// Rectangles that can be selected (exclude selection entity itself)
query.all(RectangleComponent).none(SelectionRectangleComponent)

// Rectangles not currently hovered (for hover detection)
query.all(RectangleComponent).none(IsMouseOver)

// Currently hovered rectangles (for hover exit)
query.all(RectangleComponent, IsMouseOver)
```

## Input Handling

Mouse events bound in `render.ts`:

```typescript
mousePress(fn)    // Canvas mousedown
mouseRelease(fn)  // Container mouseup
mouseMove(fn)     // Canvas mousemove
```

Input flow:
1. `mouseMove` → Updates `MouseComponent.point` on cursor entity
2. `mousePress` → Adds `IsMousePressed` to cursor entity
3. `mouseRelease` → Removes `IsMousePressed` from cursor entity

Systems react to these state changes each frame.

## Build Commands

```bash
npm run build    # Bundle to dist/demo.js
npm run dev      # Watch mode with local server
```

## Code Conventions

1. **Components**: Extend `Component`, store init data in `properties` field
2. **Systems**: Extend `System`, implement `update(now: number)` method
3. **Entity access**: Use `world.getEntity('name')` for fixed entities
4. **Component access**: Use `entity.getComponent(ComponentClass)`
5. **Tag components**: Empty classes used as boolean flags

## Current Features

- Rectangle creation and rendering
- Mouse hover detection with visual feedback (gray highlight)
- Click-to-select with selection rectangle (blue stroke)
- Center point markers on shapes

## TODO / Incomplete

- Drag to move shapes (code commented out)
- Resize handles and cursor feedback (partially implemented)
- Multi-entity selection (only first entity shown)
- SHIFT+click for additive selection
- Quadtree optimization for collision detection
- Additional shapes: circle, oval, square
- Line connections between shapes
- Text editing
- localStorage save/load

## Performance Notes

All collision checks currently use O(n) point-in-rectangle tests per frame. The quadtree package is installed for future optimization but not yet integrated.
