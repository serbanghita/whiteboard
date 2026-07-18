import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import LineComponent from "../component/LineComponent";
import IsRendered from "../component/IsRendered";
import ToolStateComponent from "../component/ToolStateComponent";
import { handleAtPoint } from "../handles";
import { autoSelectFreshShape } from "../autoSelect";

/**
 * ConnectionSystem handles drawing connecting lines from connection handles.
 *
 * Runs when dragging a connection handle ('n', 'e', 's', 'w').
 */
export default class ConnectionSystem extends System {
  private lastPressCount = 0;
  private previewEntityId: string | null = null;
  private entityCounter = 0;

  public constructor(
    public world: World,
    public query: Query,
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

    if (pressEdge) {
      this.stop(selectionComp);

      const handle = handleAtPoint(this.world, mouseComp.pressX, mouseComp.pressY);
      const isConnectionHandle = handle && (handle.id === 'n' || handle.id === 'e' || handle.id === 's' || handle.id === 'w');
      
      if (isConnectionHandle && selectionComp.entities.size === 1) {
        selectionComp.connectionHandleId = handle.id;

        // Create line starting from handle
        const entityId = `connection-line-${Date.now()}-${this.entityCounter++}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(LineComponent, {
          x1: handle.x,
          y1: handle.y,
          x2: mouseComp.x,
          y2: mouseComp.y,
          strokeColor: 'black'
        });
        previewEntity.addComponent(IsRendered);
        this.previewEntityId = entityId;
      }
    }

    if (!cursor.hasComponent(IsMousePressed)) {
      if (this.previewEntityId) {
        // Line drawn! Keep it.
        const previewEntity = this.world.getEntity(this.previewEntityId);
        if (previewEntity) {
           const lineComp = previewEntity.getComponent(LineComponent);
           lineComp.x2 = mouseComp.x;
           lineComp.y2 = mouseComp.y;
           
           autoSelectFreshShape(this.world, previewEntity);
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

    // Update preview line
    const previewEntity = this.world.getEntity(this.previewEntityId);
    if (previewEntity) {
      const lineComp = previewEntity.getComponent(LineComponent);
      lineComp.x2 = mouseComp.x;
      lineComp.y2 = mouseComp.y;
    }
  }

  private stop(selectionComp: SelectionRectangleComponent): void {
    selectionComp.connectionHandleId = null;
    if (this.previewEntityId) {
      // If aborted, delete line
      this.world.removeEntity(this.previewEntityId);
      this.previewEntityId = null;
    }
  }
}
