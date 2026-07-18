import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import { getEntityBounds } from "../shape";

// The selection rectangle hugs the selected shapes' bounds exactly; the
// corner handles drawn by RenderSystem sit on the box corners.
const SELECTION_PADDING = 0;

/**
 * SelectionSystem maintains the selection entity's bounding RectangleComponent:
 * the union of the bounds of all selected shapes (any shape type), padded.
 *
 * @todo Resize handles on the selection rectangle (edge hit-zones + cursor
 * feedback + a ResizeSystem mutating the selected shapes' dimensions).
 */
export default class SelectionSystem extends System {
  public constructor(
    public world: World,
    public query: Query
  ) {
    super(world, query);
  }

  public update(now: number): void {
    this.query.execute().forEach((entity) => {
      const selectionComp = entity.getComponent(SelectionRectangleComponent);

      if (!selectionComp.isDirty) {
        return;
      }
      selectionComp.isDirty = false;

      if (entity.hasComponent(RectangleComponent)) {
        entity.removeComponent(RectangleComponent);
      }

      // Union of bounds over all selected entities.
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      selectionComp.entities.forEach((selectedEntity) => {
        const bounds = getEntityBounds(selectedEntity);
        if (!bounds) {
          return;
        }
        minX = Math.min(minX, bounds.x);
        minY = Math.min(minY, bounds.y);
        maxX = Math.max(maxX, bounds.x + bounds.width);
        maxY = Math.max(maxY, bounds.y + bounds.height);
      });

      if (minX === Infinity) {
        // Nothing (with bounds) is selected - no selection rectangle.
        return;
      }

      entity.addComponent(RectangleComponent, {
        x: minX - SELECTION_PADDING,
        y: minY - SELECTION_PADDING,
        width: maxX - minX + SELECTION_PADDING * 2,
        height: maxY - minY + SELECTION_PADDING * 2
      });
    });
  }
}
