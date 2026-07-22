import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import LineComponent from "../component/LineComponent";
import LineAttachmentComponent, { ConnectionHandleId } from "../component/LineAttachmentComponent";
import IsRendered from "../component/IsRendered";
import ToolStateComponent from "../component/ToolStateComponent";
import { connectionSnapTarget, handleAtPoint } from "../handles";
import { autoSelectFreshShape } from "../autoSelect";
import { getCameraScale } from "../camera";
import { DEFAULT_STROKE } from "../palette";

// A connection drag released without snapping and shorter than this is a
// stray click on the handle, not a line (parity with LineDrawSystem).
const MIN_CONNECTION_LINE_LENGTH = 5;

/**
 * ConnectionSystem handles drawing connecting lines from connection handles.
 *
 * Runs when dragging a connection handle ('n', 'e', 's', 'w'). The start
 * endpoint is attached to the source shape; while dragging, the free
 * endpoint snaps to other shapes' connection points and attaches on release
 * (LineAttachmentComponent), so LineAttachmentSystem keeps the line stuck
 * to the shapes afterwards.
 */
export default class ConnectionSystem extends System {
  private lastPressCount = 0;
  private previewEntityId: string | null = null;
  private sourceEntityId: string | null = null;
  private entityCounter = 0;

  public constructor(
    public world: World,
    public query: Query,
    // Rectangles/circles that can be snapped to (excludes the selection entity).
    public connectableQuery: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    const pressEdge = mouseComp.pressCount > this.lastPressCount;
    this.lastPressCount = mouseComp.pressCount;

    const selectionEntity = this.world.getEntity('selection');
    if (!selectionEntity) return;
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);

    // Connection drawing only exists in cursor mode.
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== 'cursor') {
      this.stop(selectionComp);
      return;
    }

    // A press consumed by a text-edit click-away commit is suppressed for
    // its entire hold - it must not start a connection drag.
    if (toolEntity && mouseComp.pressCount <= toolEntity.getComponent(ToolStateComponent).suppressedPressCount) {
      return;
    }

    const scale = getCameraScale(this.world);

    if (pressEdge) {
      this.stop(selectionComp);

      const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY, scale);
      const isConnectionHandle = handle && (handle.id === 'n' || handle.id === 'e' || handle.id === 's' || handle.id === 'w');

      if (isConnectionHandle && selectionComp.entities.size === 1) {
        selectionComp.connectionHandleId = handle.id;
        const [source] = selectionComp.entities.values();
        this.sourceEntityId = source.id;

        // Create line starting from handle, attached to the source shape.
        const entityId = `connection-line-${Date.now()}-${this.entityCounter++}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(LineComponent, {
          x1: handle.x,
          y1: handle.y,
          x2: mouseComp.x,
          y2: mouseComp.y,
          strokeColor: DEFAULT_STROKE
        });
        previewEntity.addComponent(LineAttachmentComponent, {
          start: { entityId: source.id, handleId: handle.id as ConnectionHandleId },
          end: null,
        });
        previewEntity.addComponent(IsRendered);
        this.previewEntityId = entityId;
      }
    }

    if (!cursor.hasComponent(IsMousePressed)) {
      if (this.previewEntityId) {
        const previewEntity = this.world.getEntity(this.previewEntityId);
        if (previewEntity) {
          const lineComp = previewEntity.getComponent(LineComponent);
          const snap = this.findSnap(mouseComp.x, mouseComp.y, scale);
          if (snap) {
            // Attach the free endpoint to the snapped connection point.
            lineComp.x2 = snap.handle.x;
            lineComp.y2 = snap.handle.y;
            const attachment = previewEntity.getComponent(LineAttachmentComponent);
            attachment.end = { entityId: snap.entity.id, handleId: snap.handle.id as ConnectionHandleId };
            autoSelectFreshShape(this.world, previewEntity);
          } else {
            lineComp.x2 = mouseComp.x;
            lineComp.y2 = mouseComp.y;
            if (lineComp.length < MIN_CONNECTION_LINE_LENGTH) {
              // A stray click on the handle - no line; the shape stays selected.
              this.world.removeEntity(this.previewEntityId);
            } else {
              // Dangling free end - keep it.
              autoSelectFreshShape(this.world, previewEntity);
            }
          }
        }
        // Null the ID so stop() doesn't delete it
        this.previewEntityId = null;
      }
      this.stop(selectionComp);
      return;
    }

    if (!selectionComp.connectionHandleId || !this.previewEntityId) {
      return;
    }

    // Update preview line, snapping the free endpoint to nearby connection points.
    const previewEntity = this.world.getEntity(this.previewEntityId);
    if (previewEntity) {
      const lineComp = previewEntity.getComponent(LineComponent);
      const snap = this.findSnap(mouseComp.x, mouseComp.y, scale);
      if (snap) {
        lineComp.x2 = snap.handle.x;
        lineComp.y2 = snap.handle.y;
        selectionComp.connectionSnap = { entityId: snap.entity.id, handleId: snap.handle.id as ConnectionHandleId };
      } else {
        lineComp.x2 = mouseComp.x;
        lineComp.y2 = mouseComp.y;
        selectionComp.connectionSnap = null;
      }
    }
  }

  private findSnap(x: number, y: number, scale: number) {
    return connectionSnapTarget(
      this.connectableQuery.execute().values(),
      x,
      y,
      scale,
      this.sourceEntityId,
    );
  }

  private stop(selectionComp: SelectionRectangleComponent): void {
    selectionComp.connectionHandleId = null;
    // Leave the snap alone while ResizeSystem owns an endpoint drag: Resize
    // runs earlier in the frame and set connectionSnap on this very press
    // edge; clearing it here would cost a one-frame dot flicker. Attachment
    // correctness never depends on this - ResizeSystem recomputes at release.
    const resizeOwnsSnap =
      selectionComp.resizeHandleId === 'start' || selectionComp.resizeHandleId === 'end';
    if (!resizeOwnsSnap) {
      selectionComp.connectionSnap = null;
    }
    this.sourceEntityId = null;
    if (this.previewEntityId) {
      // If aborted, delete line
      this.world.removeEntity(this.previewEntityId);
      this.previewEntityId = null;
    }
  }
}
