import { Component } from "@serbanghita-gamedev/ecs";
import { Point } from "@serbanghita-gamedev/geometry";

export interface MouseComponentInitProps {
  point: Point;
}

export default class MouseComponent extends Component {

  public readonly point: Point;
  public isClicking: boolean = false;

  constructor(public properties: MouseComponentInitProps) {
    super(properties);

    this.point = properties.point;
  }

  public setXY(x: number, y: number) {
    this.point.x = x;
    this.point.y = y;
  }

  public get x() {
    return this.point.x;
  }

  public get y() {
    return this.point.y;
  }
}
