import { System, Query, World } from "@serbanghita-gamedev/ecs";
import RectangleComponent from "../component/RectangleComponent";
import CircleComponent from "../component/CircleComponent";
import LineComponent from "../component/LineComponent";
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
      // Render selection rectangle
      if (entity.hasComponent(SelectionRectangleComponent)) {
        if (entity.hasComponent(RectangleComponent)) {
          const comp = entity.getComponent(RectangleComponent);
          this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, { strokeColor: "blue" });
          this.renderer.dot(comp.centerX - 1, comp.centerY - 1, { fillColor: "blue", strokeWidth: 2 });
        }
      }
      // Render rectangle entities
      else if (entity.hasComponent(RectangleComponent)) {
        const comp = entity.getComponent(RectangleComponent);
        this.renderer.rectangle(comp.x, comp.y, comp.width, comp.height, {
          strokeColor: comp.strokeColor || "black",
          fillColor: comp.fillColor
        });
        this.renderer.dot(comp.centerX - 1, comp.centerY - 1, { fillColor: "black", strokeWidth: 2 });

        if (entity.hasComponent(IsMouseOver)) {
          this.renderer.rectangle(comp.x - 8, comp.y - 8, comp.width + 16, comp.height + 16, { strokeColor: "rgb(204 204 204)" });
        }
      }
      // Render circle entities
      else if (entity.hasComponent(CircleComponent)) {
        const comp = entity.getComponent(CircleComponent);
        this.renderer.circle(comp.x, comp.y, comp.radius, {
          strokeColor: comp.strokeColor || "black",
          fillColor: comp.fillColor
        });

        if (entity.hasComponent(IsMouseOver)) {
          this.renderer.circle(comp.x, comp.y, comp.radius + 8, { strokeColor: "rgb(204 204 204)" });
        }
      }
      // Render line entities
      else if (entity.hasComponent(LineComponent)) {
        const comp = entity.getComponent(LineComponent);
        this.renderer.line(comp.x1, comp.y1, comp.x2, comp.y2, {
          strokeColor: comp.strokeColor || "black",
          strokeWidth: comp.strokeWidth
        });
      }
    });
  }
}
