import { Entity, World } from "@serbanghita-gamedev/ecs";
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

  toolEntity.getComponent(ToolStateComponent).currentTool = 'cursor';

  const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);
  selectionComp.clear();
  selectionComp.addEntity(entity);
}
