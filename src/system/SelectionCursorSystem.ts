import { Query, System, World } from "../../../gamedev/packages/ecs";
import RectangleComponent from "../component/RectangleComponent";
import { Point } from "../../../gamedev/packages/geometry";
import { updateCanvasCursor } from "../render";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";

export default class SelectionCursorSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
    public cursorPoint: Point
  ) {
    super(world, query);
  }

  public update(now: number): void {
    this.query.execute().forEach((entity) => {
      const isSelectionComp = entity.getComponent(SelectionRectangleComponent);
      if (!isSelectionComp) {
        return;
      }
      const rectComp = entity.getComponent(RectangleComponent);
      const rect = rectComp.properties.rectangle;

      // If not in the padded area of the rect, don't bother to check
      if (!rect.intersectsWithPoint(this.cursorPoint)) {
        updateCanvasCursor('auto');
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