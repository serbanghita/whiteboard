/**
 * Camera math: the transform between screen space (CSS pixels, what the user
 * sees and clicks) and world space (where shapes live). The camera is
 * {x, y, scale} where (x, y) is the world coordinate of the viewport's
 * top-left corner and scale is screen pixels per world unit.
 *
 * Kept as pure functions (no DOM) so the headless tests can drive zoom/pan
 * the same way index.ts's wheel handler does.
 */
import { World } from "@serbanghita-gamedev/ecs";
import CameraComponent from "./component/CameraComponent";
import MouseComponent from "./component/MouseComponent";

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 8;
export const ZOOM_SENSITIVITY = 0.01;

export interface CameraState {
  x: number;
  y: number;
  scale: number;
}

// The subset of WheelEvent the camera cares about, kept structural so tests
// can pass plain objects.
export interface WheelInput {
  deltaX: number;
  deltaY: number;
  ctrlKey: boolean;
  metaKey: boolean;
  offsetX: number;
  offsetY: number;
}

export function screenToWorld(cam: CameraState, screenX: number, screenY: number): { x: number; y: number } {
  return { x: cam.x + screenX / cam.scale, y: cam.y + screenY / cam.scale };
}

export function worldToScreen(cam: CameraState, worldX: number, worldY: number): { x: number; y: number } {
  return { x: (worldX - cam.x) * cam.scale, y: (worldY - cam.y) * cam.scale };
}

/**
 * Multiplicative zoom from a wheel delta, anchored at screen point
 * (screenX, screenY): the world point under that screen point stays fixed.
 * exp() makes pinch-in/out steps symmetric; x/y are derived from the already
 * clamped scale so the anchor invariant holds exactly at the zoom limits too.
 */
export function zoomCameraAt(cam: CameraState, screenX: number, screenY: number, deltaY: number): void {
  const newScale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, cam.scale * Math.exp(-deltaY * ZOOM_SENSITIVITY)));
  cam.x += screenX / cam.scale - screenX / newScale;
  cam.y += screenY / cam.scale - screenY / newScale;
  cam.scale = newScale;
}

/**
 * Pan by a screen-space wheel delta, divided by scale so pan speed is
 * constant on screen regardless of zoom.
 */
export function panCamera(cam: CameraState, deltaX: number, deltaY: number): void {
  cam.x += deltaX / cam.scale;
  cam.y += deltaY / cam.scale;
}

/**
 * Full wheel semantics: ctrl/cmd+wheel (including trackpad pinch, which
 * browsers deliver as a ctrlKey wheel) zooms at the cursor, plain wheel pans.
 * Afterwards the mouse's world position is re-derived from its last screen
 * position so an in-progress drag or draw preview doesn't go stale
 * mid-gesture. pressX/pressY are world anchors of a past event and must stay
 * untouched.
 */
export function applyWheel(cam: CameraState, mouse: MouseComponent, e: WheelInput): void {
  if (e.ctrlKey || e.metaKey) {
    zoomCameraAt(cam, e.offsetX, e.offsetY, e.deltaY);
  } else {
    panCamera(cam, e.deltaX, e.deltaY);
  }
  const world = screenToWorld(cam, mouse.screenX, mouse.screenY);
  mouse.setXY(world.x, world.y);
}

/** Current camera zoom, or 1 when no camera entity exists (e.g. bare test worlds). */
export function getCameraScale(world: World): number {
  const cameraEntity = world.getEntity('camera');
  if (!cameraEntity || !cameraEntity.hasComponent(CameraComponent)) {
    return 1;
  }
  return cameraEntity.getComponent(CameraComponent).scale;
}
