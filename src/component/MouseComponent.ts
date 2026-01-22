import { Component } from "@serbanghita-gamedev/ecs";
import { Point } from "../geometry";

export interface MouseComponentInitProps {
  point: Point;
}

export default class MouseComponent extends Component {

  public readonly point: Point;
  public isClicking: boolean = false;
  public prevX: number = 0;
  public prevY: number = 0;

  constructor(public properties: MouseComponentInitProps) {
    super(properties);

    this.point = properties.point;
    this.prevX = properties.point.x;
    this.prevY = properties.point.y;
  }

  public setXY(x: number, y: number) {
    this.prevX = this.point.x;
    this.prevY = this.point.y;
    this.point.x = x;
    this.point.y = y;
  }

  public get x() {
    return this.point.x;
  }

  public get y() {
    return this.point.y;
  }

  public get deltaX() {
    return this.point.x - this.prevX;
  }

  public get deltaY() {
    return this.point.y - this.prevY;
  }
}
