import { System } from "@serbanghita-gamedev/ecs";
import SelectionRectangleComponent from "../component/SelectionRectangleComponent";
import { circle, rectangle } from "@serbanghita-gamedev/renderer";

export default class RenderSelectionSystem extends System {

  update(now: number = 0) {
    this.query.execute().forEach((entity) => {
      // const selectionRectangleComponent = entity.getComponent(SelectionRectangleComponent);
      // const contextRect = contextComp.properties.rectangle;
      // rectangle(this.ctx, contextRect.topLeftX, contextRect.topLeftY, contextRect.width, contextRect.height, 'rgba(0, 0, 255, 0.5)');
      // circle(this.ctx, contextComp.properties.leftConnCircle.center.x, contextComp.properties.leftConnCircle.center.y, contextComp.properties.leftConnCircle.radius, 'white', 'blue');
      // circle(this.ctx, contextComp.properties.rightConnCircle.center.x, contextComp.properties.rightConnCircle.center.y, contextComp.properties.rightConnCircle.radius, 'white', 'blue');
      // circle(this.ctx, contextComp.properties.topConnCircle.center.x, contextComp.properties.topConnCircle.center.y, contextComp.properties.topConnCircle.radius, 'white', 'blue');
      // circle(this.ctx, contextComp.properties.bottomConnCircle.center.x, contextComp.properties.bottomConnCircle.center.y, contextComp.properties.bottomConnCircle.radius, 'white', 'blue');
    });
  }
}