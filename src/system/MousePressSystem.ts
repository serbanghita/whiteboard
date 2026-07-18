import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import MouseComponent from "../component/MouseComponent";
import ToolStateComponent from "../component/ToolStateComponent";
import { hitTestEntity } from "../shape";
import { getCameraScale } from "../camera";

export default class MousePressSystem extends System {
  private lastPressCount = 0;

  public constructor(
    public world: World,
    public query: Query
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Selection only happens on a click (press edge). The counter is
    // recorded at DOM-event time, so a release+press pair landing between
    // two frames is still seen; it is consumed every frame, even when gated
    // below, so presses made in other tool modes never replay as clicks.
    const isClick = mouseComp.pressCount > this.lastPressCount;
    this.lastPressCount = mouseComp.pressCount;

    // Selection is only active in cursor mode; drawing tools handle their own presses.
    const toolEntity = this.world.getEntity('tool');
    if (toolEntity && toolEntity.getComponent(ToolStateComponent).currentTool !== 'cursor') {
      return;
    }

    if (!isClick) {
      return;
    }

    const selectionEntity = this.world.getEntity('selection');
    if (!selectionEntity) {
      return;
    }
    const selectionRectComp = selectionEntity.getComponent(SelectionRectangleComponent);

    // The press landed on a resize handle (claimed by ResizeSystem, which
    // runs earlier) - it is not a selection click.
    if (selectionRectComp.resizeHandleId || selectionRectComp.connectionHandleId) {
      return;
    }

    // Hit-test at the press position (event time, not frame time). Entities
    // render in query order, so the topmost shape is the last match - scan in
    // reverse and stop at the first hit.
    // @todo Optimisation: with quad trees.
    let hitEntity: Entity | null = null;
    const scale = getCameraScale(this.world);
    const entities = [...this.query.execute().values()];
    for (let i = entities.length - 1; i >= 0; i--) {
      if (hitTestEntity(entities[i], mouseComp.pressX, mouseComp.pressY, scale)) {
        hitEntity = entities[i];
        break;
      }
    }

    if (hitEntity) {
      // Single-select: clicking a non-selected shape replaces the selection.
      // Clicking an already-selected shape keeps it (so a drag can start).
      // @todo: SHIFT+click for additive selection (needs keyboard state).
      if (!selectionRectComp.hasEntity(hitEntity)) {
        selectionRectComp.clear();
        selectionRectComp.addEntity(hitEntity);
        console.log(`added entity ${hitEntity.id} to the "selection" entity.`);
      }
    } else {
      // Clicking empty canvas clears the selection.
      selectionRectComp.clear();
    }
  }
}
