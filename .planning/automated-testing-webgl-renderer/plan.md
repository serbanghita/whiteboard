# Automated Testing for WebGL Renderer

Add comprehensive unit and integration tests for the new WebGL renderer implementation using Vitest.
The tests should verify rendering primitives, geometry classes, and color parsing without requiring a browser.

## Test Infrastructure Setup

### Configure Vitest for WebGL Testing
- Update vitest.config.ts to support WebGL mocking
- Add jsdom or happy-dom environment for DOM simulation
- Create WebGL context mock for headless testing
- Configure test coverage thresholds

### Mock WebGL Context
Create a mock WebGLRenderingContext that:
- Tracks method calls (clear, bindBuffer, drawArrays, etc.)
- Stores uniform values for verification
- Does not require actual GPU/browser

## Unit Tests: Geometry Classes

### Point Tests (src/geometry/Point.ts)
- Constructor sets x, y correctly
- Properties are mutable

### Rectangle Tests (src/geometry/Rectangle.ts)
- Constructor creates rectangle with center point
- topLeftX/Y computed correctly from center
- topRightX/Y, bottomLeftX/Y, bottomRightY computed correctly
- width/height are mutable
- intersectsWithPoint returns true for point inside
- intersectsWithPoint returns false for point outside
- intersectsWithPoint handles edge cases (on boundary)
- moveCenterBy updates center correctly

### Circle Tests (src/geometry/Circle.ts)
- Constructor creates circle with center and radius
- intersectsWithPoint returns true for point inside
- intersectsWithPoint returns false for point outside
- intersectsWithPoint handles edge (exactly on radius)

## Unit Tests: Renderer

### Color Parsing Tests (WebGLRenderer.parseColor)
- Parses named colors: black, white, red, green, blue, gray
- Parses 3-digit hex: #fff, #000, #abc
- Parses 6-digit hex: #ffffff, #000000, #aabbcc
- Parses rgb(): rgb(255, 0, 0), rgb(255,255,255)
- Parses rgba(): rgba(255, 0, 0, 0.5)
- Parses space-separated rgb: rgb(204 204 204)
- Unknown color defaults to black with warning

### ShaderProgram Tests (src/renderer/shaders/ShaderProgram.ts)
- Compiles vertex shader successfully
- Compiles fragment shader successfully
- Links program successfully
- getAttributeLocation returns valid location
- getUniformLocation returns valid location
- setUniform2f calls gl.uniform2f correctly
- setUniform4f calls gl.uniform4f correctly

### WebGLRenderer Tests (src/renderer/WebGLRenderer.ts)
- Constructor initializes shader program
- Constructor creates position buffer
- clear() calls gl.clear with COLOR_BUFFER_BIT
- rectangle() generates correct triangle vertices
- rectangle() sets correct color uniform
- circle() generates triangle fan vertices
- line() generates quad vertices for thick line
- dot() delegates to circle with small radius

## Integration Tests: RenderSystem

### RenderSystem with Mock Renderer
- Calls renderer.clear() on update
- Draws rectangles for entities with RectangleComponent
- Draws selection rectangle in blue for SelectionRectangleComponent
- Draws hover highlight when entity has IsMouseOver
- Draws center dots on shapes

## Test File Structure

```
src/
├── geometry/
│   └── __tests__/
│       ├── Point.test.ts
│       ├── Rectangle.test.ts
│       └── Circle.test.ts
├── renderer/
│   └── __tests__/
│       ├── WebGLRenderer.test.ts
│       ├── colorParsing.test.ts
│       └── ShaderProgram.test.ts
└── system/
    └── __tests__/
        └── RenderSystem.test.ts
```

## Execution Order

1. Create vitest.config.ts with jsdom environment
2. Create WebGL mock helper (src/__mocks__/webgl.ts)
3. Create geometry unit tests
4. Create color parsing tests
5. Create ShaderProgram tests
6. Create WebGLRenderer tests
7. Create RenderSystem integration tests
8. Run tests and verify all pass
9. Add test script to package.json if not present
