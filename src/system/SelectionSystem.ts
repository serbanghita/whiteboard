import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import { Point } from "@serbanghita-gamedev/geometry";
import { updateCanvasCursor } from "../render";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import MouseComponent from "../component/MouseComponent";

export default class SelectionSystem extends System {
  public constructor(
    public world: World,
    public query: Query
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    this.query.execute().forEach((entity) => {
      const selectionComp = entity.getComponent(SelectionRectangleComponent);

      // If selection is empty, exit.
      if (selectionComp.entities.size === 0) {
        if (selectionComp.isDirty) {
          if (entity.hasComponent(RectangleComponent)) {
            entity.removeComponent(RectangleComponent);
          }
          selectionComp.isDirty = false;
        }
        return;
      }

      // Compute the new RectangleComponent.
      if (selectionComp.isDirty) {
        if (entity.hasComponent(RectangleComponent)) {
          entity.removeComponent(RectangleComponent);
        }

        // Get the first entity (for now).
        // @todo: Add support to draw selection over multiple entities.
        const [, selectedEntity] = selectionComp.entities.entries().next().value as [string, Entity];
        const selectedEntityRectComp = selectedEntity.getComponent(RectangleComponent);

        // Add updated "Rectangle" to the "Selection".
        entity.addComponent(RectangleComponent, {
          x: selectedEntityRectComp.center.x, y: selectedEntityRectComp.center.y,
          width: selectedEntityRectComp.width + 16, height: selectedEntityRectComp.height + 16
        });

        selectionComp.isDirty = false;
      }

      let selectionRectComp = entity.getComponent(RectangleComponent);

      // If not in the padded area of the rect, don't bother to check
      if (!selectionRectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
        return;
      }

      // if (entity.hasComponent(HasRectangleContext)) {
      //   const contextComp = entity.getComponent(HasRectangleContext);
      //   if (contextComp.properties.rightConnCircle.intersectsWithPoint(point)) {
      //     console.log('rightConnPoint');
      //     updateCanvasCursor('cell');
      //     return;
      //   }
      // }

      // if (point.x >= rect.topLeftX - RESIZE_HANDLE_AREA_TOLERANCE && point.x <= rect.topLeftX + RESIZE_HANDLE_AREA_TOLERANCE) {
      //   resizeHandle = ResizeHandle.LEFT;
      //   updateCanvasCursor('ew-resize');
      //   isMouseInTheResizingZone = true;
      // } else if (point.x >= rect.topRightX - RESIZE_HANDLE_AREA_TOLERANCE && point.x <= rect.topRightX + RESIZE_HANDLE_AREA_TOLERANCE) {
      //   resizeHandle = ResizeHandle.RIGHT;
      //   updateCanvasCursor('ew-resize');
      //   isMouseInTheResizingZone = true;
      // } else if (point.y >= rect.topLeftY - RESIZE_HANDLE_AREA_TOLERANCE && point.y <= rect.topLeftY + RESIZE_HANDLE_AREA_TOLERANCE) {
      //   resizeHandle = ResizeHandle.TOP;
      //   updateCanvasCursor('ns-resize');
      //   isMouseInTheResizingZone = true;
      // } else if (point.y >= rect.bottomLeftY - RESIZE_HANDLE_AREA_TOLERANCE && point.y <= rect.bottomLeftY + RESIZE_HANDLE_AREA_TOLERANCE) {
      //   resizeHandle = ResizeHandle.BOTTOM;
      //   updateCanvasCursor('ns-resize');
      //   isMouseInTheResizingZone = true;
      // } else {
      //   updateCanvasCursor('auto');
      //   isMouseInTheResizingZone = false;
      // }
    });
  }
}