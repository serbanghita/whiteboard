import { System, Query, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import { circle, dashedLine, dot, rectangle } from "@serbanghita-gamedev/renderer";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import { clearCanvas } from "../render";
import IsMouseOver from "../component/IsMouseOver";

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
      if (entity.hasComponent(SelectionRectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        const rect = comp.rectangle;
        rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height, "blue");
        dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "blue", 2);
      } else if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        const rect = comp.rectangle;
        rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height);
        dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "black", 2);

        if (entity.hasComponent(IsMouseOver)) {
          // dashedLine(this.ctx, () => rectangle(this.ctx, rect.topLeftX - 8, rect.topLeftY - 8, rect.width + 16, rect.height + 16, "rgba(0,0,0,0.9)"), [2, 1]);
          rectangle(this.ctx, rect.topLeftX - 8, rect.topLeftY - 8, rect.width + 16, rect.height + 16, "rgb(204 204 204)");
        }
      }

      // rectangle(this.ctx, rect.topLeftX, rect.topLeftY, rect.width, rect.height, "rgb(255,100,0)");
      // dot(this.ctx, rect.center.x - 1, rect.center.y - 1, "black", 2);
    });
  }
}
