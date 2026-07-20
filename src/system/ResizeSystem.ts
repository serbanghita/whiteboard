import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
import LineAttachmentComponent from "../component/LineAttachmentComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { handleAtPoint, HandleId } from "../handles";
import { getCameraScale } from "../camera";

const MIN_RECTANGLE_SIZE = 5;
const MIN_CIRCLE_RADIUS = 3;

/**
 * ResizeSystem resizes the selected shape by dragging its handles.
 *
 * A press landing on a handle claims the interaction: the system publishes
 * the active handle on SelectionRectangleComponent.resizeHandleId, and
 * MousePressSystem / DragSystem skip that press (it must run before both).
 *
 * Rect/circle: the bounding-box corner opposite the grabbed handle stays
 * fixed; the shape follows the mouse (crossing the anchor flips naturally).
 * Line: the grabbed endpoint follows the mouse.
 */
export default class ResizeSystem extends System {
  private lastPressCount = 0;
  private activeHandleId: HandleId | null = null;
  private targetEntityId: string | null = null;
  // The fixed bounding-box corner (rect/circle resizes).
  private anchorX = 0;
  private anchorY = 0;
  // Offset between the grab point and the handle center, so the shape
  // doesn't jump when the handle is grabbed slightly off-center.
  private grabOffsetX = 0;
  private grabOffsetY = 0;

  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Consume the press edge every frame, even when gated below.
    const pressEdge = mouseComp.pressCount > this.lastPressCount;
    this.lastPressCount = mouseComp.pressCount;

    const selectionEntity = this.world.getEntity('selection');
    if (!selectionEntity) {
      return;
    }
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);

    // Resizing only exists in cursor mode.
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== 'cursor') {
      this.stop(selectionComp);
      return;
    }

    if (pressEdge) {
      // Each new press re-evaluates: a press on a handle starts a resize,
      // anywhere else ends any active one (and falls through to the other
      // systems). This also covers a release+press pair landing between
      // two frames.
      this.stop(selectionComp);

      const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY, getCameraScale(this.world));
      const isConnectionHandle = handle && (handle.id === 'n' || handle.id === 'e' || handle.id === 's' || handle.id === 'w');
      
      if (handle && !isConnectionHandle && selectionComp.entities.size === 1) {
        const [target] = selectionComp.entities.values();
        this.activeHandleId = handle.id;
        this.targetEntityId = target.id;
        this.grabOffsetX = handle.x - mouseComp.pressX;
        this.grabOffsetY = handle.y - mouseComp.pressY;
        selectionComp.resizeHandleId = handle.id;

        // Grabbing an attached line endpoint detaches that side only, so it
        // can follow the mouse instead of being re-pinned by
        // LineAttachmentSystem; the other side's connection survives.
        if ((handle.id === 'start' || handle.id === 'end') && target.hasComponent(LineAttachmentComponent)) {
          const attachment = target.getComponent(LineAttachmentComponent);
          if (handle.id === 'start') {
            attachment.start = null;
          } else {
            attachment.end = null;
          }
        }

        // The opposite bounding-box corner stays fixed while dragging.
        if (selectionEntity.hasComponent(RectangleComponent)) {
          const bounds = selectionEntity.getComponent(RectangleComponent);
          this.anchorX = handle.id === 'nw' || handle.id === 'sw' ? bounds.x + bounds.width : bounds.x;
          this.anchorY = handle.id === 'nw' || handle.id === 'ne' ? bounds.y + bounds.height : bounds.y;
        }
      }
    }

    if (!cursor.hasComponent(IsMousePressed)) {
      this.stop(selectionComp);
      return;
    }

    if (!this.activeHandleId || !this.targetEntityId) {
      return;
    }

    const target = this.world.getEntity(this.targetEntityId);
    if (!target) {
      this.stop(selectionComp);
      return;
    }

    this.applyResize(target, mouseComp.x + this.grabOffsetX, mouseComp.y + this.grabOffsetY);
    selectionComp.isDirty = true;
  }

  private stop(selectionComp: SelectionRectangleComponent): void {
    this.activeHandleId = null;
    this.targetEntityId = null;
    selectionComp.resizeHandleId = null;
  }

  private applyResize(target: Entity, x: number, y: number): void {
    if (target.hasComponent(LineComponent)) {
      const line = target.getComponent(LineComponent);
      if (this.activeHandleId === 'start') {
        line.x1 = x;
        line.y1 = y;
      } else if (this.activeHandleId === 'end') {
        line.x2 = x;
        line.y2 = y;
      }
      return;
    }

    if (target.hasComponent(RectangleComponent)) {
      const rect = target.getComponent(RectangleComponent);
      const width = Math.max(MIN_RECTANGLE_SIZE, Math.abs(x - this.anchorX));
      const height = Math.max(MIN_RECTANGLE_SIZE, Math.abs(y - this.anchorY));
      rect.x = x >= this.anchorX ? this.anchorX : this.anchorX - width;
      rect.y = y >= this.anchorY ? this.anchorY : this.anchorY - height;
      rect.width = width;
      rect.height = height;
      return;
    }

    if (target.hasComponent(CircleComponent)) {
      const circle = target.getComponent(CircleComponent);
      // Inscribed in the square hugging the fixed corner, like CircleDrawSystem.
      const diameter = Math.min(Math.abs(x - this.anchorX), Math.abs(y - this.anchorY));
      const radius = Math.max(MIN_CIRCLE_RADIUS, diameter / 2);
      circle.radius = radius;
      circle.x = this.anchorX + (x >= this.anchorX ? radius : -radius);
      circle.y = this.anchorY + (y >= this.anchorY ? radius : -radius);
    }
  }
}
