/**
 * Boots the real app entry (src/index.ts) in jsdom with the WebGL mock and
 * drives the ECS through frame ticks to verify the draw tools end-to-end.
 *
 * Input is simulated the same way the real DOM handlers in index.ts feed the
 * ECS: press()/release() advance MouseComponent's event-time counters and
 * toggle the IsMousePressed tag; moveTo() updates the current position.
 */
import { describe, it, expect, vi, beforeAll, beforeEach, afterEach } from "vitest";

import type { Entity, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import LineAttachmentComponent from "../component/LineAttachmentComponent";
import { DEFAULT_FILL, DEFAULT_STROKE, PALETTE } from "../palette";
import CameraComponent from "../component/CameraComponent";
import TextComponent from "../component/TextComponent";
import { applyWheel, screenToWorld, worldToScreen } from "../camera";
import { setMeasurer } from "../textLayout";
import { SYSTEM_DESIGN_TOOLS } from "../systemDesign";

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

  // jsdom's measureText returns 0 - inject a deterministic monospace
  // measurer through the layout module's explicit seam (no vi.mock).
  setMeasurer((text, fontSize) => text.length * fontSize * 0.6);

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
    moveTo(1180, 350); // 20px from B's bbox edge - outside the inflated bbox
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

    // The fresh line is selected; grab its 'end' handle (on B's west point)
    // and drag to open space - (1650,900) is outside every inflated bbox in
    // this column, so the endpoint detaches without re-snapping.
    press(1600, 750);
    frame();
    moveTo(1650, 900);
    frame();
    release();
    frame();

    expect(line.x2).toBe(1650);
    expect(line.y2).toBe(900);
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

// Mirrors the dblclick handler in Whiteboard.bindEvents - like press(), the
// ECS is driven directly because jsdom MouseEvents have no settable offsetX/Y.
function dblclick(screenX: number, screenY: number) {
  const w = screenToWorld(cameraComp(), screenX, screenY);
  cursor.getComponent(MouseComponent).doubleClick(w.x, w.y);
}

function activeTextarea(): HTMLTextAreaElement | null {
  return document.querySelector("textarea");
}

function commitViaBlur(textarea: HTMLTextAreaElement) {
  textarea.dispatchEvent(new window.FocusEvent("blur"));
}

function toolStateComp(): ToolStateComponent {
  return world.getEntity("tool")!.getComponent(ToolStateComponent);
}

// Full realistic double-click: the two single click pairs land first (they
// select the shape), then the dblclick event fires.
function openTextEditor(x: number, y: number): HTMLTextAreaElement {
  press(x, y);
  frame();
  release();
  frame();
  press(x, y);
  frame();
  release();
  frame();
  dblclick(x, y);
  frame();
  const textarea = activeTextarea();
  expect(textarea).toBeTruthy();
  return textarea!;
}

describe("text editing", () => {
  it("double-click opens a textarea over the shape (the preceding clicks selected it) and blur commits", () => {
    const entity = drawRectangle(2200, 100, 2350, 220);
    const textarea = openTextEditor(2275, 160);

    expect(selectionComp().hasEntity(entity)).toBe(true);
    expect(toolStateComp().editingEntityId).toBe(entity.id);

    textarea.value = "hello world";
    commitViaBlur(textarea);
    expect(activeTextarea()).toBeNull();
    expect(toolStateComp().editingEntityId).toBeNull();
    expect(entity.getComponent(TextComponent).content).toBe("hello world");

    // A frame with committed text exercises layout -> raster -> texture.
    frame();
  });

  it("double-click on empty canvas opens nothing", () => {
    dblclick(2600, 2600);
    frame();
    expect(activeTextarea()).toBeNull();
  });

  it("re-opening shows the existing content; an empty commit removes the component", () => {
    const entity = drawRectangle(2200, 300, 2350, 420);
    let textarea = openTextEditor(2275, 360);
    textarea.value = "abc";
    commitViaBlur(textarea);

    textarea = openTextEditor(2275, 360);
    expect(textarea.value).toBe("abc");
    textarea.value = "   ";
    commitViaBlur(textarea);
    expect(entity.hasComponent(TextComponent)).toBe(false);
  });

  it("Escape commits the text instead of cancelling, and touches no draw state", () => {
    const entity = drawRectangle(2200, 500, 2350, 620);
    const textarea = openTextEditor(2275, 560);
    textarea.value = "esc text";
    textarea.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));

    expect(activeTextarea()).toBeNull();
    expect(entity.getComponent(TextComponent).content).toBe("esc text");
    expect(world.getEntity(entity.id)).toBeDefined();
    expect(toolStateComp().drawState).toBe("IDLE");
  });

  it("a click-away commit is suppressed: no selection change, no drag even while held", () => {
    const entity = drawRectangle(2200, 700, 2350, 820);
    const rect = entity.getComponent(RectangleComponent);
    const textarea = openTextEditor(2275, 760);
    textarea.value = "stay";

    // Browser order on click-away: mousedown records the press, THEN blur
    // commits. The press lands on empty canvas.
    press(2600, 950);
    commitViaBlur(textarea);
    frame();

    expect(entity.getComponent(TextComponent).content).toBe("stay");
    // Suppressed press: selection not cleared by the empty-canvas click...
    expect(selectionComp().hasEntity(entity)).toBe(true);
    // ...and holding the button and moving does not drag the shape.
    const xBefore = rect.x;
    moveTo(2650, 1000);
    frame();
    expect(rect.x).toBe(xBefore);
    release();
    frame();
  });

  it("text round-trips through saveShapes/loadShapes; a textless snapshot removes text", () => {
    const entity = drawRectangle(2200, 900, 2350, 1020);
    const textarea = openTextEditor(2275, 960);
    textarea.value = "persist";
    commitViaBlur(textarea);

    const snapshot = whiteboard.saveShapes();
    whiteboard.loadShapes(snapshot);
    expect(world.getEntity(entity.id)!.getComponent(TextComponent).content).toBe("persist");
    // Byte-identical round-trip survives the text field.
    expect(whiteboard.saveShapes()).toBe(snapshot);

    const shapes = JSON.parse(snapshot) as any[];
    shapes.forEach((shape) => delete shape.text);
    whiteboard.loadShapes(JSON.stringify(shapes));
    expect(world.getEntity(entity.id)!.hasComponent(TextComponent)).toBe(false);
  });

  it("an Escape-committed edit is exactly one undo step and survives redo", () => {
    const entity = drawRectangle(2200, 1100, 2350, 1220);
    const textarea = openTextEditor(2275, 1160);
    textarea.value = "undo me";
    textarea.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(entity.getComponent(TextComponent).content).toBe("undo me");

    whiteboard.undo();
    frame();
    expect(world.getEntity(entity.id)!.hasComponent(TextComponent)).toBe(false);
    // The shape itself is untouched - only the text edit was undone.
    expect(world.getEntity(entity.id)!.getComponent(RectangleComponent).x).toBe(2200);

    whiteboard.redo();
    frame();
    expect(world.getEntity(entity.id)!.getComponent(TextComponent).content).toBe("undo me");
  });

  it("Ctrl/Cmd+Z while editing is blocked by the edit guard, not just hover gating", () => {
    drawRectangle(2200, 1300, 2350, 1420);
    const textarea = openTextEditor(2275, 1360);

    // Arrange isActive=true explicitly: with the pointer treated as over the
    // canvas the keydown handler runs, so the editingEntityId guard is what
    // must block the whiteboard undo (see critique iteration 5).
    document.querySelector("canvas")!.dispatchEvent(new window.MouseEvent("mouseenter"));
    const before = whiteboard.saveShapes();
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "z", ctrlKey: true }));

    expect(activeTextarea()).toBe(textarea); // still editing
    expect(whiteboard.saveShapes()).toBe(before); // board untouched
    commitViaBlur(textarea);
  });

  it("clicking the menu undo button mid-edit commits first, then undoes that commit as one step", () => {
    const entity = drawRectangle(2200, 1500, 2350, 1620);
    const textarea = openTextEditor(2275, 1560);
    textarea.value = "menu undo";

    // A real menu click blurs the textarea via mousedown before the click
    // handler runs - simulate that order explicitly.
    commitViaBlur(textarea);
    const undoButton = document.querySelector('[data-action="undo"]') as HTMLButtonElement;
    undoButton.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
    frame();

    // The commit landed in history and was then undone - text gone, shape intact.
    expect(world.getEntity(entity.id)!.hasComponent(TextComponent)).toBe(false);
    expect(world.getEntity(entity.id)).toBeDefined();
  });
});

// All scenes use x >= 3000, clear of shapes left behind by earlier suites.
describe("deleting shapes", () => {
  function selectAt(x: number, y: number) {
    setTool("cursor");
    press(x, y);
    frame();
    release();
    frame();
  }

  function pressKey(key: string) {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key, cancelable: true }));
  }

  it("Delete removes the selected shape and clears the selection", () => {
    const entity = drawRectangle(3000, 100, 3100, 200);
    expect(selectionComp().hasEntity(entity)).toBe(true); // auto-selected

    pressKey("Delete");
    frame();
    expect(world.getEntity(entity.id)).toBeUndefined();
    expect(selectionComp().entities.size).toBe(0);
  });

  it("Backspace deletes too, and undo restores the shape with its id", () => {
    const entity = drawRectangle(3000, 300, 3100, 400);
    const id = entity.id;

    pressKey("Backspace");
    frame();
    expect(world.getEntity(id)).toBeUndefined();

    whiteboard.undo();
    frame();
    const rect = world.getEntity(id)!.getComponent(RectangleComponent);
    expect(rect.x).toBe(3000);
    expect(rect.width).toBe(100);
  });

  it("is a no-op with nothing selected", () => {
    selectAt(3500, 3500); // empty click clears the selection
    const before = whiteboard.saveShapes();
    pressKey("Delete");
    frame();
    expect(whiteboard.saveShapes()).toBe(before);
  });

  it("is a no-op while the mouse button is held", () => {
    const entity = drawRectangle(3000, 500, 3100, 600);
    press(3050, 550);
    frame();
    pressKey("Delete");
    expect(world.getEntity(entity.id)).toBeDefined();
    release();
    frame();
    pressKey("Delete");
    frame();
    expect(world.getEntity(entity.id)).toBeUndefined();
  });

  it("detaches (but keeps) a line attached to the deleted shape, in the same snapshot", () => {
    const a = drawRectangle(3000, 700, 3100, 800);
    const b = drawRectangle(3200, 700, 3300, 800);
    selectAt(3050, 750); // drawing B stole the selection; re-select A
    expect(selectionComp().hasEntity(a)).toBe(true);

    // Connect A's east handle to B's west point.
    press(3100, 750);
    frame();
    moveTo(3195, 750);
    frame();
    release();
    frame();
    const lineIds = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(lineIds[lineIds.length - 1])!;
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: b.id, handleId: "w" });

    selectAt(3250, 750);
    expect(selectionComp().hasEntity(b)).toBe(true);
    pressKey("Delete");

    // B is gone, the line survives, and its dangling end was pruned before
    // the history snapshot (no dead undo step from next-frame cleanup).
    expect(world.getEntity(b.id)).toBeUndefined();
    expect(world.getEntity(lineEntity.id)).toBeDefined();
    expect(lineEntity.getComponent(LineAttachmentComponent).end).toBeNull();
    const snapshot = whiteboard.saveShapes();
    frame();
    expect(whiteboard.saveShapes()).toBe(snapshot);

    // Undo restores B and the attachment.
    whiteboard.undo();
    frame();
    expect(world.getEntity(b.id)).toBeDefined();
    expect(world.getEntity(lineEntity.id)!.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: b.id, handleId: "w" });
  });
});

describe("duplicating shapes", () => {
  function selectAt(x: number, y: number) {
    setTool("cursor");
    press(x, y);
    frame();
    release();
    frame();
  }

  function pressCmdD() {
    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "d", metaKey: true, cancelable: true }));
  }

  it("Cmd+D copies the selected rectangle at a 16px offset and selects the copy", () => {
    const original = drawRectangle(4000, 100, 4100, 200);
    expect(selectionComp().hasEntity(original)).toBe(true);
    const orig = original.getComponent(RectangleComponent);
    const { x: origX, y: origY } = orig;

    pressCmdD();
    frame();

    const copyIds = entityIdsByPrefix("duplicate-");
    expect(copyIds).toHaveLength(1);
    const copy = world.getEntity(copyIds[0])!;
    const rect = copy.getComponent(RectangleComponent);
    expect(rect.x).toBe(origX + 16);
    expect(rect.y).toBe(origY + 16);
    expect(rect.width).toBe(100);
    expect(rect.height).toBe(100);

    // Original untouched, selection moved to the copy.
    expect(orig.x).toBe(origX);
    expect(orig.y).toBe(origY);
    expect(selectionComp().hasEntity(copy)).toBe(true);
    expect(selectionComp().hasEntity(original)).toBe(false);
  });

  it("repeated Cmd+D chains off the previous copy", () => {
    const copyIdsBefore = entityIdsByPrefix("duplicate-");
    const first = world.getEntity(copyIdsBefore[copyIdsBefore.length - 1])!.getComponent(RectangleComponent);
    const { x: firstX, y: firstY } = first;

    pressCmdD();
    frame();
    const copyIds = entityIdsByPrefix("duplicate-");
    expect(copyIds).toHaveLength(2);
    const second = world.getEntity(copyIds[copyIds.length - 1])!.getComponent(RectangleComponent);
    expect(second.x).toBe(firstX + 16);
    expect(second.y).toBe(firstY + 16);
  });

  it("undo removes the duplicate in one step", () => {
    const before = entityIdsByPrefix("duplicate-").length;
    const shape = drawRectangle(4000, 300, 4100, 400);
    pressCmdD();
    frame();
    expect(entityIdsByPrefix("duplicate-")).toHaveLength(before + 1);

    whiteboard.undo();
    frame();
    expect(entityIdsByPrefix("duplicate-")).toHaveLength(before);
    expect(world.getEntity(shape.id)).toBeDefined();
  });

  it("copies the shape's text", () => {
    const shape = drawRectangle(4000, 500, 4100, 600);
    shape.addComponent(TextComponent, {
      content: "hello", fontSize: 16, fontFamily: "sans-serif", color: "black",
    });

    pressCmdD();
    frame();
    const copyIds = entityIdsByPrefix("duplicate-");
    const copy = world.getEntity(copyIds[copyIds.length - 1])!;
    expect(copy.getComponent(TextComponent).content).toBe("hello");
  });

  it("duplicating an attached line copies the geometry but not the attachment", () => {
    const a = drawRectangle(4000, 700, 4100, 800);
    const b = drawRectangle(4200, 700, 4300, 800);
    selectAt(4050, 750); // re-select A (drawing B stole the selection)
    expect(selectionComp().hasEntity(a)).toBe(true);

    // Connect A's east handle to B's west point.
    press(4100, 750);
    frame();
    moveTo(4195, 750);
    frame();
    release();
    frame();
    const lineIds = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(lineIds[lineIds.length - 1])!;
    expect(lineEntity.hasComponent(LineAttachmentComponent)).toBe(true);

    // Select the line's body and duplicate it.
    selectAt(4150, 750);
    expect(selectionComp().hasEntity(lineEntity)).toBe(true);
    pressCmdD();
    frame();

    const copyIds = entityIdsByPrefix("duplicate-");
    const copy = world.getEntity(copyIds[copyIds.length - 1])!;
    const line = copy.getComponent(LineComponent);
    const sourceLine = lineEntity.getComponent(LineComponent);
    expect(line.x1).toBe(sourceLine.x1 + 16);
    expect(line.y1).toBe(sourceLine.y1 + 16);
    expect(line.x2).toBe(sourceLine.x2 + 16);
    expect(line.y2).toBe(sourceLine.y2 + 16);
    expect(copy.hasComponent(LineAttachmentComponent)).toBe(false);

    // The copy must stay put next frame (nothing re-pins it).
    frame();
    expect(line.x1).toBe(sourceLine.x1 + 16);
  });

  it("is a no-op with nothing selected", () => {
    selectAt(4500, 4500); // empty click clears the selection
    const before = whiteboard.saveShapes();
    pressCmdD();
    frame();
    expect(whiteboard.saveShapes()).toBe(before);
  });
});

// All scenes use x >= 5000, clear of shapes left behind by earlier suites.
describe("system design tools", () => {
  function sysPanel(): HTMLDivElement {
    return document.querySelector(".sys-design-panel")!;
  }

  function clickSysToggle() {
    const button = document.querySelector('[data-action="toggle-sys"]') as HTMLButtonElement;
    button.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  }

  it("shows one button per registry entry, in importance order, hidden until SYS is pressed", () => {
    expect(sysPanel().style.display).toBe("none");

    clickSysToggle();
    expect(sysPanel().style.display).toBe("grid");
    const tools = [...sysPanel().querySelectorAll("[data-tool]")]
      .map(btn => (btn as HTMLElement).dataset.tool);
    expect(tools).toEqual(SYSTEM_DESIGN_TOOLS.map(t => t.id));

    clickSysToggle();
    expect(sysPanel().style.display).toBe("none");
  });

  it("drawing with a system design tool creates a rectangle labeled with the tool's name", () => {
    clickMenuTool("client");
    press(5000, 100);
    frame();
    moveTo(5100, 180);
    frame();
    release();
    frame();

    const ids = entityIdsByPrefix("rectangle-");
    const entity = world.getEntity(ids[ids.length - 1])!;
    const rect = entity.getComponent(RectangleComponent);
    expect(rect.x).toBe(5000);
    expect(rect.width).toBe(100);
    expect(entity.getComponent(TextComponent).content).toBe("Client");
    // Auto-reverts to cursor with the fresh shape selected, like any draw.
    expect(toolStateComp().currentTool).toBe("cursor");
    expect(selectionComp().hasEntity(entity)).toBe(true);
  });

  it("every registered tool stamps its own label", () => {
    SYSTEM_DESIGN_TOOLS.forEach((tool, i) => {
      clickMenuTool(tool.id);
      const x = 5000 + i * 200;
      press(x, 300);
      frame();
      moveTo(x + 100, 380);
      frame();
      release();
      frame();
      const ids = entityIdsByPrefix("rectangle-");
      const entity = world.getEntity(ids[ids.length - 1])!;
      expect(entity.getComponent(TextComponent).content).toBe(tool.label);
    });
  });

  it("the plain rectangle tool still draws without a label", () => {
    const entity = drawRectangle(5000, 500, 5100, 600);
    expect(entity.hasComponent(TextComponent)).toBe(false);
  });
});

describe("menu hover feedback", () => {
  function over(el: Element) {
    el.dispatchEvent(new window.MouseEvent("mouseover", { bubbles: true }));
  }
  function out(el: Element) {
    el.dispatchEvent(new window.MouseEvent("mouseout", { bubbles: true }));
  }
  function menuButton(tool: string): HTMLButtonElement {
    return document.querySelector(`[data-tool="${tool}"]`)!;
  }

  it("tints a resting button light grey on mouseover and clears it on mouseout", () => {
    const btn = menuButton("circle");
    expect(btn.style.background).toBe("transparent");

    over(btn);
    expect(btn.style.background).not.toBe("transparent");

    out(btn);
    expect(btn.style.background).toBe("transparent");
  });

  it("SYS panel buttons get the hover tint too", () => {
    const btn = menuButton("client");
    over(btn);
    expect(btn.style.background).not.toBe("transparent");
    out(btn);
    expect(btn.style.background).toBe("transparent");
  });

  it("leaves the active tool's highlight alone", () => {
    clickMenuTool("rectangle");
    const btn = menuButton("rectangle");
    const activeBg = btn.style.background;
    expect(activeBg).not.toBe("transparent");

    over(btn);
    expect(btn.style.background).toBe(activeBg);
    out(btn);
    expect(btn.style.background).toBe(activeBg);

    clickMenuTool("cursor"); // restore for any later suite
  });

  it("clicking a hovered button keeps its active highlight after mouseout", () => {
    const btn = menuButton("line");
    over(btn);
    clickMenuTool("line"); // click while still hovered
    out(btn);
    expect(btn.style.background).not.toBe("transparent"); // still the active tint

    clickMenuTool("cursor");
  });
});

// Draws a line via the real two-click tool flow and returns its entity.
function drawLineShape(x1: number, y1: number, x2: number, y2: number): Entity {
  setTool("line");
  press(x1, y1);
  frame();
  release();
  frame();
  moveTo(x2, y2);
  frame();
  press(x2, y2);
  frame();
  release();
  frame();
  const ids = entityIdsByPrefix("line-");
  return world.getEntity(ids[ids.length - 1])!;
}

describe("properties panel", () => {
  function panel(): HTMLDivElement {
    return document.querySelector(".properties-panel") as HTMLDivElement;
  }

  function clickPanel(selector: string) {
    const btn = panel().querySelector(selector) as HTMLButtonElement;
    expect(btn).toBeTruthy();
    btn.dispatchEvent(new window.MouseEvent("click", { bubbles: true }));
  }

  function clearSelection() {
    setTool("cursor");
    press(950, 750);
    frame();
    release();
    frame();
  }

  it("appears 40px above a freshly drawn rectangle with fill/stroke popovers", () => {
    drawRectangle(700, 300, 800, 360);

    expect(panel().style.display).toBe("flex");
    // Compact icon bar: fill + stroke items; swatches live in popovers.
    expect(panel().querySelectorAll('[data-item]').length).toBe(2);
    clickPanel('[data-item="fill"]');
    expect(panel().querySelectorAll('[data-prop="fill"]').length).toBe(PALETTE.length);
    expect(panel().querySelector('[data-prop="fill"][data-color="none"]')).toBeTruthy();
    // Stroke popover excludes 'none' (undefined stroke renders as default).
    clickPanel('[data-item="stroke"]');
    expect(panel().querySelectorAll('[data-prop="stroke"]').length).toBe(PALETTE.length - 1);
    expect(panel().querySelector('[data-prop="stroke"][data-color="none"]')).toBeNull();
    // 48 is the panel's fixed height.
    expect(parseFloat(panel().style.top)).toBe(300 - 40 - 48);

    clearSelection();
    expect(panel().style.display).toBe("none");
  });

  it("flips below the shape when there is no room above", () => {
    drawRectangle(700, 10, 780, 60);

    expect(panel().style.display).toBe("flex");
    expect(parseFloat(panel().style.top)).toBe(60 + 40);

    clearSelection();
  });

  it("hides during a drag gesture and returns on release", () => {
    drawRectangle(700, 400, 780, 460);
    expect(panel().style.display).toBe("flex");

    press(740, 430);
    frame();
    expect(panel().style.display).toBe("none");

    release();
    frame();
    expect(panel().style.display).toBe("flex");

    clearSelection();
  });

  it("changes fill/stroke via swatches, one undo step each, no-op on re-click", () => {
    const entity = drawRectangle(700, 500, 780, 560);
    const comp = entity.getComponent(RectangleComponent);
    // The canonical hex draw defaults.
    expect(comp.fillColor).toBe(DEFAULT_FILL);
    expect(comp.strokeColor).toBe(DEFAULT_STROKE);

    const red = PALETTE.find((e) => e.id === "coral-red")!.hex!;
    const blue = PALETTE.find((e) => e.id === "medium-blue")!.hex!;

    clickPanel('[data-item="fill"]');
    // The default fill lights up its swatch.
    const whiteFill = panel().querySelector(`[data-prop="fill"][data-color="${DEFAULT_FILL}"]`) as HTMLElement;
    expect(whiteFill.style.border).toContain("2px");

    clickPanel('[data-item="stroke"]');
    clickPanel(`[data-prop="stroke"][data-color="${red}"]`);
    expect(comp.strokeColor).toBe(red);
    // Re-clicking the active swatch adds no undo step.
    clickPanel(`[data-prop="stroke"][data-color="${red}"]`);
    clickPanel('[data-item="fill"]');
    clickPanel(`[data-prop="fill"][data-color="${blue}"]`);
    expect(comp.fillColor).toBe(blue);

    whiteboard.undo();
    expect(comp.fillColor).toBe(DEFAULT_FILL);
    expect(comp.strokeColor).toBe(red);
    whiteboard.undo();
    expect(comp.strokeColor).toBe(DEFAULT_STROKE);

    clearSelection();
  });

  it("clears the fill via the 'none' swatch and highlights it", () => {
    const entity = drawRectangle(830, 300, 890, 350);
    const comp = entity.getComponent(RectangleComponent);

    clickPanel('[data-item="fill"]');
    clickPanel('[data-prop="fill"][data-color="none"]');
    // 'none' stores the ABSENT key, JSON-identical to a never-filled shape.
    expect(comp.fillColor).toBeUndefined();
    frame();
    const noneSwatch = panel().querySelector('[data-prop="fill"][data-color="none"]') as HTMLElement;
    expect(noneSwatch.style.border).toContain("2px");

    // Re-click is a no-op: no state change, no snapshot change.
    const before = whiteboard.saveShapes();
    clickPanel('[data-prop="fill"][data-color="none"]');
    expect(whiteboard.saveShapes()).toBe(before);

    whiteboard.undo();
    expect(comp.fillColor).toBe(DEFAULT_FILL);
    clearSelection();
  });

  it("commits stroke thickness on slider change; level 1 stores the absent key", () => {
    const entity = drawRectangle(830, 400, 890, 450);
    const comp = entity.getComponent(RectangleComponent);

    clickPanel('[data-item="stroke"]');
    const slider = panel().querySelector('input[data-slider="stroke-width"]') as HTMLInputElement;
    expect(slider).toBeTruthy();
    slider.value = "3";
    slider.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(comp.strokeWidth).toBe(4); // level 3 -> world width 4

    // Same-value change is a no-op (no phantom action).
    const before = whiteboard.saveShapes();
    slider.dispatchEvent(new window.Event("change", { bubbles: true }));
    expect(whiteboard.saveShapes()).toBe(before);

    whiteboard.undo();
    expect(comp.strokeWidth).toBeUndefined(); // absent = width 1
    clearSelection();
  });

  it("changes a line's stroke color via its Stroke popover", () => {
    const entity = drawLineShape(830, 500, 930, 500);
    const comp = entity.getComponent(LineComponent);
    const green = PALETTE.find((e) => e.id === "forest-green")!.hex!;

    clickPanel('[data-item="stroke"]');
    clickPanel(`[data-prop="stroke"][data-color="${green}"]`);
    expect(comp.strokeColor).toBe(green);

    whiteboard.undo();
    expect(comp.strokeColor).toBe(DEFAULT_STROKE);
    clearSelection();
  });

  it("commits stroke style; solid stores the absent key", () => {
    const entity = drawRectangle(830, 630, 890, 680);
    const comp = entity.getComponent(RectangleComponent);

    clickPanel('[data-item="stroke"]');
    clickPanel('[data-stroke-style="dashed"]');
    expect(comp.strokeStyle).toBe("dashed");

    // Same-value click is a no-op (no phantom action).
    const before = whiteboard.saveShapes();
    clickPanel('[data-stroke-style="dashed"]');
    expect(whiteboard.saveShapes()).toBe(before);

    clickPanel('[data-stroke-style="solid"]');
    expect(comp.strokeStyle).toBeUndefined();

    whiteboard.undo();
    expect(comp.strokeStyle).toBe("dashed");
    whiteboard.undo();
    expect(comp.strokeStyle).toBeUndefined();
    clearSelection();
  });

  it("closes the popover on Escape and on outside mousedown", () => {
    drawRectangle(830, 560, 890, 610);

    clickPanel('[data-item="fill"]');
    const popover = panel().querySelector(".properties-popover") as HTMLElement;
    expect(popover.style.display).toBe("block");

    document.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(popover.style.display).toBe("none");

    clickPanel('[data-item="fill"]');
    expect(popover.style.display).toBe("block");
    document.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    expect(popover.style.display).toBe("none");

    clearSelection();
  });

  it("shows Start/End arrow controls for a line and serializes arrow toggles canonically", () => {
    const entity = drawLineShape(700, 650, 820, 650);
    const comp = entity.getComponent(LineComponent);
    expect(panel().style.display).toBe("flex");
    // Line bar: Stroke + Start + End items; the caps live in popovers.
    expect(panel().querySelectorAll('[data-item]').length).toBe(3);

    const preArrow = whiteboard.saveShapes();
    clickPanel('[data-item="end"]');
    expect(panel().querySelectorAll("[data-arrow]").length).toBe(2);
    clickPanel('[data-lineend="end"][data-arrow="arrow"]');
    expect(comp.arrowEnd).toBe("arrow");
    expect(comp.arrowStart).toBeUndefined();
    const saved = whiteboard.saveShapes();
    expect(saved).toContain('"arrowEnd":"arrow"');

    // Byte-stable load -> save roundtrip.
    whiteboard.loadShapes(saved);
    expect(whiteboard.saveShapes()).toBe(saved);

    // loadShapes cleared the selection - reselect the line by clicking it.
    setTool("cursor");
    press(760, 650);
    frame();
    release();
    frame();
    expect(selectionComp().entities.size).toBe(1);

    // Toggling back to None stores undefined: byte-identical to pre-arrow.
    // (Reselection rebuilt the bar, so reopen the End popover.)
    clickPanel('[data-item="end"]');
    clickPanel('[data-lineend="end"][data-arrow="none"]');
    expect(entity.getComponent(LineComponent).arrowEnd).toBeUndefined();
    expect(whiteboard.saveShapes()).toBe(preArrow);

    clearSelection();
  });

  it("duplicateSelection copies arrow settings", () => {
    const entity = drawLineShape(700, 700, 800, 700);
    clickPanel('[data-item="start"]');
    clickPanel('[data-lineend="start"][data-arrow="arrow"]');
    expect(entity.getComponent(LineComponent).arrowStart).toBe("arrow");

    whiteboard.duplicateSelection();
    frame();

    const dupIds = entityIdsByPrefix("duplicate-");
    const dup = world.getEntity(dupIds[dupIds.length - 1])!.getComponent(LineComponent);
    expect(dup.arrowStart).toBe("arrow");
    expect(dup.arrowEnd).toBeUndefined();

    clearSelection();
  });
});

// Inflated-bbox snapping scenes live at x >= 3000, clear of every shape left
// behind by the earlier suites (no leftover inflated bbox reaches this range).
describe("inflated-bbox connection snapping", () => {
  beforeEach(() => {
    // Earlier suites (properties panel) leave the camera panned; restore the
    // identity camera so screen == world coordinates hold here.
    const cam = cameraComp();
    cam.x = 0;
    cam.y = 0;
    cam.scale = 1;
  });

  function selectAt(x: number, y: number) {
    setTool("cursor");
    press(x, y);
    frame();
    release();
    frame();
  }

  it("snaps from the inflation margin, beyond the old per-dot radius", () => {
    const a = drawRectangle(3000, 100, 3100, 200);
    const b = drawRectangle(3200, 100, 3300, 200);
    selectAt(3050, 150); // drawing B stole the selection; re-select A
    expect(selectionComp().hasEntity(a)).toBe(true);

    // 10px right of B's east edge: inside the 12px-inflated bbox, but
    // ~22.4px from the nearest dot e(3300,150) - the old per-dot rule would
    // not have snapped here.
    press(3100, 150);
    frame();
    moveTo(3310, 130);
    frame();

    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(3300);
    expect(line.y2).toBe(150);
    expect(selectionComp().connectionSnap).toEqual({ entityId: b.id, handleId: "e" });

    release();
    frame();
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: b.id, handleId: "e" });
  });

  it("snaps to the nearest dot while hovering a shape's body", () => {
    const b2 = drawRectangle(3200, 300, 3300, 400);
    selectAt(3050, 150); // re-select A from the previous test
    press(3100, 150);
    frame();
    moveTo(3290, 350); // interior of B2; nearest dot is e(3300,350) at 10px
    frame();

    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(3300);
    expect(line.y2).toBe(350);
    expect(selectionComp().connectionSnap).toEqual({ entityId: b2.id, handleId: "e" });

    release();
    frame();
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: b2.id, handleId: "e" });
    expect(selectionComp().connectionSnap).toBeNull();
  });

  it("prefers the topmost shape when the cursor is inside two overlapping shapes", () => {
    drawRectangle(3200, 600, 3300, 700); // R1
    const r2 = drawRectangle(3250, 650, 3350, 750); // R2, drawn later = topmost
    selectAt(3050, 150); // re-select A
    press(3100, 150);
    frame();
    moveTo(3270, 660); // inside both rects; R2's nearest dot is n(3300,650)
    frame();

    expect(selectionComp().connectionSnap).toEqual({ entityId: r2.id, handleId: "n" });

    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: r2.id, handleId: "n" });
  });

  it("re-attaches a dragged endpoint to another shape and keeps it pinned", () => {
    const d = drawRectangle(3000, 900, 3100, 1000);
    const c = drawRectangle(3400, 900, 3500, 1000);
    selectAt(3050, 950);
    expect(selectionComp().hasEntity(d)).toBe(true);

    // Dangling line into open space; the fresh line is auto-selected.
    press(3100, 950);
    frame();
    moveTo(3250, 950);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    expect(lineEntity.getComponent(LineAttachmentComponent).end).toBeNull();

    // Grab the dangling 'end' handle and drag into C; nearest dot n(3450,900).
    press(3250, 950);
    frame();
    moveTo(3450, 920);
    frame();
    expect(selectionComp().connectionSnap).toEqual({ entityId: c.id, handleId: "n" });
    expect(line.x2).toBe(3450);
    expect(line.y2).toBe(900);

    release();
    frame();
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: c.id, handleId: "n" });
    expect(selectionComp().connectionSnap).toBeNull();

    // The pin is live: dragging C moves the endpoint with it.
    selectAt(3430, 970);
    expect(selectionComp().hasEntity(c)).toBe(true);
    press(3430, 970);
    frame();
    moveTo(3430, 1000);
    frame();
    release();
    frame();
    expect(line.x2).toBe(3450);
    expect(line.y2).toBe(930);
  });

  it("creates the attachment component when a plain line's endpoint is dropped on a shape", () => {
    const e = drawRectangle(3300, 1150, 3400, 1250);
    const lineEntity = drawLineShape(3000, 1200, 3100, 1250);
    expect(lineEntity.hasComponent(LineAttachmentComponent)).toBe(false);
    expect(selectionComp().hasEntity(lineEntity)).toBe(true);

    // Grab the free end and drop it inside E; nearest dot e(3400,1200).
    press(3100, 1250);
    frame();
    moveTo(3360, 1200);
    frame();
    release();
    frame();

    const attachment = lineEntity.getComponent(LineAttachmentComponent);
    expect(attachment.start).toBeNull();
    expect(attachment.end).toEqual({ entityId: e.id, handleId: "e" });
    const line = lineEntity.getComponent(LineComponent);
    expect(line.x2).toBe(3400);
    expect(line.y2).toBe(1200);
  });

  it("does not snap the endpoint to the shape its other end is attached to", () => {
    const f = drawRectangle(3000, 1400, 3100, 1500);
    selectAt(3050, 1450);
    expect(selectionComp().hasEntity(f)).toBe(true);

    // Dangling line out of F's east dot.
    press(3100, 1450);
    frame();
    moveTo(3250, 1450);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);
    expect(lineEntity.getComponent(LineAttachmentComponent).start)
      .toEqual({ entityId: f.id, handleId: "e" });

    // Drag the free end back inside F: excluded, so it never snaps.
    press(3250, 1450);
    frame();
    moveTo(3050, 1450);
    frame();
    expect(selectionComp().connectionSnap).toBeNull();
    expect(line.x2).toBe(3050);

    release();
    frame();
    expect(lineEntity.getComponent(LineAttachmentComponent).end).toBeNull();
    expect(line.x2).toBe(3050);
    expect(line.y2).toBe(1450);
  });

  it("re-attaching in place records no extra undo step", () => {
    const g = drawRectangle(3000, 1600, 3100, 1700);
    const h = drawRectangle(3300, 1600, 3400, 1700);
    selectAt(3050, 1650);
    expect(selectionComp().hasEntity(g)).toBe(true);

    // Connect G.e -> H.w via the inflation margin.
    press(3100, 1650);
    frame();
    moveTo(3310, 1650);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineId = ids[ids.length - 1];
    const lineEntity = world.getEntity(lineId)!;
    const attachment = lineEntity.getComponent(LineAttachmentComponent);
    expect(attachment.end).toEqual({ entityId: h.id, handleId: "w" });

    // Grab the attached endpoint and release without moving: it re-snaps to
    // the same point, so the snapshot dedups and no undo step is recorded.
    press(3300, 1650);
    frame();
    release();
    frame();
    const line = lineEntity.getComponent(LineComponent);
    expect(attachment.end).toEqual({ entityId: h.id, handleId: "w" });
    expect(line.x2).toBe(3300);
    expect(line.y2).toBe(1650);

    // One undo steps past the whole connection (proof the in-place gesture
    // inserted no snapshot); redo restores the attached line.
    whiteboard.undo();
    frame();
    expect(world.getEntity(lineId)).toBeUndefined();
    whiteboard.redo();
    frame();
    expect(world.getEntity(lineId)!.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: h.id, handleId: "w" });
  });

  it("undoes and redoes an endpoint re-attach as one step", () => {
    drawRectangle(3000, 1800, 3100, 1900);
    const j = drawRectangle(3300, 1800, 3400, 1900);
    selectAt(3050, 1850);

    // Dangling line into open space.
    press(3100, 1850);
    frame();
    moveTo(3200, 1850);
    frame();
    release();
    frame();
    const ids = entityIdsByPrefix("connection-line-");
    const lineEntity = world.getEntity(ids[ids.length - 1])!;
    const line = lineEntity.getComponent(LineComponent);

    // Re-attach the free end inside J; nearest dot e(3400,1850).
    press(3200, 1850);
    frame();
    moveTo(3360, 1850);
    frame();
    release();
    frame();
    const attachment = lineEntity.getComponent(LineAttachmentComponent);
    expect(attachment.end).toEqual({ entityId: j.id, handleId: "e" });
    expect(line.x2).toBe(3400);

    // Exactly one step: a single undo restores the dangling state, a single
    // redo restores the attachment.
    whiteboard.undo();
    frame();
    expect(lineEntity.getComponent(LineAttachmentComponent).end).toBeNull();
    expect(line.x2).toBe(3200);
    expect(line.y2).toBe(1850);

    whiteboard.redo();
    frame();
    expect(lineEntity.getComponent(LineAttachmentComponent).end)
      .toEqual({ entityId: j.id, handleId: "e" });
    expect(line.x2).toBe(3400);
    expect(line.y2).toBe(1850);
  });
});
