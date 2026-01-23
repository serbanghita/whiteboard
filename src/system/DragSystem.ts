import { System, Query, World, Entity } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import RectangleComponent from "../component/RectangleComponent";

/**
 * DragSystem handles moving selected entities when the mouse is pressed and dragged.
 *
 * It runs when:
 * - IsMousePressed tag exists on cursor (mouse button is down)
 * - There are selected entities in SelectionRectangleComponent
 * - Mouse has moved (deltaX or deltaY != 0)
 */
export default class DragSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;

    // Only drag when mouse is pressed
    if (!cursor.hasComponent(IsMousePressed)) {
      return;
    }

    const mouseComp = cursor.getComponent(MouseComponent);
    const deltaX = mouseComp.deltaX;
    const deltaY = mouseComp.deltaY;

    // No movement, nothing to drag
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const selectionEntity = this.world.getEntity('selection') as Entity;
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);

    // No selected entities, nothing to drag
    if (selectionComp.entities.size === 0) {
      return;
    }

    // Move all selected entities by the delta
    selectionComp.entities.forEach((entity) => {
      if (entity.hasComponent(RectangleComponent)) {
        const rectComp = entity.getComponent(RectangleComponent);
        rectComp.x += deltaX;
        rectComp.y += deltaY;
      }
    });

    // Mark selection as dirty so SelectionSystem updates the bounding box
    selectionComp.isDirty = true;
  }
}
