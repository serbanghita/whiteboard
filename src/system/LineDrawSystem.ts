import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import ToolStateComponent from "../component/ToolStateComponent";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import LineComponent from "../component/LineComponent";
import IsRendered from "../component/IsRendered";

const MIN_LINE_LENGTH = 5;

/**
 * LineDrawSystem handles drawing lines.
 * State machine: IDLE -> (click) -> FIRST_POINT_SET -> (move=preview, click=finalize) -> IDLE
 * Lines use two clicks: first click sets start point, second click sets end point.
 */
export default class LineDrawSystem extends System {
  private entityCounter = 0;
  private wasMousePressed = false;

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

    // Only handle line mode
    if (toolState.currentTool !== 'line') return;

    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);
    const isMousePressed = cursor.hasComponent(IsMousePressed);

    // Detect click (transition from not pressed to pressed)
    const isClick = isMousePressed && !this.wasMousePressed;
    this.wasMousePressed = isMousePressed;

    // State machine: IDLE -> FIRST_POINT_SET -> IDLE
    if (toolState.drawState === 'IDLE') {
      // Wait for first click to start drawing
      if (isClick) {
        toolState.drawState = 'FIRST_POINT_SET';
        toolState.startX = mouseComp.x;
        toolState.startY = mouseComp.y;

        // Create preview entity
        const entityId = `line-${Date.now()}-${this.entityCounter++}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(LineComponent, {
          x1: mouseComp.x,
          y1: mouseComp.y,
          x2: mouseComp.x,
          y2: mouseComp.y,
          strokeColor: 'black'
        });
        previewEntity.addComponent(IsRendered);
        toolState.previewEntityId = entityId;
      }
    } else if (toolState.drawState === 'FIRST_POINT_SET') {
      // Update preview while moving
      if (toolState.previewEntityId) {
        const previewEntity = this.world.getEntity(toolState.previewEntityId);
        if (previewEntity) {
          const lineComp = previewEntity.getComponent(LineComponent);
          lineComp.x2 = mouseComp.x;
          lineComp.y2 = mouseComp.y;
        }
      }

      // Finalize on second click
      if (isClick) {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const lineComp = previewEntity.getComponent(LineComponent);

            // Check minimum length
            if (lineComp.length < MIN_LINE_LENGTH) {
              // Cancel - too short
              this.world.removeEntity(previewEntity);
              console.log('Line cancelled: too short');
            } else {
              // Keep the entity - drawing complete
              console.log(`Line created: ${toolState.previewEntityId}`);
            }
          }
        }

        // Reset state
        toolState.reset();
      }
    }
  }
}
