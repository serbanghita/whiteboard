/**
 * Selection handle geometry, shared by RenderSystem (drawing) and
 * ResizeSystem (hit-testing) so the grabbable spots always match the visuals.
 */
import { Entity, World } from "@serbanghita-gamedev/ecs";
import SelectionRectangleComponent from "./component/SelectionRectangleComponent";
import RectangleComponent from "./component/RectangleComponent";
import CircleComponent from "./component/CircleComponent";
import LineComponent from "./component/LineComponent";
import { getEntityBounds } from "./shape";

export type HandleId = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' | 'start' | 'end';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export const HANDLE_RADIUS = 6;
// Slightly larger than the visual radius so handles are easy to grab.
export const HANDLE_HIT_RADIUS = 8;
// More forgiving than HANDLE_HIT_RADIUS: snapping a line endpoint onto a
// connection point should attract from a distance, not require pixel aim.
export const CONNECTION_SNAP_RADIUS = 12;

/**
 * The current selection's handles: bounding-box corners, or the two
 * endpoints for a single selected line. Empty when nothing is selected.
 */
export function getSelectionHandles(world: World): Handle[] {
  const selectionEntity = world.getEntity('selection');
  if (!selectionEntity || !selectionEntity.hasComponent(SelectionRectangleComponent)) {
    return [];
  }

  const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
  if (selectionComp.entities.size === 0) {
    return [];
  }

  if (selectionComp.entities.size === 1) {
    const [selected] = selectionComp.entities.values();
    if (selected.hasComponent(LineComponent)) {
      const line = selected.getComponent(LineComponent);
      return [
        { id: 'start', x: line.x1, y: line.y1 },
        { id: 'end', x: line.x2, y: line.y2 },
      ];
    }
  }

  // The tight union bounding box maintained by SelectionSystem.
  if (!selectionEntity.hasComponent(RectangleComponent)) {
    return [];
  }
  const bounds = selectionEntity.getComponent(RectangleComponent);
  return [
    { id: 'nw', x: bounds.x, y: bounds.y },
    { id: 'ne', x: bounds.x + bounds.width, y: bounds.y },
    { id: 'sw', x: bounds.x, y: bounds.y + bounds.height },
    { id: 'se', x: bounds.x + bounds.width, y: bounds.y + bounds.height },
    { id: 'n', x: bounds.x + bounds.width / 2, y: bounds.y },
    { id: 'e', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { id: 's', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { id: 'w', x: bounds.x, y: bounds.y + bounds.height / 2 },
  ];
}

/**
 * The handle under a world-space point, if any. `scale` is the camera zoom;
 * handles are drawn at a constant screen size, so the hit radius is divided
 * by the scale to keep matching the visuals.
 */
export function handleAtPoint(world: World, x: number, y: number, scale: number = 1): Handle | null {
  const hitRadius = HANDLE_HIT_RADIUS / scale;
  for (const handle of getSelectionHandles(world)) {
    const dx = x - handle.x;
    const dy = y - handle.y;
    if (dx * dx + dy * dy <= hitRadius * hitRadius) {
      return handle;
    }
  }
  return null;
}

/**
 * A shape's connection points: the n/e/s/w midpoints of its bounding box
 * (for a circle these lie on the circle itself). Unlike getSelectionHandles
 * this works for any rectangle/circle entity, selected or not - it's how
 * snap targets on other shapes are found. Empty for lines and non-shapes.
 */
export function getConnectionPoints(entity: Entity): Handle[] {
  if (!entity.hasComponent(RectangleComponent) && !entity.hasComponent(CircleComponent)) {
    return [];
  }
  const bounds = getEntityBounds(entity);
  if (!bounds) {
    return [];
  }
  return [
    { id: 'n', x: bounds.x + bounds.width / 2, y: bounds.y },
    { id: 'e', x: bounds.x + bounds.width, y: bounds.y + bounds.height / 2 },
    { id: 's', x: bounds.x + bounds.width / 2, y: bounds.y + bounds.height },
    { id: 'w', x: bounds.x, y: bounds.y + bounds.height / 2 },
  ];
}

/**
 * The nearest connection point within CONNECTION_SNAP_RADIUS (screen px,
 * divided by the camera scale) of a world-space point. Nearest wins so
 * overlapping shapes behave predictably. excludeEntityId skips the shape a
 * connection line is being drawn from (no self-loops).
 */
export function connectionPointNear(
  candidates: Iterable<Entity>,
  x: number,
  y: number,
  scale: number,
  excludeEntityId: string | null,
): { entity: Entity; handle: Handle } | null {
  const snapRadius = CONNECTION_SNAP_RADIUS / scale;
  let best: { entity: Entity; handle: Handle } | null = null;
  let bestDistSq = snapRadius * snapRadius;
  for (const entity of candidates) {
    if (entity.id === excludeEntityId) {
      continue;
    }
    for (const handle of getConnectionPoints(entity)) {
      const dx = x - handle.x;
      const dy = y - handle.y;
      const distSq = dx * dx + dy * dy;
      if (distSq <= bestDistSq) {
        best = { entity, handle };
        bestDistSq = distSq;
      }
    }
  }
  return best;
}
