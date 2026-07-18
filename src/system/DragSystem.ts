import { System, Query, World, Entity } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { moveEntityBy } from "../shape";

/**
 * DragSystem handles moving selected entities when the mouse is pressed and dragged.
 *
 * It runs when:
 * - The cursor tool is active
 * - IsMousePressed tag exists on cursor (mouse button is down)
 * - There are selected entities in SelectionRectangleComponent
 *
 * The drag anchor is (re-)set to the press position recorded at DOM-event
 * time whenever a new press is seen. That both keeps the shape under the
 * grab point (movement between mousedown and the next frame is not lost)
 * and prevents a stale anchor from a previous drag being applied when a
 * release+press pair lands between two frames.
 */
export default class DragSystem extends System {
  private lastPressCount = 0;
  private lastX: number | null = null;
  private lastY: number | null = null;

  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Re-anchor on every new press, consumed every frame even when gated below.
    if (mouseComp.pressCount > this.lastPressCount) {
      this.lastX = mouseComp.pressX;
      this.lastY = mouseComp.pressY;
    }
    this.lastPressCount = mouseComp.pressCount;

    // Dragging is only active in cursor mode; drawing tools handle their own presses.
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== 'cursor') {
      return;
    }

    // Only drag when mouse is pressed
    if (!cursor.hasComponent(IsMousePressed)) {
      this.lastX = null;
      this.lastY = null;
      return;
    }

    // Pressed but no press edge was ever observed (e.g. press predates this
    // system): anchor at the current position and start next frame.
    if (this.lastX === null || this.lastY === null) {
      this.lastX = mouseComp.x;
      this.lastY = mouseComp.y;
      return;
    }

    const deltaX = mouseComp.x - this.lastX;
    const deltaY = mouseComp.y - this.lastY;
    this.lastX = mouseComp.x;
    this.lastY = mouseComp.y;

    // No movement, nothing to drag
    if (deltaX === 0 && deltaY === 0) {
      return;
    }

    const selectionEntity = this.world.getEntity('selection') as Entity;
    const selectionComp = selectionEntity.getComponent(SelectionRectangleComponent);

    // The press is resizing via a handle (ResizeSystem), not dragging.
    if (selectionComp.resizeHandleId || selectionComp.connectionHandleId) {
      return;
    }

    // No selected entities, nothing to drag
    if (selectionComp.entities.size === 0) {
      return;
    }

    // Move all selected entities by the delta
    selectionComp.entities.forEach((entity) => {
      moveEntityBy(entity, deltaX, deltaY);
    });

    // Mark selection as dirty so SelectionSystem updates the bounding box
    selectionComp.isDirty = true;
  }
}
