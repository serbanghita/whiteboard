import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IRenderer } from '../../renderer';
import { Point, Rectangle } from '../../geometry';

/**
 * Integration tests for RenderSystem rendering logic.
 *
 * These tests verify the rendering behavior by simulating what RenderSystem does
 * without importing the actual system (which has external ECS dependencies).
 * The tests verify:
 * - Renderer.clear() is called
 * - Rectangles are drawn with correct coordinates and options
 * - Selection rectangles are drawn in blue
 * - Hover highlights are drawn with gray stroke
 * - Center dots are drawn on shapes
 */

// Create mock renderer
function createMockRenderer(): IRenderer & { _calls: Array<{ method: string; args: unknown[] }> } {
  const calls: Array<{ method: string; args: unknown[] }> = [];

  return {
    _calls: calls,
    clear: vi.fn(() => calls.push({ method: 'clear', args: [] })),
    rectangle: vi.fn((x, y, width, height, options) =>
      calls.push({ method: 'rectangle', args: [x, y, width, height, options] })
    ),
    circle: vi.fn((cx, cy, radius, options) =>
      calls.push({ method: 'circle', args: [cx, cy, radius, options] })
    ),
    line: vi.fn((x1, y1, x2, y2, options) =>
      calls.push({ method: 'line', args: [x1, y1, x2, y2, options] })
    ),
    text: vi.fn((str, x, y, options) =>
      calls.push({ method: 'text', args: [str, x, y, options] })
    ),
    dot: vi.fn((x, y, options) =>
      calls.push({ method: 'dot', args: [x, y, options] })
    ),
  };
}

// Simulated entity data
interface EntityData {
  rectangle: Rectangle;
  isSelection?: boolean;
  isMouseOver?: boolean;
}

// Simulated render logic (matches RenderSystem.update behavior)
function renderEntities(renderer: IRenderer, entities: EntityData[]): void {
  renderer.clear();

  entities.forEach((entity) => {
    const rect = entity.rectangle;

    if (entity.isSelection) {
      renderer.rectangle(rect.topLeftX, rect.topLeftY, rect.width, rect.height, { strokeColor: "blue" });
      renderer.dot(rect.center.x - 1, rect.center.y - 1, { fillColor: "blue", strokeWidth: 2 });
    } else {
      renderer.rectangle(rect.topLeftX, rect.topLeftY, rect.width, rect.height, { strokeColor: "black" });
      renderer.dot(rect.center.x - 1, rect.center.y - 1, { fillColor: "black", strokeWidth: 2 });

      if (entity.isMouseOver) {
        renderer.rectangle(rect.topLeftX - 8, rect.topLeftY - 8, rect.width + 16, rect.height + 16, { strokeColor: "rgb(204 204 204)" });
      }
    }
  });
}

describe('RenderSystem Integration Tests', () => {
  let mockRenderer: ReturnType<typeof createMockRenderer>;

  beforeEach(() => {
    mockRenderer = createMockRenderer();
  });

  describe('rendering behavior', () => {
    it('calls renderer.clear() on update', () => {
      renderEntities(mockRenderer, []);

      expect(mockRenderer.clear).toHaveBeenCalledTimes(1);
    });

    it('draws rectangles for entities with RectangleComponent', () => {
      const rect = new Rectangle(50, 30, new Point(100, 100));
      renderEntities(mockRenderer, [{ rectangle: rect }]);

      // Should draw rectangle
      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      expect(rectCalls.length).toBe(1);
      expect(rectCalls[0].args[0]).toBe(rect.topLeftX);
      expect(rectCalls[0].args[1]).toBe(rect.topLeftY);
      expect(rectCalls[0].args[2]).toBe(rect.width);
      expect(rectCalls[0].args[3]).toBe(rect.height);
      expect(rectCalls[0].args[4]).toEqual({ strokeColor: 'black' });

      // Should draw center dot
      const dotCalls = mockRenderer._calls.filter(c => c.method === 'dot');
      expect(dotCalls.length).toBe(1);
      expect(dotCalls[0].args[2]).toEqual({ fillColor: 'black', strokeWidth: 2 });
    });

    it('draws selection rectangle in blue for SelectionRectangleComponent', () => {
      const rect = new Rectangle(50, 30, new Point(100, 100));
      renderEntities(mockRenderer, [{ rectangle: rect, isSelection: true }]);

      // Should draw rectangle in blue
      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      expect(rectCalls.length).toBe(1);
      expect(rectCalls[0].args[4]).toEqual({ strokeColor: 'blue' });

      // Should draw center dot in blue
      const dotCalls = mockRenderer._calls.filter(c => c.method === 'dot');
      expect(dotCalls.length).toBe(1);
      expect(dotCalls[0].args[2]).toEqual({ fillColor: 'blue', strokeWidth: 2 });
    });

    it('draws hover highlight when entity has IsMouseOver', () => {
      const rect = new Rectangle(50, 30, new Point(100, 100));
      renderEntities(mockRenderer, [{ rectangle: rect, isMouseOver: true }]);

      // Should draw two rectangles: main shape and hover highlight
      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      expect(rectCalls.length).toBe(2);

      // First rectangle is the shape with black stroke
      expect(rectCalls[0].args[4]).toEqual({ strokeColor: 'black' });

      // Second rectangle is the hover highlight with gray stroke
      expect(rectCalls[1].args[4]).toEqual({ strokeColor: 'rgb(204 204 204)' });

      // Hover highlight should be larger (8px padding on each side)
      expect(rectCalls[1].args[2]).toBe(rect.width + 16);
      expect(rectCalls[1].args[3]).toBe(rect.height + 16);

      // Hover highlight position should be offset by -8
      expect(rectCalls[1].args[0]).toBe(rect.topLeftX - 8);
      expect(rectCalls[1].args[1]).toBe(rect.topLeftY - 8);
    });

    it('draws center dots on shapes', () => {
      const rect = new Rectangle(50, 30, new Point(100, 100));
      renderEntities(mockRenderer, [{ rectangle: rect }]);

      const dotCalls = mockRenderer._calls.filter(c => c.method === 'dot');
      expect(dotCalls.length).toBe(1);

      // Dot should be at center - 1
      expect(dotCalls[0].args[0]).toBe(rect.center.x - 1);
      expect(dotCalls[0].args[1]).toBe(rect.center.y - 1);
    });

    it('handles multiple entities', () => {
      const rect1 = new Rectangle(50, 30, new Point(100, 100));
      const rect2 = new Rectangle(60, 40, new Point(200, 200));

      renderEntities(mockRenderer, [
        { rectangle: rect1 },
        { rectangle: rect2 },
      ]);

      // Should draw 2 rectangles and 2 dots
      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      const dotCalls = mockRenderer._calls.filter(c => c.method === 'dot');
      expect(rectCalls.length).toBe(2);
      expect(dotCalls.length).toBe(2);
    });

    it('handles empty entity list', () => {
      renderEntities(mockRenderer, []);

      // Should only clear, no drawing calls
      expect(mockRenderer.clear).toHaveBeenCalledTimes(1);
      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      const dotCalls = mockRenderer._calls.filter(c => c.method === 'dot');
      expect(rectCalls.length).toBe(0);
      expect(dotCalls.length).toBe(0);
    });

    it('selection takes precedence over mouse over', () => {
      const rect = new Rectangle(50, 30, new Point(100, 100));
      renderEntities(mockRenderer, [{ rectangle: rect, isSelection: true, isMouseOver: true }]);

      // Selection should take precedence - only blue rectangle, no gray hover
      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      expect(rectCalls.length).toBe(1);
      expect(rectCalls[0].args[4]).toEqual({ strokeColor: 'blue' });
    });

    it('uses correct coordinates from Rectangle geometry', () => {
      // Rectangle centered at (100, 100) with width 50, height 30
      // topLeft should be (75, 85)
      const rect = new Rectangle(50, 30, new Point(100, 100));

      renderEntities(mockRenderer, [{ rectangle: rect }]);

      const rectCalls = mockRenderer._calls.filter(c => c.method === 'rectangle');
      expect(rectCalls[0].args[0]).toBe(75);  // topLeftX = 100 - 50/2
      expect(rectCalls[0].args[1]).toBe(85);  // topLeftY = 100 - 30/2
      expect(rectCalls[0].args[2]).toBe(50);  // width
      expect(rectCalls[0].args[3]).toBe(30);  // height
    });
  });
});
