import { System, Query, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import { IRenderer } from "../renderer";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import IsMouseOver from "../component/IsMouseOver";

export default class RenderingSystem extends System {
  public constructor(
    public world: World,
    public query: Query,
    public renderer: IRenderer,
  ) {
    super(world, query);
  }

  public update(now: number): void {
    this.renderer.clear();

    this.query.execute().forEach((entity) => {
      if (entity.hasComponent(SelectionRectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        const rect = comp.rectangle;
        this.renderer.rectangle(rect.topLeftX, rect.topLeftY, rect.width, rect.height, { strokeColor: "blue" });
        this.renderer.dot(rect.center.x - 1, rect.center.y - 1, { fillColor: "blue", strokeWidth: 2 });
      } else if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        const rect = comp.rectangle;
        this.renderer.rectangle(rect.topLeftX, rect.topLeftY, rect.width, rect.height, { strokeColor: "black" });
        this.renderer.dot(rect.center.x - 1, rect.center.y - 1, { fillColor: "black", strokeWidth: 2 });

        if (entity.hasComponent(IsMouseOver)) {
          this.renderer.rectangle(rect.topLeftX - 8, rect.topLeftY - 8, rect.width + 16, rect.height + 16, { strokeColor: "rgb(204 204 204)" });
        }
      }
    });
  }
}
