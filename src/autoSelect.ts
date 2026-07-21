import { Entity, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "./component/MouseComponent";
import SelectionRectangleComponent from "./component/SelectionRectangleComponent";
import ToolStateComponent from "./component/ToolStateComponent";

/**
 * Called by the draw systems right after a shape is successfully finalized.
 * Switches to the cursor tool with the fresh shape selected, so its handles
 * show immediately and the user can drag it without reaching for the menu.
 */
export function autoSelectFreshShape(world: World, entity: Entity): void {
  const toolEntity = world.getEntity('tool');
  const selectionEntity = world.getEntity('selection');
  if (!toolEntity || !selectionEntity) {
    return;
  }

  const toolComp = toolEntity.getComponent(ToolStateComponent);
  toolComp.currentTool = 'cursor';

  // A draw that commits on a press edge (two-click lines) switches to the
  // cursor tool mid-frame, BEFORE Resize/Connection/MousePress/Drag run and
  // see that same press landing on the fresh shape's handles - ResizeSystem
  // would claim the endpoint and snap it away. Suppress the committing press
  // for its entire hold, the same idiom as a text-edit click-away commit.
  // Release-edge commits (rect/circle/connection) stamp an already-released
  // count, which no later press can match.
  const cursorEntity = world.getEntity('cursor');
  if (cursorEntity && cursorEntity.hasComponent(MouseComponent)) {
    toolComp.suppressedPressCount = cursorEntity.getComponent(MouseComponent).pressCount;
  }

  const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
  selectionComp.clear();
  selectionComp.addEntity(entity);
}
