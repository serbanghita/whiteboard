import { Query, System, World } from "@serbanghita-gamedev/ecs";
import { Circle, Point, Rectangle } from "@serbanghita-gamedev/geometry";
import RectangleComponent from "../component/RectangleComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";

export default class MousePressSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
    public cursorPoint: Point
  ) {
    super(world, query);
  }

  public update(now: number): void {
    // Optimisation: with quad trees.
    this.query.execute().forEach((entity) => {
      const isRectComp = entity.getComponent(RectangleComponent);
      const rect = isRectComp.properties.rectangle;
      if (rect.intersectsWithPoint(this.cursorPoint)) {
        console.log(this.cursorPoint, "intersects with", entity.id);

        // Check if we already have a "selection" entity.
        if (!this.world.getEntity('selection')) {
          // Create a "selection" entity and attach the current entity to it.
          const selectionEntity = this.world.createEntity('selection');
          selectionEntity.addComponent(SelectionRectangleComponent, {entities: [entity]});
        } else {
          // Should check if SHIFT is pressed.
          // Add the new entity to the selection (if it doesn't exist already).
          // @todo: Implement keyboard state.
        }
        return;
      }
    });
  }
}