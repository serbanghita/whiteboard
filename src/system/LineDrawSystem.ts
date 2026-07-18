import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import ToolStateComponent from "../component/ToolStateComponent";
import MouseComponent from "../component/MouseComponent";
import LineComponent from "../component/LineComponent";
import IsRendered from "../component/IsRendered";
import { autoSelectFreshShape } from "../autoSelect";

const MIN_LINE_LENGTH = 5;

/**
 * LineDrawSystem handles drawing lines.
 * State machine: IDLE -> (click) -> FIRST_POINT_SET -> (move=preview, click=finalize) -> IDLE
 * Lines use two clicks: first click sets start point, second click sets end point.
 */
export default class LineDrawSystem extends System {
  private entityCounter = 0;
  private lastPressCount = 0;

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

    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Consume the press edge every frame, even when another tool is active -
    // otherwise a press made in another mode replays as a click when the
    // line tool resumes, swallowing or fabricating the first point.
    const isClick = mouseComp.pressCount > this.lastPressCount;
    this.lastPressCount = mouseComp.pressCount;

    // Only handle line mode
    if (toolState.currentTool !== 'line') return;

    // State machine: IDLE -> FIRST_POINT_SET -> IDLE
    if (toolState.drawState === 'IDLE') {
      // Wait for first click to start drawing
      if (isClick) {
        toolState.drawState = 'FIRST_POINT_SET';
        toolState.startX = mouseComp.pressX;
        toolState.startY = mouseComp.pressY;

        // Create preview entity
        const entityId = `line-${Date.now()}-${this.entityCounter++}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(LineComponent, {
          x1: mouseComp.pressX,
          y1: mouseComp.pressY,
          x2: mouseComp.pressX,
          y2: mouseComp.pressY,
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

            // The end point is where the click happened (event time), not
            // wherever the mouse is at frame time.
            lineComp.x2 = mouseComp.pressX;
            lineComp.y2 = mouseComp.pressY;

            // Check minimum length
            if (lineComp.length < MIN_LINE_LENGTH) {
              // Cancel - too short
              this.world.removeEntity(previewEntity.id);
              console.log('Line cancelled: too short');
            } else {
              // Keep the entity - drawing complete
              console.log(`Line created: ${toolState.previewEntityId}`);
              // Switch to the cursor tool with the fresh shape selected, so
              // its handles show and it can be dragged right away.
              autoSelectFreshShape(this.world, previewEntity);
            }
          }
        }

        // Reset state
        toolState.reset();
      }
    }
  }
}
