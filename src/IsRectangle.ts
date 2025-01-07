import { Component } from "@serbanghita-gamedev/ecs";
import { Rectangle, Point } from "@serbanghita-gamedev/geometry";

export interface IsRectangleProps {
  width: number;
  height: number;
  x: number;
  y: number;
  rectangle: Rectangle;
}

export default class IsRectangle extends Component {
  constructor(public properties: IsRectangleProps) {
    super(properties);

    const center = new Point(properties.x + properties.width / 2, properties.y + properties.height / 2);
    this.properties.rectangle = new Rectangle(properties.width, properties.height, center);
  }
}
