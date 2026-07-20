import { Entity, Query, System, World } from "@serbanghita-gamedev/ecs";
import MouseComponent from "../component/MouseComponent";
import ToolStateComponent from "../component/ToolStateComponent";

/**
 * Requests a history snapshot at the end of every completed action. Runs
 * last in the pipeline, so on the frame a release edge is seen every other
 * system has already finalized its work (draw commit, drag end, resize end,
 * connection attach, line re-pinning).
 *
 * Recording is skipped while a draw is mid-gesture (drawState !== IDLE):
 * the line tool's first-click release would otherwise snapshot the live
 * preview entity as a phantom shape.
 */
export default class HistorySystem extends System {
  private lastReleaseCount = 0;

  public constructor(
    public world: World,
    public query: Query,
    private onAction: () => void,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const cursor = this.world.getEntity('cursor') as Entity;
    if (!cursor) return;
    const mouseComp = cursor.getComponent(MouseComponent);

    // Consume the release edge every frame (same idiom as the other systems).
    const releaseEdge = mouseComp.releaseCount > this.lastReleaseCount;
    this.lastReleaseCount = mouseComp.releaseCount;
    if (!releaseEdge) return;

    const toolEntity = this.world.getEntity('tool');
    if (toolEntity && toolEntity.getComponent(ToolStateComponent).drawState !== 'IDLE') {
      return;
    }

    this.onAction();
  }
}
