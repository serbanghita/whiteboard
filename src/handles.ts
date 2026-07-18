/**
 * Selection handle geometry, shared by RenderSystem (drawing) and
 * ResizeSystem (hit-testing) so the grabbable spots always match the visuals.
 */
import { World } from "@serbanghita-gamedev/ecs";
import SelectionRectangleComponent from "./component/SelectionRectangleComponent";
import RectangleComponent from "./component/RectangleComponent";
import LineComponent from "./component/LineComponent";

export type HandleId = 'nw' | 'ne' | 'sw' | 'se' | 'n' | 'e' | 's' | 'w' | 'start' | 'end';

export interface Handle {
  id: HandleId;
  x: number;
  y: number;
}

export const HANDLE_RADIUS = 6;
// Slightly larger than the visual radius so handles are easy to grab.
export const HANDLE_HIT_RADIUS = 8;

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
