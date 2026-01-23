import { Component } from "@serbanghita-gamedev/ecs";

export interface MouseComponentProps {
  x: number;
  y: number;
}

export default class MouseComponent extends Component<MouseComponentProps> {
  public isClicking: boolean = false;
  public prevX: number = 0;
  public prevY: number = 0;

  constructor(public properties: MouseComponentProps = { x: 0, y: 0 }) {
    super(properties);
    this.prevX = properties.x;
    this.prevY = properties.y;
  }

  public setXY(x: number, y: number): void {
    this.prevX = this.properties.x;
    this.prevY = this.properties.y;
    this.properties.x = x;
    this.properties.y = y;
  }

  public get x(): number {
    return this.properties.x;
  }

  public set x(value: number) {
    this.prevX = this.properties.x;
    this.properties.x = value;
  }

  public get y(): number {
    return this.properties.y;
  }

  public set y(value: number) {
    this.prevY = this.properties.y;
    this.properties.y = value;
  }

  public get deltaX(): number {
    return this.properties.x - this.prevX;
  }

  public get deltaY(): number {
    return this.properties.y - this.prevY;
  }
}
