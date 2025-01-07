import { System, Query, World } from "@serbanghita-gamedev/ecs";
import IsRectangle from "./IsRectangle";
import { dot, rectangle } from "@serbanghita-gamedev/renderer";

export default class RenderingSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
    public ctx: CanvasRenderingContext2D,
  ) {
    super(world, query);
  }
  public update(now: number): void {
    this.ctx.clearRect(0, 0, 640, 480);

    this.query.execute().forEach((entity) => {
      if (entity.hasComponent(IsRectangle)) {
        const comp = entity.getComponent(IsRectangle);
        const rect = comp.properties.rectangle;
        rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height);
      }

      // rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height, "rgb(255,100,0)");
      // dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "black", 2);
    });
  }
}
