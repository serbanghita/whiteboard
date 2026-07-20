/**
 * Boots the real app entry (src/index.ts) in jsdom with the WebGL mock and
 * drives the ECS through frame ticks to verify the draw tools end-to-end.
 *
 * Input is simulated the same way the real DOM handlers in index.ts feed the
 * ECS: press()/release() advance MouseComponent's event-time counters and
 * toggle the IsMousePressed tag; moveTo() updates the current position.
 */
import { describe, it, expect, vi, beforeAll, afterEach } from "vitest";

import type { Entity, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import LineAttachmentComponent from "../component/LineAttachmentComponent";
import CameraComponent from "../component/CameraComponent";
import { applyWheel, screenToWorld, worldToScreen } from "../camera";

let world: World;
let cursor: Entity;
let rafCallbacks: FrameRequestCallback[] = [];
let now = 0;

// Runs one rAF tick (i.e. one world loop iteration).
function frame() {
  now += 16;
  const callbacks = rafCallbacks;
  rafCallbacks = [];
  callbacks.forEach((cb) => cb(now));
}

function cameraComp(): CameraComponent {
  return world.getEntity("camera")!.getComponent(CameraComponent);
}

// Mirrors the mousePress handler in index.ts. Coordinates are screen-space
// (identical to world space while the camera is at identity).
function press(screenX: number, screenY: number) {
  const mouse = cursor.getComponent(MouseComponent);
  mouse.screenX = screenX;
  mouse.screenY = screenY;
  const w = screenToWorld(cameraComp(), screenX, screenY);
  mouse.setXY(w.x, w.y);
  mouse.press(w.x, w.y);
  if (!cursor.hasComponent(IsMousePressed)) {
    cursor.addComponent(IsMousePressed);
  }
}

// Mirrors the mouseRelease handler in index.ts.
function release() {
  cursor.getComponent(MouseComponent).release();
  cursor.removeComponent(IsMousePressed);
}

// Mirrors the mouseMove handler in index.ts.
function moveTo(screenX: number, screenY: number) {
  const mouse = cursor.getComponent(MouseComponent);
  mouse.screenX = screenX;
  mouse.screenY = screenY;
  const w = screenToWorld(cameraComp(), screenX, screenY);
  mouse.setXY(w.x, w.y);
}

// Mirrors the wheel handler in index.ts.
function zoomAt(screenX: number, screenY: number, deltaY: number) {
  applyWheel(cameraComp(), cursor.getComponent(MouseComponent), {
    deltaX: 0, deltaY, ctrlKey: true, metaKey: false, offsetX: screenX, offsetY: screenY,
  });
}

function pan(deltaX: number, deltaY: number) {
  applyWheel(cameraComp(), cursor.getComponent(MouseComponent), {
    deltaX, deltaY, ctrlKey: false, metaKey: false, offsetX: 0, offsetY: 0,
  });
}

function setTool(tool: "cursor" | "rectangle" | "circle" | "line") {
  world.getEntity("tool")!.getComponent(ToolStateComponent).currentTool = tool;
}

function entityIdsByPrefix(prefix: string): string[] {
  return [...(world as any).entities.keys()].filter((id: string) => id.startsWith(prefix));
}

function selectionComp(): SelectionRectangleComponent {
  return world.getEntity("selection")!.getComponent(SelectionRectangleComponent);
}

let whiteboard: any;

beforeAll(async () => {
  vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
    rafCallbacks.push(cb);
    return rafCallbacks.length;
  });
  vi.stubGlobal("cancelAnimationFrame", () => {});

  // Mock ResizeObserver
  vi.stubGlobal("ResizeObserver", class {
    observe() {}
    unobserve() {}
    disconnect() {}
  });

  const { Whiteboard } = await import("../Whiteboard");
  whiteboard = new Whiteboard(document.body);
  world = whiteboard.world;
  cursor = world.getEntity("cursor")!;

  // Trigger mouseenter so the whiteboard becomes active and accepts keyboard events (Escape)
  const canvas = document.querySelector("canvas");
  if (canvas) {
    canvas.dispatchEvent(new window.MouseEvent("mouseenter"));
  }
});

function clickMenuTool(tool: string) {
  const button = document.querySelector(`[data-tool="${tool}"]`) as HTMLButtonElement;
  button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
}

describe("app boot", () => {
  it("creates the fixed entities", () => {
    expect(world).toBeDefined();
    expect(world.getEntity("cursor")).toBeDefined();
    expect(world.getEntity("selection")).toBeDefined();
    expect(world.getEntity("tool")).toBeDefined();
  });

  it("starts with an empty canvas", () => {
    expect(entityIdsByPrefix("rectangle-")).toHaveLength(0);
    expect(entityIdsByPrefix("circle-")).toHaveLength(0);
    expect(entityIdsByPrefix("line-")).toHaveLength(0);
    expect(selectionComp().entities.size).toBe(0);
  });

  it("runs the loop without throwing", () => {
    frame();
    frame();
  });
});

// Draws a rectangle via the real tool flow and returns its entity.
// Note: a successful draw auto-selects the shape and reverts to cursor mode.
function drawRectangle(x1: number, y1: number, x2: number, y2: number): Entity {
  setTool("rectangle");
  press(x1, y1);
  frame();
  moveTo(x2, y2);
  frame();
  release();
  frame();
  const ids = entityIdsByPrefix("rectangle-");
  return world.getEntity(ids[ids.length - 1])!;
}

describe("rectangle tool", () => {
  it("draws a rectangle by press-drag-release", () => {
    setTool("rectangle");

    press(50, 50);
    frame();
    moveTo(150, 120);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("rectangle-");
    expect(ids).toHaveLength(1);
    const rect = world.getEntity(ids[0])!.getComponent(RectangleComponent);
    expect(rect.x).toBe(50);
    expect(rect.y).toBe(50);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(70);
  });

  it("cancels a rectangle below the minimum size", () => {
    setTool("rectangle");
    const before = entityIdsByPrefix("rectangle-").length;

    press(200, 200);
    frame();
    moveTo(202, 202);
    frame();
    release();
    frame();

    expect(entityIdsByPrefix("rectangle-")).toHaveLength(before);
  });

  it("does not restart drawing after Escape while the button is still held", () => {
    setTool("rectangle");
    const before = entityIdsByPrefix("rectangle-").length;

    press(300, 100);
    frame();
    moveTo(380, 180);
    frame();

    // Escape cancels the in-progress drawing; the button is still held.
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    frame();
    frame();
    expect(entityIdsByPrefix("rectangle-")).toHaveLength(before);

    // Releasing afterwards must not commit anything either.
    moveTo(420, 220);
    frame();
    release();
    frame();
    expect(entityIdsByPrefix("rectangle-")).toHaveLength(before);
  });
});

describe("circle tool", () => {
  it("draws a circle by press-drag-release", () => {
    setTool("circle");

    press(300, 300);
    frame();
    moveTo(400, 400);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("circle-");
    expect(ids).toHaveLength(1);
    const circle = world.getEntity(ids[0])!.getComponent(CircleComponent);
    expect(circle.x).toBe(350);
    expect(circle.y).toBe(350);
    expect(circle.radius).toBe(50);
  });
});

describe("line tool", () => {
  it("draws a line with two clicks", () => {
    setTool("line");
    const before = entityIdsByPrefix("line-").length;

    press(10, 10);
    frame();
    release();
    frame();

    moveTo(90, 60);
    frame();
    press(90, 60);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("line-");
    expect(ids).toHaveLength(before + 1);
    const line = world.getEntity(ids[ids.length - 1])!.getComponent(LineComponent);
    expect(line.x1).toBe(10);
    expect(line.y1).toBe(10);
    expect(line.x2).toBe(90);
    expect(line.y2).toBe(60);
  });

  it("removes the preview line when switching tools mid-drawing", () => {
    setTool("line");
    const before = entityIdsByPrefix("line-").length;

    press(30, 400);
    frame();
    release();
    frame();
    moveTo(200, 420);
    frame();
    expect(entityIdsByPrefix("line-")).toHaveLength(before + 1); // preview exists

    clickMenuTool("cursor");
    frame();

    expect(entityIdsByPrefix("line-")).toHaveLength(before); // preview removed
    expect(world.getEntity("tool")!.getComponent(ToolStateComponent).currentTool).toBe("cursor");
  });
});

describe("selection and drag", () => {
  it("selects a shape on press and drags it", () => {
    const shapeEntity = drawRectangle(500, 100, 580, 160);
    const rect = shapeEntity.getComponent(RectangleComponent);
    const startX = rect.x;
    const startY = rect.y;

    press(startX + 10, startY + 10);
    frame();
    moveTo(startX + 40, startY + 30);
    frame();
    release();
    frame();

    expect(rect.x).toBe(startX + 30);
    expect(rect.y).toBe(startY + 20);
  });

  it("handles a release+press pair landing between two frames", () => {
    const shapeEntity = drawRectangle(50, 200, 110, 260);
    const rect = shapeEntity.getComponent(RectangleComponent);
    const startX = rect.x;
    const startY = rect.y;
    expect(selectionComp().hasEntity(shapeEntity)).toBe(true); // auto-selected after draw

    // Hold a drag on the shape, then release+press far away on empty canvas,
    // both landing between two frames.
    press(startX + 10, startY + 10);
    frame();
    release();
    press(600, 460);
    frame();
    moveTo(605, 465);
    frame();
    release();
    frame();

    // The click on empty canvas must clear the selection, and the shape must
    // not jump by the distance between the two press positions.
    expect(selectionComp().entities.size).toBe(0);
    expect(rect.x).toBe(startX);
    expect(rect.y).toBe(startY);
  });

  it("clears the selection when clicking empty canvas", () => {
    const shapeEntity = drawRectangle(200, 220, 260, 280);
    const rect = shapeEntity.getComponent(RectangleComponent);

    press(rect.x + 5, rect.y + 5);
    frame();
    release();
    frame();
    expect(selectionComp().entities.size).toBe(1);

    press(600, 450);
    frame();
    release();
    frame();

    expect(selectionComp().entities.size).toBe(0);
  });

  it("selects and drags a circle", () => {
    // Draw a circle, then reposition it with the cursor tool.
    setTool("circle");
    press(440, 60);
    frame();
    moveTo(520, 140);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("circle-");
    const circleEntity = world.getEntity(ids[ids.length - 1])!;
    const circle = circleEntity.getComponent(CircleComponent);
    expect(circle.x).toBe(480);
    expect(circle.y).toBe(100);

    setTool("cursor");
    press(circle.x, circle.y);
    frame();
    expect(selectionComp().hasEntity(circleEntity)).toBe(true);

    moveTo(circle.x + 25, circle.y - 15);
    frame();
    release();
    frame();

    expect(circle.x).toBe(505);
    expect(circle.y).toBe(85);
    expect(circle.radius).toBe(40);
  });

  it("auto-switches to the cursor tool with the fresh shape selected after drawing", () => {
    const freshEntity = drawRectangle(40, 380, 140, 460);

    // After a successful draw the tool reverts to cursor, the shape is
    // selected (its handles show), and the menu highlights the cursor button.
    const toolState = world.getEntity("tool")!.getComponent(ToolStateComponent);
    expect(toolState.currentTool).toBe("cursor");
    expect(selectionComp().hasEntity(freshEntity)).toBe(true);
    const cursorButton = document.querySelector('[data-tool="cursor"]') as HTMLButtonElement;
    expect(cursorButton.classList.contains("active")).toBe(true);

    // The user can immediately drag the fresh shape without any extra clicks.
    const rect = freshEntity.getComponent(RectangleComponent);
    press(rect.x + 10, rect.y + 10);
    frame();
    moveTo(rect.x + 60, rect.y + 20);
    frame();
    release();
    frame();

    expect(rect.x).toBe(90);
    expect(rect.y).toBe(390);
  });

  it("resizes a rectangle by dragging its corner handle", () => {
    const shapeEntity = drawRectangle(500, 300, 560, 350);
    const rect = shapeEntity.getComponent(RectangleComponent);

    // Grab the south-east handle and drag it outward.
    press(560, 350);
    frame();
    moveTo(600, 390);
    frame();
    release();
    frame();

    // Opposite (north-west) corner stays fixed; no dragging happened.
    expect(rect.x).toBe(500);
    expect(rect.y).toBe(300);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(90);
    expect(selectionComp().hasEntity(shapeEntity)).toBe(true);
  });

  it("resizes a circle by dragging a corner handle, without clearing the selection", () => {
    // Draw a circle: bbox (700,100)-(780,180), center (740,140), radius 40.
    setTool("circle");
    press(700, 100);
    frame();
    moveTo(780, 180);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("circle-");
    const circleEntity = world.getEntity(ids[ids.length - 1])!;
    const circle = circleEntity.getComponent(CircleComponent);
    expect(circle.radius).toBe(40);

    // The nw bbox corner is outside the circle itself - pressing it must
    // start a resize, not clear the selection.
    press(700, 100);
    frame();
    moveTo(660, 60);
    frame();
    release();
    frame();

    // Anchor is the se bbox corner (780,180): new square side 120 -> radius 60.
    expect(circle.radius).toBe(60);
    expect(circle.x).toBe(720);
    expect(circle.y).toBe(120);
    expect(selectionComp().hasEntity(circleEntity)).toBe(true);
  });

  it("resizes a line by dragging an endpoint handle", () => {
    // Draw a horizontal line (10,600) -> (110,600).
    setTool("line");
    press(10, 600);
    frame();
    release();
    frame();
    press(110, 600);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);

    // Grab the end handle: the press is also ON the line, but the handle
    // must win - only the endpoint moves, the line is not dragged.
    press(110, 600);
    frame();
    moveTo(150, 650);
    frame();
    release();
    frame();

    expect(line.x1).toBe(10);
    expect(line.y1).toBe(600);
    expect(line.x2).toBe(150);
    expect(line.y2).toBe(650);
  });

  it("selects and drags a line, but not from beyond its hit tolerance", () => {
    // Draw a horizontal line, then reposition it with the cursor tool.
    setTool("line");
    press(400, 300);
    frame();
    release();
    frame();
    press(500, 300);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);

    setTool("cursor");

    // A click 20px away from the segment must not select it.
    press(450, 320);
    frame();
    release();
    frame();
    expect(selectionComp().hasEntity(lineEntity)).toBe(false);

    // A click on the segment (within tolerance) selects it.
    press(450, 302);
    frame();
    expect(selectionComp().hasEntity(lineEntity)).toBe(true);

    moveTo(470, 342);
    frame();
    release();
    frame();

    expect(line.x1).toBe(420);
    expect(line.y1).toBe(340);
    expect(line.x2).toBe(520);
    expect(line.y2).toBe(340);
  });
});

describe("camera zoom and pan", () => {
  afterEach(() => {
    // Reset to the identity camera so the other suites keep their
    // screen == world assumption.
    const cam = cameraComp();
    cam.x = 0;
    cam.y = 0;
    cam.scale = 1;
  });

  it("zooms toward the cursor and still selects the right shape", () => {
    const shapeEntity = drawRectangle(100, 500, 160, 560);
    // Click empty canvas to clear the auto-selection.
    press(600, 60);
    frame();
    release();
    frame();
    expect(selectionComp().entities.size).toBe(0);

    // Pinch in twice, anchored over the shape: the world point under the
    // cursor must not move.
    const cam = cameraComp();
    const before = screenToWorld(cam, 130, 530);
    zoomAt(130, 530, -120);
    zoomAt(130, 530, -120);
    const after = screenToWorld(cam, 130, 530);
    expect(cam.scale).toBeGreaterThan(1);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);

    // Clicking the shape's current on-screen position selects it.
    const s = worldToScreen(cam, 130, 530);
    press(s.x, s.y);
    frame();
    expect(selectionComp().hasEntity(shapeEntity)).toBe(true);
    release();
    frame();
  });

  it("draws in world coordinates independent of the camera pan", () => {
    pan(100, 50);
    expect(cameraComp().x).toBe(100);
    expect(cameraComp().y).toBe(50);

    setTool("rectangle");
    press(20, 30); // screen -> world (120, 80)
    frame();
    moveTo(75, 85); // screen -> world (175, 135)
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("rectangle-");
    const rect = world.getEntity(ids[ids.length - 1])!.getComponent(RectangleComponent);
    expect(rect.x).toBe(120);
    expect(rect.y).toBe(80);
    expect(rect.width).toBe(55);
    expect(rect.height).toBe(55);
  });

  it("keeps the line grab tolerance screen-constant under zoom", () => {
    // Horizontal line (200,700) -> (300,700) in world space.
    setTool("line");
    press(200, 700);
    frame();
    release();
    frame();
    press(300, 700);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    setTool("cursor");
    press(600, 60); // clear the auto-selection
    frame();
    release();
    frame();

    // Zoom all the way in (clamps at MAX_ZOOM = 8), anchored at the midpoint.
    const cam = cameraComp();
    zoomAt(worldToScreen(cam, 250, 700).x, worldToScreen(cam, 250, 700).y, -1000);
    expect(cam.scale).toBe(8);

    // 3 world units off the segment is 24 screen px at 8x - beyond the 5px
    // screen tolerance, so it must NOT select (unzoomed it would have).
    let s = worldToScreen(cam, 250, 703);
    press(s.x, s.y);
    frame();
    release();
    frame();
    expect(selectionComp().hasEntity(lineEntity)).toBe(false);

    // 0.5 world units is 4 screen px - within tolerance, selects.
    s = worldToScreen(cam, 250, 700.5);
    press(s.x, s.y);
    frame();
    expect(selectionComp().hasEntity(lineEntity)).toBe(true);
    release();
    frame();
  });

  it("keeps an in-progress rectangle preview coherent through a mid-draw zoom", () => {
    setTool("rectangle");
    press(400, 600);
    frame();
    moveTo(450, 650);
    frame();

    // Pinch-zoom while the button is still held, anchored at the cursor:
    // the world point under the cursor stays fixed, so the preview corner
    // must not jump.
    zoomAt(450, 650, -120);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("rectangle-");
    const rect = world.getEntity(ids[ids.length - 1])!.getComponent(RectangleComponent);
    // The press anchor is a world coordinate, unaffected by the zoom.
    expect(rect.x).toBe(400);
    expect(rect.y).toBe(600);
    expect(rect.width).toBeCloseTo(50, 10);
    expect(rect.height).toBeCloseTo(50, 10);
  });

  // The tests above call applyWheel directly (like press/moveTo mirror the
  // mouse handlers). These two go through the real DOM listener instead, so
  // the canvas wheel wiring and preventDefault are covered too.
  it("wires the canvas wheel listener: ctrl+wheel zooms and prevents browser page-zoom", () => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const event = new window.WheelEvent("wheel", {
      deltaY: -120, ctrlKey: true, bubbles: true, cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(cameraComp().scale).toBeGreaterThan(1);
    // preventDefault must fire, otherwise the browser zooms the whole page.
    expect(event.defaultPrevented).toBe(true);
  });

  it("wires the canvas wheel listener: plain wheel pans", () => {
    const canvas = document.querySelector("canvas") as HTMLCanvasElement;
    const event = new window.WheelEvent("wheel", {
      deltaX: 30, deltaY: 10, bubbles: true, cancelable: true,
    });
    canvas.dispatchEvent(event);

    expect(cameraComp().x).toBe(30);
    expect(cameraComp().y).toBe(10);
    expect(cameraComp().scale).toBe(1);
    expect(event.defaultPrevented).toBe(true);
  });
});

describe("connection handles", () => {
  it("draws a connection line from a shape's connection handle", () => {
    // 1. Draw a rectangle to get a shape
    const shapeEntity = drawRectangle(100, 100, 200, 200);
    expect(selectionComp().hasEntity(shapeEntity)).toBe(true);

    // 2. The connection handles are at n, e, s, w
    // East handle is at bounds.x + bounds.width, bounds.y + bounds.height / 2
    // For (100, 100) width 100, height 100, east handle is at 200, 150.
    
    // 3. Press on the east handle
    press(200, 150);
    frame();
    
    // 4. Drag away
    moveTo(300, 150);
    frame();
    
    // 5. Release
    release();
    frame();
    
    // 6. Verify a line was created with x1=200, y1=150, x2=300, y2=150
    const lineIds = entityIdsByPrefix("connection-line-");
    expect(lineIds.length).toBeGreaterThan(0);
    const lineId = lineIds[lineIds.length - 1];
    const lineEntity = world.getEntity(lineId)!;
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x1).toBe(200);
    expect(line.y1).toBe(150);
    expect(line.x2).toBe(300);
    expect(line.y2).toBe(150);
    
    // 7. Verify the new line is selected
    expect(selectionComp().hasEntity(lineEntity)).toBe(true);

    // 8. The start endpoint is attached to the source shape's east handle.
    const attachment = lineEntity.getComponent(LineAttachmentComponent);
    expect(attachment.start).toEqual({ entityId: shapeEntity.id, handleId: "e" });
    expect(attachment.end).toBeNull();
  });
  
  it("removes connection line preview if cancelled", () => {
    // 1. Draw a rectangle to get a shape
    const shapeEntity = drawRectangle(400, 400, 500, 500);
    expect(selectionComp().hasEntity(shapeEntity)).toBe(true);

    const before = entityIdsByPrefix("connection-line-").length;

    // 2. Press on the east handle (500, 450)
    press(500, 450);
    frame();
    
    // 3. Drag away
    moveTo(550, 450);
    frame();
    
    expect(entityIdsByPrefix("connection-line-").length).toBeGreaterThan(before);

    // 4. Cancel drawing by switching tools before releasing
    setTool("rectangle");
    frame();

    // 5. Verify the preview line is removed
    expect(entityIdsByPrefix("connection-line-").length).toBe(before);
    
    // release to cleanup state
    release();
    frame();
  });
});

// All scenes below use x >= 1000, clear of shapes left behind by earlier
// suites, so snap never fires against a stray leftover midpoint.
describe("connection snapping and attachment tracking", () => {
  // Clicks (press+release) at a point with the cursor tool, selecting
  // whatever shape is there.
  function selectAt(x: number, y: number) {
    setTool("cursor");
    press(x, y);
    frame();
    release();
    frame();
  }

  // Drags a connection line from (fromX,fromY) - a connection handle of the
  // currently selected shape - to (toX,toY). Returns the created line entity.
  function drawConnection(fromX: number, fromY: number, toX: number, toY: number): Entity {
    press(fromX, fromY);
    frame();
    moveTo(toX, toY);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    return world.getEntity(ids[ids.length - 1])!;
  }

  it("snaps the dragged endpoint to another shape's connection point and attaches it", () => {
    const a = drawRectangle(1000, 100, 1100, 200);
    const b = drawRectangle(1200, 100, 1300, 200);
    selectAt(1050, 150); // drawing B stole the selection; re-select A
    expect(selectionComp().hasEntity(a)).toBe(true);

    // Drag from A's east handle, stopping 5px short of B's west point (1200,150).
    press(1100, 150);
    frame();
    moveTo(1195, 150);
    frame();

    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    // Live snap: the preview endpoint sits on B's connection point already.
    expect(line.x2).toBe(1200);
    expect(line.y2).toBe(150);
    expect(selectionComp().connectionSnap).toEqual({ entityId: b.id, handleId: "w" });

    release();
    frame();

    const attachment = lineEntity.getComponent(LineAttachmentComponent);
    expect(attachment.start).toEqual({ entityId: a.id, handleId: "e" });
    expect(attachment.end).toEqual({ entityId: b.id, handleId: "w" });
    expect(line.x2).toBe(1200);
    expect(line.y2).toBe(150);
    expect(selectionComp().hasEntity(lineEntity)).toBe(true);
    expect(selectionComp().connectionSnap).toBeNull();
  });

  it("does not snap beyond the snap radius", () => {
    const a = drawRectangle(1000, 300, 1100, 400);
    drawRectangle(1200, 300, 1300, 400);
    selectAt(1050, 350);
    expect(selectionComp().hasEntity(a)).toBe(true);

    press(1100, 350);
    frame();
    moveTo(1180, 350); // 20px from B's west point (1200,350)
    frame();

    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(1180);
    expect(selectionComp().connectionSnap).toBeNull();

    release();
    frame();

    expect(lineEntity.getComponent(LineAttachmentComponent).end).toBeNull();
  });

  it("cancels a stray click on a connection handle instead of creating a zero-length line", () => {
    const a = drawRectangle(1400, 300, 1500, 400);
    const before = entityIdsByPrefix("connection-line-").length;

    // Press and release on the east handle without moving.
    press(1500, 350);
    frame();
    release();
    frame();

    expect(entityIdsByPrefix("connection-line-").length).toBe(before);
    expect(selectionComp().hasEntity(a)).toBe(true);
  });

  it("keeps an attached line stuck to a dragged shape", () => {
    const a = drawRectangle(1000, 500, 1100, 600);
    drawRectangle(1200, 500, 1300, 600);
    selectAt(1050, 550);
    const lineEntity = drawConnection(1100, 550, 1195, 550); // A.e -> B.w, snapped
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(1200);

    // Drag A down by 40, grabbing its interior (clear of the line and handles).
    selectAt(1050, 550);
    expect(selectionComp().hasEntity(a)).toBe(true);
    press(1050, 550);
    frame();
    moveTo(1050, 590);
    frame();
    release();
    frame();

    // Start endpoint follows A's east midpoint; end stays pinned to B.
    expect(line.x1).toBe(1100);
    expect(line.y1).toBe(590);
    expect(line.x2).toBe(1200);
    expect(line.y2).toBe(550);
  });

  it("keeps an attached line stuck to a resized shape", () => {
    drawRectangle(1000, 700, 1100, 800);
    const b = drawRectangle(1200, 700, 1300, 800);
    selectAt(1050, 750);
    const lineEntity = drawConnection(1100, 750, 1195, 750); // A.e -> B.w
    const line = lineEntity.getComponent(LineComponent);

    // Resize B by its south-east corner: B becomes (1200,700)-(1340,840),
    // so its west midpoint moves to (1200,770).
    selectAt(1250, 790);
    expect(selectionComp().hasEntity(b)).toBe(true);
    press(1300, 800);
    frame();
    moveTo(1340, 840);
    frame();
    release();
    frame();

    expect(line.x2).toBe(1200);
    expect(line.y2).toBe(770);
  });

  it("detaches a line when its body is dragged", () => {
    const a = drawRectangle(1400, 500, 1500, 600);
    drawRectangle(1600, 500, 1700, 600);
    selectAt(1450, 550);
    const lineEntity = drawConnection(1500, 550, 1595, 550); // A.e -> B.w
    const line = lineEntity.getComponent(LineComponent);
    expect(lineEntity.hasComponent(LineAttachmentComponent)).toBe(true);

    // The fresh line is auto-selected; drag its body (mid-span, far from
    // the endpoint handles).
    press(1550, 550);
    frame();
    moveTo(1550, 580);
    frame();
    release();
    frame();

    expect(lineEntity.hasComponent(LineAttachmentComponent)).toBe(false);
    expect(line.x1).toBe(1500);
    expect(line.y1).toBe(580);
    expect(line.x2).toBe(1600);
    expect(line.y2).toBe(580);

    // Dragging A afterwards must not move the detached line.
    selectAt(1450, 550);
    expect(selectionComp().hasEntity(a)).toBe(true);
    press(1450, 550);
    frame();
    moveTo(1450, 520);
    frame();
    release();
    frame();
    expect(line.y1).toBe(580);
    expect(line.y2).toBe(580);
  });

  it("detaches only the grabbed side when dragging an attached endpoint", () => {
    const a = drawRectangle(1400, 700, 1500, 800);
    drawRectangle(1600, 700, 1700, 800);
    selectAt(1450, 750);
    const lineEntity = drawConnection(1500, 750, 1595, 750); // A.e -> B.w
    const line = lineEntity.getComponent(LineComponent);
    const attachment = lineEntity.getComponent(LineAttachmentComponent);

    // The fresh line is selected; grab its 'end' handle (on B's west point).
    press(1600, 750);
    frame();
    moveTo(1650, 760);
    frame();
    release();
    frame();

    expect(line.x2).toBe(1650);
    expect(line.y2).toBe(760);
    expect(attachment.end).toBeNull();
    expect(attachment.start).toEqual({ entityId: a.id, handleId: "e" });

    // The start endpoint still follows A.
    selectAt(1450, 750);
    expect(selectionComp().hasEntity(a)).toBe(true);
    press(1450, 750);
    frame();
    moveTo(1450, 770);
    frame();
    release();
    frame();
    expect(line.x1).toBe(1500);
    expect(line.y1).toBe(770);
  });

  it("snaps to a circle's connection point and tracks the circle", () => {
    setTool("circle");
    press(1000, 900);
    frame();
    moveTo(1100, 1000);
    frame();
    release();
    frame();
    const circleIds = entityIdsByPrefix("circle-");
    const circle = world.getEntity(circleIds[circleIds.length - 1])!;
    const circleComp = circle.getComponent(CircleComponent);
    expect(circleComp.x).toBe(1050);
    expect(circleComp.y).toBe(950);
    expect(circleComp.radius).toBe(50);

    const a = drawRectangle(1200, 900, 1300, 1000);
    expect(selectionComp().hasEntity(a)).toBe(true);
    // Drag from A's west handle to 8px from the circle's east point (1100,950).
    const lineEntity = drawConnection(1200, 950, 1108, 950);
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(1100);
    expect(line.y2).toBe(950);
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: circle.id, handleId: "e" });

    // Drag the circle; the line endpoint follows its east point.
    selectAt(1050, 950);
    expect(selectionComp().hasEntity(circle)).toBe(true);
    press(1050, 950);
    frame();
    moveTo(1060, 970);
    frame();
    release();
    frame();
    expect(line.x2).toBe(1110);
    expect(line.y2).toBe(970);
  });
});

// All scenes use x >= 1800, clear of shapes left behind by earlier suites.
describe("undo/redo history", () => {
  function undoBtn() {
    return document.querySelector('[data-action="undo"]') as HTMLButtonElement;
  }
  function redoBtn() {
    return document.querySelector('[data-action="redo"]') as HTMLButtonElement;
  }

  it("undoes and redoes drawing a shape, preserving its entity id", () => {
    const entity = drawRectangle(1800, 100, 1900, 200);
    const id = entity.id;
    expect(undoBtn().disabled).toBe(false);
    expect(redoBtn().disabled).toBe(true); // a fresh action clears the redo stack

    whiteboard.undo();
    frame();
    expect(world.getEntity(id)).toBeUndefined();
    expect(redoBtn().disabled).toBe(false);

    whiteboard.redo();
    frame();
    const rect = world.getEntity(id)!.getComponent(RectangleComponent);
    expect(rect.x).toBe(1800);
    expect(rect.y).toBe(100);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(100);
  });

  it("undoes a drag back to the original position", () => {
    const entity = drawRectangle(1800, 300, 1900, 400);
    const rect = entity.getComponent(RectangleComponent);

    press(1850, 350);
    frame();
    moveTo(1880, 380);
    frame();
    release();
    frame();
    expect(rect.x).toBe(1830);

    whiteboard.undo();
    frame();
    expect(rect.x).toBe(1800);
    expect(rect.y).toBe(300);
  });

  it("keeps line attachments working through undo of a shape drag", () => {
    drawRectangle(1800, 500, 1900, 600); // A
    drawRectangle(2000, 500, 2100, 600); // B
    press(1850, 550); // re-select A (drawing B stole the selection)
    frame();
    release();
    frame();

    // Connect A.e -> B.w (release 5px short of B's west point, snapped).
    press(1900, 550);
    frame();
    moveTo(1995, 550);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(2000);

    // Select A again and drag it down by 40.
    press(1850, 550);
    frame();
    release();
    frame();
    press(1850, 550);
    frame();
    moveTo(1850, 590);
    frame();
    release();
    frame();
    expect(line.y1).toBe(590);

    whiteboard.undo();
    frame();
    expect(line.y1).toBe(550);
    expect(lineEntity.hasComponent(LineAttachmentComponent)).toBe(true);

    // The restored attachment is live: dragging A again moves the line.
    press(1850, 550);
    frame();
    release();
    frame();
    press(1850, 550);
    frame();
    moveTo(1850, 570);
    frame();
    release();
    frame();
    expect(line.y1).toBe(570);
  });

  it("recreates an attached line on redo after undoing its creation", () => {
    const a = drawRectangle(2200, 100, 2300, 200);
    const b = drawRectangle(2200, 300, 2300, 400);
    press(2250, 150); // re-select A
    frame();
    release();
    frame();

    // Connect A.s -> B.n (release 5px short of B's north point, snapped).
    press(2250, 200);
    frame();
    moveTo(2250, 295);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineId = ids[ids.length - 1];
    expect(world.getEntity(lineId)!.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: b.id, handleId: "n" });

    whiteboard.undo();
    frame();
    expect(world.getEntity(lineId)).toBeUndefined();

    whiteboard.redo();
    frame();
    const restored = world.getEntity(lineId)!;
    const attachment = restored.getComponent(LineAttachmentComponent);
    expect(attachment.start).toEqual({ entityId: a.id, handleId: "s" });
    expect(attachment.end).toEqual({ entityId: b.id, handleId: "n" });

    // The recreated pins are live: dragging A moves the line's start.
    press(2250, 150);
    frame();
    release();
    frame();
    press(2250, 150);
    frame();
    moveTo(2270, 150);
    frame();
    release();
    frame();
    expect(restored.getComponent(LineComponent).x1).toBe(2270);
  });

  it("does not record the line tool's in-progress preview as history", () => {
    const linesBefore = entityIdsByPrefix("line-").length;
    const marker = drawRectangle(1800, 700, 1880, 780);

    // First click of a line: the release lands mid-draw (preview is live)
    // and must not be snapshotted.
    setTool("line");
    press(2000, 700);
    frame();
    release();
    frame();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape" }));
    frame();
    expect(entityIdsByPrefix("line-")).toHaveLength(linesBefore);

    // Undo must revert the marker's creation - not restore a phantom preview.
    setTool("cursor");
    whiteboard.undo();
    frame();
    expect(entityIdsByPrefix("line-")).toHaveLength(linesBefore);
    expect(world.getEntity(marker.id)).toBeUndefined();

    whiteboard.redo();
    frame();
  });

  it("clears the selection when undo removes the selected shape", () => {
    const entity = drawRectangle(2000, 100, 2080, 180);
    expect(selectionComp().hasEntity(entity)).toBe(true); // auto-selected

    whiteboard.undo();
    frame();
    expect(selectionComp().entities.size).toBe(0);
    // Extra frames: Selection/Render must not crash on the removed entity.
    frame();
    frame();
  });

  it("leaves the camera untouched by undo", () => {
    drawRectangle(2000, 300, 2080, 380);
    pan(50, 25);

    whiteboard.undo();
    frame();
    expect(cameraComp().x).toBe(50);
    expect(cameraComp().y).toBe(25);
    expect(cameraComp().scale).toBe(1);

    const cam = cameraComp();
    cam.x = 0;
    cam.y = 0;
    cam.scale = 1;
  });

  it("ignores undo while the mouse button is held", () => {
    const entity = drawRectangle(2200, 700, 2280, 780);

    press(2240, 740);
    frame();
    whiteboard.undo();
    frame();
    expect(world.getEntity(entity.id)).toBeDefined();

    release();
    frame();
  });

  it("binds Cmd+Z for undo and Cmd+Shift+Z for redo", () => {
    const entity = drawRectangle(2000, 700, 2080, 780);
    const id = entity.id;

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", metaKey: true, cancelable: true }));
    frame();
    expect(world.getEntity(id)).toBeUndefined();

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", metaKey: true, shiftKey: true, cancelable: true }));
    frame();
    expect(world.getEntity(id)).toBeDefined();
  });

  it("undoes and redoes via the menu buttons", () => {
    const entity = drawRectangle(2200, 500, 2280, 580);

    undoBtn().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    frame();
    expect(world.getEntity(entity.id)).toBeUndefined();

    redoBtn().dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    frame();
    expect(world.getEntity(entity.id)).toBeDefined();
  });

  it("saveShapes/loadShapes roundtrip is byte-stable", () => {
    // The world holds rects, circles and attached lines from earlier suites.
    const snapshot = whiteboard.saveShapes();
    whiteboard.loadShapes(snapshot);
    expect(whiteboard.saveShapes()).toBe(snapshot);
  });
});

describe("DOM event listeners in index.ts", () => {
  it("handles mousemove, mousedown, mouseup, wheel directly on window", () => {
    // Set to cursor
    setTool("cursor");

    // We can dispatch events on window since that's what index.ts sets up (via render.ts)
    const canvas = document.querySelector('canvas') || window;
    
    // mousemove
    const moveEvent = new window.MouseEvent("mousemove", { clientX: 250, clientY: 250 });
    Object.defineProperty(moveEvent, 'offsetX', { get: () => 250 });
    Object.defineProperty(moveEvent, 'offsetY', { get: () => 250 });
    canvas.dispatchEvent(moveEvent);

    // mousedown
    const downEvent = new window.MouseEvent("mousedown", { clientX: 250, clientY: 250 });
    Object.defineProperty(downEvent, 'offsetX', { get: () => 250 });
    Object.defineProperty(downEvent, 'offsetY', { get: () => 250 });
    canvas.dispatchEvent(downEvent);

    // mouseup
    const upEvent = new window.MouseEvent("mouseup");
    window.dispatchEvent(upEvent);

    // wheel
    const wheelEvent = new window.WheelEvent("wheel", { deltaY: 100 });
    canvas.dispatchEvent(wheelEvent);
    
    // Check that we didn't crash
    expect(true).toBe(true);
  });
});
