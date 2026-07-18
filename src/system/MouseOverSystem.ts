import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import IsMouseOver from "../component/IsMouseOver";
import MouseComponent from "../component/MouseComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { hitTestEntity } from "../shape";
import { getCameraScale } from "../camera";

export default class MouseOverSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    // Hover feedback only makes sense in cursor mode - while drawing, the
    // preview shape follows the cursor and would always be "hovered".
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== 'cursor') {
      return;
    }

    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // @todo Optimisation: with quad trees.
    const scale = getCameraScale(this.world);
    this.query.execute().forEach((entity) => {
      if (hitTestEntity(entity, mouseComp.x, mouseComp.y, scale)) {
        entity.addComponent(IsMouseOver);
      }
    });
  }
}
