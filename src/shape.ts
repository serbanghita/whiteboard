/**
 * Shape-agnostic helpers over the three drawable components.
 * Interaction systems (hover, selection, drag) use these so they work for
 * every shape type instead of special-casing rectangles.
 */
import { Entity } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "./component/RectangleComponent";
import CircleComponent from "./component/CircleComponent";
import LineComponent from "./component/LineComponent";
import { pointInRectangle, pointInCircle, pointOnLine } from "./collision";

// A line has no area, so hits count within this distance of the segment.
export const LINE_HIT_TOLERANCE = 5;

export interface Bounds {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Point-in-shape test in world coordinates. `scale` is the camera zoom; the
 * line tolerance is a screen-pixel affordance, so it is divided by the scale
 * to stay a constant grab distance on screen at any zoom.
 */
export function hitTestEntity(entity: Entity, x: number, y: number, scale: number = 1): boolean {
  if (entity.hasComponent(RectangleComponent)) {
    const comp = entity.getComponent(RectangleComponent);
    return pointInRectangle(x, y, comp.x, comp.y, comp.width, comp.height);
  }
  if (entity.hasComponent(CircleComponent)) {
    const comp = entity.getComponent(CircleComponent);
    return pointInCircle(x, y, comp.x, comp.y, comp.radius);
  }
  if (entity.hasComponent(LineComponent)) {
    const comp = entity.getComponent(LineComponent);
    return pointOnLine(x, y, comp.x1, comp.y1, comp.x2, comp.y2, LINE_HIT_TOLERANCE / scale);
  }
  return false;
}

export function getEntityBounds(entity: Entity): Bounds | null {
  if (entity.hasComponent(RectangleComponent)) {
    const comp = entity.getComponent(RectangleComponent);
    return { x: comp.x, y: comp.y, width: comp.width, height: comp.height };
  }
  if (entity.hasComponent(CircleComponent)) {
    const comp = entity.getComponent(CircleComponent);
    return { x: comp.x - comp.radius, y: comp.y - comp.radius, width: comp.radius * 2, height: comp.radius * 2 };
  }
  if (entity.hasComponent(LineComponent)) {
    const comp = entity.getComponent(LineComponent);
    const x = Math.min(comp.x1, comp.x2);
    const y = Math.min(comp.y1, comp.y2);
    return { x, y, width: Math.abs(comp.x2 - comp.x1), height: Math.abs(comp.y2 - comp.y1) };
  }
  return null;
}

export function moveEntityBy(entity: Entity, deltaX: number, deltaY: number): void {
  if (entity.hasComponent(RectangleComponent)) {
    const comp = entity.getComponent(RectangleComponent);
    comp.x += deltaX;
    comp.y += deltaY;
  } else if (entity.hasComponent(CircleComponent)) {
    const comp = entity.getComponent(CircleComponent);
    comp.x += deltaX;
    comp.y += deltaY;
  } else if (entity.hasComponent(LineComponent)) {
    const comp = entity.getComponent(LineComponent);
    comp.x1 += deltaX;
    comp.y1 += deltaY;
    comp.x2 += deltaX;
    comp.y2 += deltaY;
  }
}
