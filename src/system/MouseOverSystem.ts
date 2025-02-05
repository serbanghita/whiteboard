import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import { Circle, Point, Rectangle } from "@serbanghita-gamedev/geometry";
import RectangleComponent from "../component/RectangleComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import IsMouseOver from "../component/IsMouseOver";
import MouseComponent from "../component/MouseComponent";

export default class MouseOverSystem extends System {
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

      if (rectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
        entity.addComponent(IsMouseOver);
      }
    });
  }
}