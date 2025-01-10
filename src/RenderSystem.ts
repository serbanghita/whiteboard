import { System, Query, World } from "@serbanghita-gamedev/ecs";
import IsRectangle from "./IsRectangle";
import { circle, dot, rectangle } from "@serbanghita-gamedev/renderer";
import HasRectangleContext from "./HasRectangleContext";

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

        if (entity.hasComponent(HasRectangleContext)) {
          const contextComp = entity.getComponent(HasRectangleContext);
          const contextRect = contextComp.properties.rectangle;
          rectangle(this.ctx, contextRect.topLeftX, contextRect.topLeftY, contextRect.width, contextRect.height, 'rgba(0, 0, 255, 0.5)');
          circle(this.ctx, contextComp.properties.leftConnCircle.center.x, contextComp.properties.leftConnCircle.center.y, contextComp.properties.leftConnCircle.radius, 'white', 'blue');
          circle(this.ctx, contextComp.properties.rightConnCircle.center.x, contextComp.properties.rightConnCircle.center.y, contextComp.properties.rightConnCircle.radius, 'white', 'blue');
          circle(this.ctx, contextComp.properties.topConnCircle.center.x, contextComp.properties.topConnCircle.center.y, contextComp.properties.topConnCircle.radius, 'white', 'blue');
          circle(this.ctx, contextComp.properties.bottomConnCircle.center.x, contextComp.properties.bottomConnCircle.center.y, contextComp.properties.bottomConnCircle.radius, 'white', 'blue');
        }
      }

      // rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height, "rgb(255,100,0)");
      // dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "black", 2);
    });
  }
}
