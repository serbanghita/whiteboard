import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import MouseComponent from "../component/MouseComponent";
import IsMousePressed from "../component/IsMousePressed";

export default class MousePressSystem extends System {
  public constructor(
    public world: World,
    public query: Query
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    if (!cursor.hasComponent(IsMousePressed)) {
      return;
    }

    // @todo Optimisation: with quad trees.
    this.query.execute().forEach((entity) => {
      const rectComp = entity.getComponent(RectangleComponent);

      if (rectComp.rectangle.intersectsWithPoint(mouseComp.point)) {
        // console.log(this.cursorPoint, "intersects with", entity.id);

        const selectionEntity = this.world.getEntity('selection');
        if (!selectionEntity) {
          return;
        }
        // Attempt to attach entity intersecting with the mouse pointer to the "selection" entity.
        const selectionRectComp = selectionEntity.getComponent(SelectionRectangleComponent);
        if (!selectionRectComp.entities.has(entity.id)) {
          console.log(`added entity ${entity.id} to the "selection" entity.`);
          selectionRectComp.addEntity(entity)
        }
        // Should check if SHIFT is pressed.
        // Add the new entity to the selection (if it doesn't exist already).
        // @todo: Implement keyboard state.
        return;
      }
    });
  }
}