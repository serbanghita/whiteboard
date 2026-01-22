# Automated Testing for WebGL Renderer
> Keywords: vitest, testing, webgl, mock, unit-tests, integration-tests, geometry, renderer
Iteration: 1

## Summary

- Plan is well-structured with clear test categories and file structure
- Vitest already installed in package.json (^2.1.1) - no need to install
- parseColor is a private method - cannot be tested directly without refactoring or workaround
- Missing jsdom/happy-dom dependency - needs to be added
- Test script in package.json needs updating (currently just echoes error)
- WebGL mock complexity underestimated - needs more detailed specification
- Good coverage of geometry classes and renderer primitives

---

## Test Infrastructure Setup - Missing jsdom Dependency

Description:
Line 10 mentions "Add jsdom or happy-dom environment for DOM simulation" but neither package is in package.json devDependencies. Vitest requires this for browser-like environment.

Suggested Solution:
Add to execution order step 1 or as a separate step:

```markdown
### Dependencies to Add
- jsdom (recommended) or happy-dom for DOM environment
- @vitest/ui (optional, for visual test runner)

Update package.json:
npm install -D jsdom
```

---

## Test Infrastructure Setup - WebGL Mock Complexity

Description:
Lines 14-18 describe a mock WebGLRenderingContext but underestimate the complexity. WebGL has ~150 methods and properties. The mock needs to:

1. Return valid mock objects from createShader, createProgram, createBuffer
2. Simulate getShaderParameter for COMPILE_STATUS
3. Simulate getProgramParameter for LINK_STATUS
4. Track all buffer/uniform operations

Suggested Solution:
Expand the mock specification or use an existing library:

```markdown
### Mock WebGL Context Options

Option A - Minimal Custom Mock:
Create src/__mocks__/webgl.ts with:
- createShader() returns mock shader object
- createProgram() returns mock program object
- createBuffer() returns mock buffer object
- getShaderParameter(shader, COMPILE_STATUS) returns true
- getProgramParameter(program, LINK_STATUS) returns true
- getAttribLocation() returns 0
- getUniformLocation() returns mock location
- All drawing methods (bindBuffer, bufferData, drawArrays) are jest.fn()

Option B - Use gl-mock library:
npm install -D gl-mock
```

---

## Unit Tests: Renderer - parseColor is Private

Description:
Lines 44-51 specify tests for "WebGLRenderer.parseColor" but this is a private method (`private parseColor(color: string)` at line 218 of WebGLRenderer.ts). Private methods cannot be accessed directly in tests.

Suggested Solution:
Three options:

```markdown
### Color Parsing Tests - Options

Option A - Test Through Public API:
Test parseColor indirectly by calling rectangle() with different color options
and verifying the uniform4f calls on the mock gl context.

Option B - Extract to Utility:
Move parseColor to a separate exported utility function:
- Create src/renderer/colorUtils.ts with parseColor function
- Import in WebGLRenderer
- Test the utility directly

Option C - Test Private via Type Casting (not recommended):
(renderer as any).parseColor(color) - fragile, breaks encapsulation
```

Recommend Option B for cleaner architecture.

---

## Unit Tests: Renderer - Missing Error Case Tests

Description:
Lines 53-60 (ShaderProgram tests) don't include error handling tests. The ShaderProgram class throws errors on compile/link failures which should be tested.

Suggested Solution:
Add error case tests:

```markdown
### ShaderProgram Tests - Add Error Cases
- Throws error when vertex shader compilation fails
- Throws error when fragment shader compilation fails
- Throws error when program linking fails
- Throws error when uniform not found (getUniformLocation)
```

---

## Test File Structure - Inconsistent Location

Description:
Lines 83-98 show test files in `__tests__` subdirectories, but this is not the only valid pattern. The plan should specify the Vitest configuration to match this pattern.

Suggested Solution:
Clarify in vitest.config.ts setup:

```typescript
// vitest.config.ts
export default defineConfig({
  test: {
    include: ['src/**/__tests__/**/*.test.ts'],
    environment: 'jsdom',
  }
})
```

---

## Execution Order - Update Test Script Missing Details

Description:
Line 109 says "Add test script to package.json if not present" but package.json already has a test script that needs to be updated (line 10: `"test": "echo \"Error: no test specified yet.\"`).

Suggested Solution:
Be specific about the update:

```markdown
9. Update test script in package.json:
   Change: "test": "echo \"Error: no test specified yet.\""
   To: "test": "vitest run"
   Add: "test:watch": "vitest"
   Add: "test:coverage": "vitest run --coverage"
```

---

## Missing: RenderSystem Integration Test Dependencies

Description:
Lines 74-79 describe RenderSystem tests but don't specify how to mock the ECS World and Query objects from `@serbanghita-gamedev/ecs`. These are external dependencies that need mocking.

Suggested Solution:
Add to Integration Tests section:

```markdown
### RenderSystem Test Setup
- Mock World with getEntity() returning mock cursor entity
- Mock Query with execute() returning array of test entities
- Create test entities with appropriate components:
  - Entity with RectangleComponent only
  - Entity with RectangleComponent + IsMouseOver
  - Entity with RectangleComponent + SelectionRectangleComponent
- Mock IRenderer to track method calls
```

---

No blocking issues. Plan is ready for execution after addressing the above refinements, or proceed with `/plan-execute` and handle these during implementation.
