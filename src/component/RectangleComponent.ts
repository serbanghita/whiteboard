import { Component } from "@serbanghita-gamedev/ecs";
import { Rectangle, Point } from "@serbanghita-gamedev/geometry";

export interface RectangleComponentInitProps {
  x: number;
  y: number;
  width: number;
  height: number;
}

export default class RectangleComponent extends Component {
  public center: Point;
  public rectangle: Rectangle;

  constructor(public properties: RectangleComponentInitProps) {
    super(properties);

    this.center = new Point(properties.x, properties.y);
    this.rectangle = new Rectangle(properties.width, properties.height, this.center);
  }

  public get width() {
    return this.rectangle.width;
  }

  public get height() {
    return this.rectangle.height;
  }

  public get x() {
    return this.rectangle.topLeftX;
  }

  public get y() {
    return this.rectangle.topLeftY;
  }
}
