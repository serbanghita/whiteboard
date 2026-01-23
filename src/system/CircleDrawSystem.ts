import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import ToolStateComponent from "../component/ToolStateComponent";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import CircleComponent from "../component/CircleComponent";
import IsRendered from "../component/IsRendered";

const MIN_CIRCLE_RADIUS = 3;

/**
 * CircleDrawSystem handles drawing circles.
 * State machine: IDLE -> (click) -> FIRST_POINT_SET -> (drag=preview, release=finalize) -> IDLE
 * Circle fits in bounding box from start point to current mouse position.
 */
export default class CircleDrawSystem extends System {
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

    // Only handle circle mode
    if (toolState.currentTool !== 'circle') return;

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
        const entityId = `circle-${Date.now()}-${this.entityCounter++}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(CircleComponent, {
          x: mouseComp.x,
          y: mouseComp.y,
          radius: 1,
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
          const circleComp = previewEntity.getComponent(CircleComponent);

          // Calculate circle that fits in bounding box
          const x1 = Math.min(toolState.startX!, mouseComp.x);
          const y1 = Math.min(toolState.startY!, mouseComp.y);
          const x2 = Math.max(toolState.startX!, mouseComp.x);
          const y2 = Math.max(toolState.startY!, mouseComp.y);

          const width = x2 - x1;
          const height = y2 - y1;
          const radius = Math.min(width, height) / 2;

          // Center is at midpoint of bounding box
          circleComp.x = (x1 + x2) / 2;
          circleComp.y = (y1 + y2) / 2;
          circleComp.radius = Math.max(1, radius);
        }
      }

      // Finalize on mouse release
      if (!isMousePressed) {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const circleComp = previewEntity.getComponent(CircleComponent);

            // Check minimum size
            if (circleComp.radius < MIN_CIRCLE_RADIUS) {
              // Cancel - too small
              this.world.removeEntity(previewEntity);
              console.log('Circle cancelled: too small');
            } else {
              // Keep the entity - drawing complete
              console.log(`Circle created: ${toolState.previewEntityId}`);
            }
          }
        }

        // Reset state
        toolState.reset();
      }
    }
  }
}
