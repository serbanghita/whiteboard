import { System, Query, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import { circle, dot, rectangle } from "@serbanghita-gamedev/renderer";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import { clearCanvas } from "../render";

export default class RenderingSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
    public ctx: CanvasRenderingContext2D,
  ) {
    super(world, query);
  }
  public update(now: number): void {
    clearCanvas();

    this.query.execute().forEach((entity) => {
      if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        const rect = comp.rectangle;
        rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height);
        dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "black", 2);
      }

      // rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height, "rgb(255,100,0)");
      // dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "black", 2);
    });
  }
}
