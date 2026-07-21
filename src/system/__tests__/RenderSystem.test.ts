import { describe, it, expect, beforeEach, vi } from 'vitest';
import { World, Entity } from '@serbanghita-gamedev/ecs';
import RenderSystem from '../RenderSystem';
import RectangleComponent from '../../component/RectangleComponent';
import CircleComponent from '../../component/CircleComponent';
import LineComponent from '../../component/LineComponent';
import IsRendered from '../../component/IsRendered';
import IsMouseOver from '../../component/IsMouseOver';
import SelectionRectangleComponent from '../../component/SelectionRectangleComponent';
import TextComponent from '../../component/TextComponent';
import { IRenderer } from '../../renderer';

/**
 * Unit tests for the real RenderSystem against a real World and a mock
 * renderer. Verifies:
 * - clear() is called each update
 * - shapes render plainly (no center dots, no hover visuals)
 * - the selection overlay: tight blue bounding box + gray ring corner handles,
 *   endpoint handles for a single selected line
 */

type RecordedCall = { method: string; args: unknown[] };

function createMockRenderer(): IRenderer & { _calls: RecordedCall[] } {
  const calls: RecordedCall[] = [];

  return {
    _calls: calls,
    setResolution: vi.fn((width, height) => calls.push({ method: 'setResolution', args: [width, height] })),
    setCamera: vi.fn((scale, x, y) => calls.push({ method: 'setCamera', args: [scale, x, y] })),
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
    triangle: vi.fn((x1, y1, x2, y2, x3, y3, options) =>
      calls.push({ method: 'triangle', args: [x1, y1, x2, y2, x3, y3, options] })
    ),
    dot: vi.fn((x, y, options) =>
      calls.push({ method: 'dot', args: [x, y, options] })
    ),
    maxTextureSize: vi.fn(() => 4096),
    createTextureFromCanvas: vi.fn((source) => {
      const handle = { _texture: true };
      calls.push({ method: 'createTextureFromCanvas', args: [source] });
      return handle;
    }),
    deleteTexture: vi.fn((handle) => calls.push({ method: 'deleteTexture', args: [handle] })),
    texturedQuad: vi.fn((handle, x, y, width, height) =>
      calls.push({ method: 'texturedQuad', args: [handle, x, y, width, height] })
    ),
  };
}

const SELECTION_STROKE_COLOR = "rgb(66 133 244)";
const HANDLE_OPTIONS = { fillColor: "white", strokeColor: "rgb(170 170 170)", strokeWidth: 3 };

// The ComponentRegistry is a process-wide singleton - register once.
const registryWorld = new World();
registryWorld.registerComponents([
  IsRendered,
  IsMouseOver,
  RectangleComponent,
  CircleComponent,
  LineComponent,
  SelectionRectangleComponent,
  TextComponent,
]);

describe('RenderSystem', () => {
  let world: World;
  let renderer: ReturnType<typeof createMockRenderer>;
  let system: RenderSystem;
  let selectionEntity: Entity;

  function calls(method: string): RecordedCall[] {
    return renderer._calls.filter((c) => c.method === method);
  }

  // Handle calls are circle() calls with the handle options.
  function handleCalls(): RecordedCall[] {
    return calls('circle').filter((c) => JSON.stringify(c.args[3]) === JSON.stringify(HANDLE_OPTIONS));
  }

  beforeEach(() => {
    world = new World();
    renderer = createMockRenderer();
    const query = world.createQuery('renderables', { all: [IsRendered] });
    system = world.createSystem(RenderSystem, query, renderer);
    selectionEntity = world.createEntity('selection');
    selectionEntity.addComponent(SelectionRectangleComponent);
  });

  function addShape(id: string, componentClass: any, props: object): Entity {
    const entity = world.createEntity(id);
    entity.addComponent(componentClass, props);
    entity.addComponent(IsRendered);
    return entity;
  }

  it('calls renderer.clear() on update', () => {
    system.update(0);
    expect(renderer.clear).toHaveBeenCalledTimes(1);
  });

  it('renders nothing but clear() for an empty world', () => {
    system.update(0);
    expect(renderer._calls).toEqual([{ method: 'clear', args: [] }]);
  });

  it('draws rectangles plainly, without center dots', () => {
    addShape('r1', RectangleComponent, { x: 75, y: 85, width: 50, height: 30 });
    system.update(0);

    expect(calls('rectangle')).toEqual([
      { method: 'rectangle', args: [75, 85, 50, 30, { strokeColor: 'black', fillColor: undefined }] },
    ]);
    expect(calls('dot')).toHaveLength(0);
  });

  it('draws circles and lines', () => {
    addShape('c1', CircleComponent, { x: 100, y: 100, radius: 40 });
    addShape('l1', LineComponent, { x1: 10, y1: 20, x2: 60, y2: 80 });
    system.update(0);

    expect(calls('circle')).toEqual([
      { method: 'circle', args: [100, 100, 40, { strokeColor: 'black', fillColor: undefined }] },
    ]);
    expect(calls('line')).toEqual([
      { method: 'line', args: [10, 20, 60, 80, { strokeColor: 'black', strokeWidth: undefined }] },
    ]);
  });

  it('draws no arrowheads when arrow fields are unset', () => {
    addShape('l1', LineComponent, { x1: 10, y1: 20, x2: 60, y2: 80 });
    system.update(0);

    expect(calls('triangle')).toHaveLength(0);
  });

  it('draws an arrowhead triangle at the end point, after the line, in the stroke color', () => {
    addShape('l1', LineComponent, { x1: 0, y1: 0, x2: 100, y2: 0, strokeColor: '#e53935', arrowEnd: 'arrow' });
    system.update(0);

    const triangles = calls('triangle');
    expect(triangles).toHaveLength(1);
    // Tip at (x2, y2); base 12 world units back along the line; half-width 5.
    expect(triangles[0].args).toEqual([100, 0, 88, 5, 88, -5, { fillColor: '#e53935' }]);
    // The head caps the line: drawn after it.
    const lineIndex = renderer._calls.findIndex((c) => c.method === 'line');
    const triangleIndex = renderer._calls.findIndex((c) => c.method === 'triangle');
    expect(triangleIndex).toBeGreaterThan(lineIndex);
  });

  it('draws an arrowhead at the start point when arrowStart is set', () => {
    addShape('l1', LineComponent, { x1: 0, y1: 0, x2: 100, y2: 0, arrowStart: 'arrow' });
    system.update(0);

    const triangles = calls('triangle');
    expect(triangles).toHaveLength(1);
    // Tip at (x1, y1), pointing away from (x2, y2).
    expect(triangles[0].args).toEqual([0, 0, 12, -5, 12, 5, { fillColor: 'black' }]);
  });

  it('draws both arrowheads when both ends are set', () => {
    addShape('l1', LineComponent, { x1: 0, y1: 0, x2: 100, y2: 0, arrowStart: 'arrow', arrowEnd: 'arrow' });
    system.update(0);

    expect(calls('triangle')).toHaveLength(2);
  });

  it('clamps the arrowhead to half the line length on short lines', () => {
    addShape('l1', LineComponent, { x1: 0, y1: 0, x2: 10, y2: 0, arrowEnd: 'arrow' });
    system.update(0);

    const triangles = calls('triangle');
    expect(triangles).toHaveLength(1);
    // effLen = min(12, 10/2) = 5; half-width scales to 5 * 5/12.
    const hw = 5 * 5 / 12;
    expect(triangles[0].args).toEqual([10, 0, 5, hw, 5, -hw, { fillColor: 'black' }]);
  });

  it('hovering draws nothing extra for an unselected shape', () => {
    const entity = addShape('r1', RectangleComponent, { x: 75, y: 85, width: 50, height: 30 });
    entity.addComponent(IsMouseOver);
    system.update(0);

    expect(calls('rectangle')).toHaveLength(1);
    expect(calls('circle')).toHaveLength(0);
    expect(calls('dot')).toHaveLength(0);
  });

  it('draws the selection overlay: tight blue box + four corner handles', () => {
    const entity = addShape('r1', RectangleComponent, { x: 75, y: 85, width: 50, height: 30 });
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    selectionComp.addEntity(entity);
    // SelectionSystem maintains the bounds; simulate its output (tight box).
    selectionEntity.addComponent(RectangleComponent, { x: 75, y: 85, width: 50, height: 30 });

    system.update(0);

    // Shape rectangle + selection box rectangle.
    const rectCalls = calls('rectangle');
    expect(rectCalls).toHaveLength(2);
    expect(rectCalls[1].args).toEqual([75, 85, 50, 30, { strokeColor: SELECTION_STROKE_COLOR, strokeWidth: 1 }]);

    // Four corner handles: gray rings with white fill.
    const handles = handleCalls();
    expect(handles.map((c) => [c.args[0], c.args[1]])).toEqual([
      [75, 85],
      [125, 85],
      [75, 115],
      [125, 115],
    ]);
  });

  it('draws the selection box around a selected circle at its bounding box', () => {
    const entity = addShape('c1', CircleComponent, { x: 100, y: 100, radius: 40 });
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    selectionComp.addEntity(entity);
    selectionEntity.addComponent(RectangleComponent, { x: 60, y: 60, width: 80, height: 80 });

    system.update(0);

    const rectCalls = calls('rectangle');
    expect(rectCalls).toHaveLength(1);
    expect(rectCalls[0].args).toEqual([60, 60, 80, 80, { strokeColor: SELECTION_STROKE_COLOR, strokeWidth: 1 }]);
    expect(handleCalls()).toHaveLength(4);
  });

  it('draws endpoint handles instead of a box for a single selected line', () => {
    const entity = addShape('l1', LineComponent, { x1: 10, y1: 20, x2: 60, y2: 80 });
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
    selectionComp.addEntity(entity);
    selectionEntity.addComponent(RectangleComponent, { x: 10, y: 20, width: 50, height: 60 });

    system.update(0);

    // Only the line itself - no selection rectangle.
    expect(calls('rectangle')).toHaveLength(0);
    const handles = handleCalls();
    expect(handles.map((c) => [c.args[0], c.args[1]])).toEqual([
      [10, 20],
      [60, 80],
    ]);
  });

  it('draws no overlay when nothing is selected', () => {
    addShape('r1', RectangleComponent, { x: 75, y: 85, width: 50, height: 30 });
    system.update(0);

    expect(calls('rectangle')).toHaveLength(1);
    expect(handleCalls()).toHaveLength(0);
  });
});
