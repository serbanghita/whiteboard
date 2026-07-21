import { System, Query, World, Entity } from "@serbanghita-gamedev/ecs";
import TargetTransformComponent from "../component/TargetTransformComponent";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";

const LERP_SPEED = 15; // Exponential decay rate

export default class InterpolationSystem extends System {
  private lastUpdate: number = performance.now();

  public constructor(
    public world: World,
    public query: Query,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    const dt = (now - this.lastUpdate) / 1000;
    this.lastUpdate = now;

    // Guard against massive frame drops or tab switching
    if (dt <= 0 || dt > 0.1) return;

    // x = lerp(x, targetX, 1 - exp(-speed * dt))
    const t = 1 - Math.exp(-LERP_SPEED * dt);

    this.query.execute().forEach((entity) => {
      const target = entity.getComponent(TargetTransformComponent);
      let reached = true;

      if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        if (target.x !== undefined && target.y !== undefined) {
          const dx = target.x - comp.x;
          const dy = target.y - comp.y;
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            comp.x += dx * t;
            comp.y += dy * t;
            reached = false;
          } else {
            comp.x = target.x;
            comp.y = target.y;
          }
        }
      } else if (entity.hasComponent(CircleComponent)) {
        const comp = entity.getComponent(CircleComponent);
        if (target.x !== undefined && target.y !== undefined) {
          const dx = target.x - comp.x;
          const dy = target.y - comp.y;
          if (Math.abs(dx) > 0.1 || Math.abs(dy) > 0.1) {
            comp.x += dx * t;
            comp.y += dy * t;
            reached = false;
          } else {
            comp.x = target.x;
            comp.y = target.y;
          }
        }
      } else if (entity.hasComponent(LineComponent)) {
        const comp = entity.getComponent(LineComponent);
        if (target.x1 !== undefined && target.y1 !== undefined && target.x2 !== undefined && target.y2 !== undefined) {
          const dx1 = target.x1 - comp.x1;
          const dy1 = target.y1 - comp.y1;
          const dx2 = target.x2 - comp.x2;
          const dy2 = target.y2 - comp.y2;
          
          if (Math.abs(dx1) > 0.1 || Math.abs(dy1) > 0.1 || Math.abs(dx2) > 0.1 || Math.abs(dy2) > 0.1) {
            comp.x1 += dx1 * t;
            comp.y1 += dy1 * t;
            comp.x2 += dx2 * t;
            comp.y2 += dy2 * t;
            reached = false;
          } else {
            comp.x1 = target.x1;
            comp.y1 = target.y1;
            comp.x2 = target.x2;
            comp.y2 = target.y2;
          }
        }
      }

      if (reached) {
        entity.removeComponent(TargetTransformComponent);
      }
    });
  }
}
