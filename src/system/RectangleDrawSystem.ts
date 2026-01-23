import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import ToolStateComponent from "../component/ToolStateComponent";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import RectangleComponent from "../component/RectangleComponent";
import IsRendered from "../component/IsRendered";

const MIN_RECTANGLE_SIZE = 5;

/**
 * RectangleDrawSystem handles drawing rectangles.
 * State machine: IDLE -> (click) -> FIRST_POINT_SET -> (drag=preview, release=finalize) -> IDLE
 */
export default class RectangleDrawSystem extends System {
  private entityCounter = 0;

  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const toolEntity = this.world.getEntity('tool') as Entity;
    if (!toolEntity) return;

    const toolState = toolEntity.getComponent(ToolStateComponent);

    // Only handle rectangle mode
    if (toolState.currentTool !== 'rectangle') return;

    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);
    const isMousePressed = cursor.hasComponent(IsMousePressed);

    // State machine: IDLE -> FIRST_POINT_SET -> IDLE
    if (toolState.drawState === 'IDLE') {
      // Wait for mouse press to start drawing
      if (isMousePressed) {
        toolState.drawState = 'FIRST_POINT_SET';
        toolState.startX = mouseComp.x;
        toolState.startY = mouseComp.y;

        // Create preview entity
        const entityId = `rectangle-${Date.now()}-${this.entityCounter++}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(RectangleComponent, {
          x: mouseComp.x,
          y: mouseComp.y,
          width: 1,
          height: 1,
          strokeColor: 'black'
        });
        previewEntity.addComponent(IsRendered);
        toolState.previewEntityId = entityId;
      }
    } else if (toolState.drawState === 'FIRST_POINT_SET') {
      // Update preview while dragging
      if (toolState.previewEntityId) {
        const previewEntity = this.world.getEntity(toolState.previewEntityId);
        if (previewEntity) {
          const rectComp = previewEntity.getComponent(RectangleComponent);

          // Calculate rectangle from start to current mouse position
          const x1 = Math.min(toolState.startX!, mouseComp.x);
          const y1 = Math.min(toolState.startY!, mouseComp.y);
          const x2 = Math.max(toolState.startX!, mouseComp.x);
          const y2 = Math.max(toolState.startY!, mouseComp.y);

          rectComp.x = x1;
          rectComp.y = y1;
          rectComp.width = x2 - x1;
          rectComp.height = y2 - y1;
        }
      }

      // Finalize on mouse release
      if (!isMousePressed) {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const rectComp = previewEntity.getComponent(RectangleComponent);

            // Check minimum size
            if (rectComp.width < MIN_RECTANGLE_SIZE || rectComp.height < MIN_RECTANGLE_SIZE) {
              // Cancel - too small
              this.world.removeEntity(previewEntity);
              console.log('Rectangle cancelled: too small');
            } else {
              // Keep the entity - drawing complete
              console.log(`Rectangle created: ${toolState.previewEntityId}`);
            }
          }
        }

        // Reset state
        toolState.reset();
      }
    }
  }
}
