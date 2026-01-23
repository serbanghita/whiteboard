# Refactor Whiteboard

This plan describes the steps on how to refactor the whiteboard in order to render
three main primitives: rectangle, circle and line with the ability to link between these shapes
using lines.

## Terms clarification

- canvas - the are where the user can draw shapes
- tool - the state of the current tool the user is using to draw on canvas.
- drawing mode - when the user has a selected tool like (rectangle, circle or line) and presses the mouse against the canvas.
- draw begin - Only available in drawing mode. A state property which signifies that the drawing has been initiated.
- draw end - Only available in drawing mode. A state property which signifies that the drawing has finished.
- select mode - when the user has selected the cursor pictogram model from the "Floating menu"

## Whiteboard layout

Layout is composed of a canvas that expands on all screen on vertical and horizontal.
On the left, there is a floating menu that is fixed, that contains 4 buttons with
4 shapes:

- cursor
- rectangle
- circle
- line

When one of these buttons is pressed, a state variable called `tool` changes to 
- select mode - when the "cursor" button is pressed
- draw mode, rectangle mode - when the "rectangle" button is pressed
- draw mode, circle mode - when the "circle" button is pressed 
- draw mode, line mode - when the "line" button is pressed.

This means that the tool has entered that particular mode. The individual modes are mutually exclusive.

## Floating menu

Always above the canvas and with a fixed position on the left middle.
Only one button can be pressed at a time.
When one button is pressed, there should be a visible cue that the button is selected.
Buttons icons source are SVG inline.
Buttons dimensions are 40x40 pixels
Floating menu has background white and rounded corners and a slight shadow oriented bottom right.


Menu structure: 
```html
<!-- Suggested structure -->
<div class="floating-menu">
  <button data-tool="cursor" class="active">cursor icon</button>
  <button data-tool="rectangle">rectangle icon</button>
  <button data-tool="circle">circle icon</button>
  <button data-tool="line">line icon</button>
</div>
```

The buttons are vertically displayed.

Event binding approach: ECS-based
Add implementation detail:
```typescript
// In render.ts or new menu.ts:
document.querySelector('.floating-menu').addEventListener('click', (e) => {
    const button = e.target.closest('[data-tool]');
    if (button) {
        const tool = button.dataset.tool;
        // ...
    }
});
```

## Cursor button

When the button is pressed the tool sets to "select" mode.
When an Entity is selected, that entity gains "IsSelected" component.
When the user presses on the blank canvas, away from any shapes, the previously entities that had "IsSelected" components have those removed.

## Rectangle button

When the button is pressed, the tool sets to "rectangle" mode.

When the user presses the mouse on the canvas in "rectangle" mode and starts dragging it, 
it draws a rectangle that starts from the initial mouse click
coordinates (x1,y1), which represent the upper left corner of the rectangle that is being drawn, until the last mouse position
over the canvas (x2, y2), which represents the bottom right corner of the rectangle, finishing the drawing mode when the user releases the mouse.

Rectangle mode state machine:
IDLE -> (click) -> FIRST_POINT_SET -> (drag=preview, release=finalize) -> IDLE

This will create a new entity with the RectangleComponent attached to it.

## Circle button

When the button is pressed, the tool sets to "circle" mode.

When the user presses the mouse on the canvas in "circle" mode, a circle is drawn with the radius equally to the half distance between the initial
mouse click (x1, y1) and the last mouse position (x2, y2). The draw mode is finished when the user releases the mouse.
Note that the drawing procedure is similar to the "rectangle" with the center of the circle being at the half distance between x1,y1 and x2,y2.

The circle fits in the bounding rectangle that has left upper corner in x1,y1 and bottom right corner at x2,y2.

Circle mode state machine:
IDLE -> (click) -> FIRST_POINT_SET -> (drag=preview, release=finalize) -> IDLE

This will create a new entity with the CircleComponent attached to it.

## Line button

When the button is pressed, the tool sets to "line" mode.

When the user presses the mouse on the canvas in "line" mode, a line is drawn from the initial mouse click (x1,y1) to the last mouse position (x2,y2).
Even if the mouse is released in "line" mode, until the second click occurs, the line is still being drawn to the last mouse position.
When the user click second time that is the last position of (x2,y2).

Line mode state machine:
IDLE -> (click) -> FIRST_POINT_SET -> (move=preview, click=finalize) -> IDLE

This will create a new entity with the LineComponent attached to it.

## Keeping state

When the user initiates drawing of an entity (rectangle, circle, line), the state property "draw begin" is set to true.
This means that the entity and it's component(s) are temporary until commited by the "draw end" state being set to true.

An item in the state is an object representing the Entity and it's Components

## Keeping state - Entity item

```json
{
  "entity": {
    "id": "circle-123"
  },
  "components": {
    "CircleComponent": {
      "x": 100,
      "y": 200,
      "radius": 20,
      "strokeColor": "red",
      "fillColor": null
    },
    "DrawnOnLayer": {
      "id": "layer-123"
    }
  }
} 
```

- DrawnOnLayer.id references a Layer entity's id
- Layer component is attached to "layer" entities
- Shapes have DrawnOnLayer, layers have Layer


## ECS Components

Components must be simple data containers.

Refactor the components from `src/components`:

RectangleComponent (x1, y1, width, height, fillColor, strokeColor, strokeWidth)
CircleComponent (x, y, radius, fillColor, strokeColor, strokeWidth)
LineComponent (x1, y1, x2, y2, strokeColor, strokeWidth)

Whenever an Entity is selected, add the component IsSelected to it.

## ECS Systems

Systems to add or modify:

1. **ToolStateSystem** - Manages global tool mode state
2. **RectangleDrawSystem** - Handles rectangle-specific drawing
3. **CircleDrawSystem** - Handles circle-specific drawing
4. **LineDrawSystem** - Handles line-specific two-click drawing
5. **Modified: RenderSystem** - Support new CircleComponent, LineComponent
6. **Modified: SelectionSystem** - Handle new shape types

New components must be registered:
```typescript
world.registerComponents([
  // Existing
  IsRendered, IsMouseOver, IsMousePressed, MouseComponent,
  RectangleComponent, SelectionRectangleComponent,
  // New
  CircleComponent, LineComponent, IsSelected,
  ToolStateComponent, DrawnOnLayer, Layer
]);
```

## ToolStateComponent 

```typescript
class ToolStateComponent extends Component {
  properties: {
    currentTool: 'cursor' | 'rectangle' | 'circle' | 'line',
    drawState: 'IDLE' | 'FIRST_POINT_SET',
    startX?: number,
    startY?: number,
    previewEntityId?: string
  }
}
// Attached to singleton "tool" entity
```

Default initialization:
- currentTool: 'cursor'  // Start in select mode
- drawState: 'IDLE'
- startX: undefined
- startY: undefined
- previewEntityId: undefined

## DrawnOnLayer component

A new component that has the following property:
- `id` (string)

## Layer component

A new component that has the following properties:

- "id": "layer-123"
- "zIndex": 0
- "visible": true

This is attached to "layer" entities.
At some point we will have a LayerSystem but this is out of scope for this plan.

## Geometry

The logic behind having Geometry objects was that the x,y values can be passed
by reference and then it's easy to check if two lines, circles or rectangles 
intersect. But I am starting to believe that this is not needed and then
only thing that I need is basic independent intersect methods that I can use in a specialized System.

Move intersection to standalone functions
- Create src/collision.ts with:
    - pointInRectangle(px, py, rx, ry, rw, rh)
    - pointInCircle(px, py, cx, cy, radius)
    - pointOnLine(px, py, x1, y1, x2, y2, tolerance)
- Remove geometry classes
- Update all component references

Migration steps for geometry removal:
1. Create src/collision.ts with standalone functions
2. Update RectangleComponent to remove Rectangle dependency
3. Update MouseComponent to store x,y directly instead of Point
4. Update all Systems to use collision.ts functions
5. Delete src/geometry/ folder
6. Run tests to verify no regressions

## RenderingSystem updates

All "rectangle", "circle" and "line" entities have the component "IsRendered" by default.
The RenderingSystem renders all that has "IsRendered" and then detects each individual entities if they have "RectangleComponent" or "CircleComponent" or "LineComponent" attached in order to render them accordingly.

## Implementations details

Discard or refactor existing components and geometry classes.

## Edge Cases

- if user draws a zero-width rectangle (click without drag), cancel the drawing and the entity is being destroyed.
- if user cancels drawing mid-action (Escape key), cancel the drawing and the entity is being destroyed. new KeyboardInputSystem
- if draw area is outside canvas bounds, cancel the drawing and the entity is being destroyed.
- handle overlapping shapes during selection - at the moment select the first shape. We will handle multiple form selection in the next plan.
- Minimum rectangle size: 5x5 pixels
- Minimum circle radius: 3 pixels
- Minimum line length: 5 pixels
- Shapes below threshold: cancel drawing, destroy entity