# Refactor Renderer to Use WebGL Primitives

The whiteboard used to have a rendering library being referenced as a local package.
I want to transition to a rendering library that uses WebGL primitives.
The library has to be able to work with the ECS system.

Keep the Canvas rendering with WebGL logic totally separate from the ECS system.
If I want to refactor the renderer to render the primitives with let's say Canvas 2d, I should
be able to do that without affecting the ECS system. It should be a swap without any code changes.

## Refactor the renderer

### Renderer Abstraction Layer
To enable swappable renderers (WebGL ↔ Canvas2D):

1. Define `IRenderer` interface:
    - clear(): void
    - rectangle(x, y, w, h, options): void
    - circle(cx, cy, r, options): void
    - line(x1, y1, x2, y2, options): void
    - text(str, x, y, options): void
    - dot(x, y, options): void

2. Implement `WebGLRenderer` and optionally `Canvas2DRenderer`

3. RenderSystem receives `IRenderer` instead of context directly

4. Renderer instantiation in index.ts or render.ts (factory/DI)

### WebGL Context Setup
- Replace `getContext("2d")` with `getContext("webgl")` in render.ts
- Create WebGL initialization function with proper error handling
- Replace clearCanvas() implementation with gl.clear(gl.COLOR_BUFFER_BIT)
- Update RenderSystem constructor to accept WebGLRenderingContext
- Add fallback message if WebGL is not supported

### Shader Programs
- Define vertex shader for position transformation
- Define fragment shaders for each primitive type (or unified shader with uniforms)
- Shaders will be stored (inline strings, separate .glsl files) in the `shaders` folder.

### Primitive Implementation
For each primitive, specify:
- circle: How to approximate with triangles (triangle fan) or use SDF in fragment shader
- rectangle: Two triangles or indexed quad
- line: Line primitives or thick lines via triangles
- text: Canvas 2D texture atlas approach OR external library (e.g., msdf-bmfont)
- dot: render as small filled circle (radius 2-3px)

### Migration Strategy
- New package will be inline code in the renderer folder.
- remove traces of @serbanghita-gamedev/renderer dependency
- full replacement

### Buffer Management
- Create WebGLBuffer wrapper class for vertex data
- Define buffer strategy: one buffer per shape vs batched buffer
- For dynamic shapes (move/resize): use gl.DYNAMIC_DRAW
- For static shapes: use gl.STATIC_DRAW
- Implement buffer update methods for entity modifications

### Text Rendering

MSDF Library:
- Add msdf-bmfont-xml dependency
- Pre-generate font atlas at build time
- Shader-based text rendering with SDF


## New components

### Relationship to existing components
- RectangleComponent replace
- Copy @serbanghita-gamedev/geometry classes to local project. Remove dependency on @serbanghita-gamedev/geometry.

### Component Properties
Each component should define full properties:

- CircleComponent { x, y, radius, fillColor?, strokeColor?, strokeWidth? }
- RectangleComponent { x, y, width, height, fillColor?, strokeColor?, strokeWidth? }
- TextComponent { x, y, text, fontSize, fontFamily, color }
- LineComponent { x1, y1, x2, y2, color, width }

Note: x,y represents center point for Circle and Rectangle.

### Migration of existing shapes
- shape1 and shape2 in index.ts:71-77 use new RectangleComponent
- Existing entities cand be kept if they are useful.


### Geometry Classes to Copy
From @serbanghita-gamedev/geometry, copy to src/geometry/:
- Point { x, y } - used by MouseComponent, RectangleComponent
- Rectangle { width, height, center: Point } - used throughout.
- Circle { radius, center: Point } - used in index.ts

Files requiring import path updates (7 total):
- src/component/RectangleComponent.ts
- src/component/MouseComponent.ts
- src/system/SelectionSystem.ts
- src/system/MouseOverSystem.ts
- src/system/MouseOutSystem.ts
- src/render.ts
- src/index.ts


### RectangleComponent Properties
Current: { x, y, width, height } where x,y is center
New: { x, y, width, height, fillColor?, strokeColor?, strokeWidth? }
Note: Keep x,y naming for minimal migration. x,y represents center point.


## Execution Order
1. Copy geometry classes to src/geometry/
2. Update imports in 7 affected files
3. Create WebGL context in render.ts
4. Create shader folder with basic vertex/fragment shaders
5. Implement rectangle primitive (test with shape1/shape2)
6. Implement remaining primitives (circle, line, dot, text)
7. Update RenderSystem to use WebGL
8. Add style properties to components
9. Remove @serbanghita-gamedev/renderer dependency
10. Remove @serbanghita-gamedev/geometry dependency from package.json
