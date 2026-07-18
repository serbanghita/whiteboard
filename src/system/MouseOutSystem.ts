import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import IsMouseOver from "../component/IsMouseOver";
import MouseComponent from "../component/MouseComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { hitTestEntity } from "../shape";
import { getCameraScale } from "../camera";

export default class MouseOutSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Outside cursor mode there is no hover feedback at all - clear any
    // leftover hover tags (e.g. from before a tool switch).
    const toolEntity = this.world.getEntity('tool');
    const isCursorMode = !toolEntity || toolEntity.getComponent(ToolStateComponent).currentTool === 'cursor';

    // @todo Optimisation: with quad trees.
    const scale = getCameraScale(this.world);
    this.query.execute().forEach((entity) => {
      if (!isCursorMode || !hitTestEntity(entity, mouseComp.x, mouseComp.y, scale)) {
        entity.removeComponent(IsMouseOver);
      }
    });
  }
}
