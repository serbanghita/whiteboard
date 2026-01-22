import { Component } from "@serbanghita-gamedev/ecs";
import { Rectangle, Point } from "../geometry";

export interface RectangleComponentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export default class RectangleComponent extends Component<RectangleComponentProps> {
  public center: Point;
  public rectangle: Rectangle;

  constructor(public properties: RectangleComponentProps) {
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

  public get fillColor(): string | undefined {
    return this.properties.fillColor;
  }

  public get strokeColor(): string | undefined {
    return this.properties.strokeColor;
  }

  public get strokeWidth(): number | undefined {
    return this.properties.strokeWidth;
  }
}
