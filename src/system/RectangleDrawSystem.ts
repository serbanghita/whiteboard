import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import ToolStateComponent from "../component/ToolStateComponent";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import RectangleComponent from "../component/RectangleComponent";
import TextComponent from "../component/TextComponent";
import IsRendered from "../component/IsRendered";
import { autoSelectFreshShape } from "../autoSelect";
import { isSystemDesignTool, systemDesignLabel } from "../systemDesign";

const MIN_RECTANGLE_SIZE = 5;

/**
 * RectangleDrawSystem handles drawing rectangles.
 * State machine: IDLE -> (press) -> FIRST_POINT_SET -> (drag=preview, release=finalize) -> IDLE
 */
export default class RectangleDrawSystem extends System {
  private entityCounter = 0;
  private lastPressCount = 0;
  private lastReleaseCount = 0;

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
    const isMousePressed = cursor.hasComponent(IsMousePressed);

    // Consume press/release edges every frame, even when another tool is
    // active - otherwise edges from other modes replay when this tool resumes.
    const pressEdge = mouseComp.pressCount > this.lastPressCount;
    const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
    this.lastPressCount = mouseComp.pressCount;
    this.lastReleaseCount = mouseComp.releaseCount;

    // Only handle rectangle and system design tools (labeled rect variants)
    if (toolState.currentTool !== 'rectangle' && !isSystemDesignTool(toolState.currentTool)) return;

    // State machine: IDLE -> FIRST_POINT_SET -> IDLE
    if (toolState.drawState === 'IDLE') {
      // Start drawing on a fresh press only (edge, not level): after Escape
      // cancels a drawing the button is still held, and that must not
      // immediately start a new one.
      if (pressEdge) {
        toolState.drawState = 'FIRST_POINT_SET';
        toolState.startX = mouseComp.pressX;
        toolState.startY = mouseComp.pressY;

        // Create preview entity
        const entityId = `rectangle-${crypto.randomUUID()}`;
        const previewEntity = this.world.createEntity(entityId);
        previewEntity.addComponent(RectangleComponent, {
          x: mouseComp.pressX,
          y: mouseComp.pressY,
          width: 1,
          height: 1,
          fillColor: 'white',
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

      // Finalize on release: the edge catches a release+press pair landing
      // between two frames; the level check covers a plain release.
      if (releaseEdge || !isMousePressed) {
        if (toolState.previewEntityId) {
          const previewEntity = this.world.getEntity(toolState.previewEntityId);
          if (previewEntity) {
            const rectComp = previewEntity.getComponent(RectangleComponent);

            // Check minimum size
            if (rectComp.width < MIN_RECTANGLE_SIZE || rectComp.height < MIN_RECTANGLE_SIZE) {
              // Cancel - too small
              this.world.removeEntity(previewEntity.id);
              console.log('Rectangle cancelled: too small');
            } else {
              // Keep the entity - drawing complete
              console.log(`Rectangle created: ${toolState.previewEntityId}`);
              // Switch to the cursor tool with the fresh shape selected, so
              // its handles show and it can be dragged right away.
              const label = systemDesignLabel(toolState.currentTool);
              if (label) {
                // The label text is user-editable, so the tool id is the only
                // durable record of the semantic type (read at save() time).
                rectComp.sysType = toolState.currentTool;
                previewEntity.addComponent(TextComponent, {
                  content: label,
                  fontSize: 16,
                  fontFamily: 'sans-serif',
                  color: 'black'
                });
              }

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
