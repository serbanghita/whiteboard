/**
 * Pure camera-math tests: screen<->world transforms, zoom-at-cursor anchor
 * invariant, clamping, and applyWheel's zoom/pan routing + mouse world-coord
 * recompute. No DOM involved.
 */
import { describe, it, expect } from "vitest";
import {
  CameraState,
  MIN_ZOOM,
  MAX_ZOOM,
  screenToWorld,
  worldToScreen,
  zoomCameraAt,
  panCamera,
  applyWheel,
} from "../camera";
import MouseComponent from "../component/MouseComponent";

function cam(x = 0, y = 0, scale = 1): CameraState {
  return { x, y, scale };
}

describe("screenToWorld / worldToScreen", () => {
  it("are identity for the default camera", () => {
    expect(screenToWorld(cam(), 120, 45)).toEqual({ x: 120, y: 45 });
    expect(worldToScreen(cam(), 120, 45)).toEqual({ x: 120, y: 45 });
  });

  it("round-trip at arbitrary offsets and scales", () => {
    const cameras = [cam(10, -20, 0.5), cam(-300, 999, 2), cam(0.25, 0.75, 7.3)];
    for (const c of cameras) {
      const w = screenToWorld(c, 33, 77);
      const s = worldToScreen(c, w.x, w.y);
      expect(s.x).toBeCloseTo(33, 10);
      expect(s.y).toBeCloseTo(77, 10);
    }
  });

  it("maps the camera origin to screen (0, 0)", () => {
    const c = cam(50, 60, 3);
    expect(worldToScreen(c, 50, 60)).toEqual({ x: 0, y: 0 });
    expect(screenToWorld(c, 0, 0)).toEqual({ x: 50, y: 60 });
  });
});

describe("zoomCameraAt", () => {
  it("keeps the world point under the cursor fixed", () => {
    const c = cam(12, -34, 1.7);
    const before = screenToWorld(c, 200, 150);
    zoomCameraAt(c, 200, 150, -120); // zoom in
    const after = screenToWorld(c, 200, 150);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it("zooms in on negative deltaY and out on positive", () => {
    const zoomIn = cam();
    zoomCameraAt(zoomIn, 0, 0, -100);
    expect(zoomIn.scale).toBeGreaterThan(1);

    const zoomOut = cam();
    zoomCameraAt(zoomOut, 0, 0, 100);
    expect(zoomOut.scale).toBeLessThan(1);
  });

  it("clamps to the zoom limits", () => {
    const c = cam();
    for (let i = 0; i < 100; i++) zoomCameraAt(c, 100, 100, -500);
    expect(c.scale).toBe(MAX_ZOOM);
    for (let i = 0; i < 200; i++) zoomCameraAt(c, 100, 100, 500);
    expect(c.scale).toBe(MIN_ZOOM);
  });

  it("keeps the anchor invariant when the clamp kicks in mid-step", () => {
    const c = cam(5, 5, 7.9); // one large zoom-in step will clamp at MAX_ZOOM
    const before = screenToWorld(c, 320, 240);
    zoomCameraAt(c, 320, 240, -1000);
    expect(c.scale).toBe(MAX_ZOOM);
    const after = screenToWorld(c, 320, 240);
    expect(after.x).toBeCloseTo(before.x, 10);
    expect(after.y).toBeCloseTo(before.y, 10);
  });

  it("is a no-op for the camera position at the zoom limit", () => {
    const c = cam(1, 2, MAX_ZOOM);
    zoomCameraAt(c, 100, 100, -100);
    expect(c).toEqual(cam(1, 2, MAX_ZOOM));
  });
});

describe("panCamera", () => {
  it("moves the camera by the screen delta divided by scale", () => {
    const c = cam(10, 20, 2);
    panCamera(c, 30, -10);
    expect(c.x).toBe(25);
    expect(c.y).toBe(15);
    expect(c.scale).toBe(2);
  });
});

describe("applyWheel", () => {
  function mouse(screenX: number, screenY: number): MouseComponent {
    const m = new MouseComponent({ x: 0, y: 0 });
    m.screenX = screenX;
    m.screenY = screenY;
    return m;
  }

  it("zooms at the cursor when ctrlKey is set (trackpad pinch)", () => {
    const c = cam();
    applyWheel(c, mouse(100, 100), { deltaX: 0, deltaY: -120, ctrlKey: true, metaKey: false, offsetX: 100, offsetY: 100 });
    expect(c.scale).toBeGreaterThan(1);
  });

  it("zooms when metaKey is set", () => {
    const c = cam();
    applyWheel(c, mouse(0, 0), { deltaX: 0, deltaY: -120, ctrlKey: false, metaKey: true, offsetX: 0, offsetY: 0 });
    expect(c.scale).toBeGreaterThan(1);
  });

  it("pans on a plain wheel", () => {
    const c = cam(0, 0, 2);
    applyWheel(c, mouse(0, 0), { deltaX: 12, deltaY: 8, ctrlKey: false, metaKey: false, offsetX: 0, offsetY: 0 });
    expect(c).toEqual(cam(6, 4, 2));
  });

  it("re-derives the mouse world position from its screen position", () => {
    const c = cam(0, 0, 1);
    const m = mouse(200, 100);
    m.setXY(200, 100); // world == screen before the camera moves

    applyWheel(c, m, { deltaX: 50, deltaY: -30, ctrlKey: false, metaKey: false, offsetX: 200, offsetY: 100 });

    const expected = screenToWorld(c, 200, 100);
    expect(m.x).toBe(expected.x);
    expect(m.y).toBe(expected.y);
  });

  it("leaves the world-space press anchor untouched", () => {
    const c = cam();
    const m = mouse(200, 100);
    m.press(40, 50);

    applyWheel(c, m, { deltaX: 0, deltaY: -240, ctrlKey: true, metaKey: false, offsetX: 200, offsetY: 100 });

    expect(m.pressX).toBe(40);
    expect(m.pressY).toBe(50);
  });
});
