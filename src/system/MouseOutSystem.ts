import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import IsMouseOver from "../component/IsMouseOver";
import MouseComponent from "../component/MouseComponent";
import { pointInRectangle } from "../collision";

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

    // @todo Optimisation: with quad trees.
    this.query.execute().forEach((entity) => {
      const rectComp = entity.getComponent(RectangleComponent);

      if (!pointInRectangle(mouseComp.x, mouseComp.y, rectComp.x, rectComp.y, rectComp.width, rectComp.height)) {
        entity.removeComponent(IsMouseOver);
      }
    });
  }
}
