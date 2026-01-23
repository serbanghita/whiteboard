import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import ToolStateComponent from "../component/ToolStateComponent";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";

/**
 * ToolStateSystem manages the global tool mode state.
 * It coordinates between tool selection and drawing systems.
 */
export default class ToolStateSystem extends System {
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

    // Handle cursor/select mode - clear selection when clicking on empty canvas
    if (toolState.currentTool === 'cursor') {
      if (cursor.hasComponent(IsMousePressed)) {
        // Selection clearing is handled by MousePressSystem when clicking on empty area
        // This system just ensures the tool state is consistent
      }
    }
  }
}
