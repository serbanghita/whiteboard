import { Component } from "@serbanghita-gamedev/ecs";

export interface CircleComponentProps {
  x: number;
  y: number;
  radius: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
}

export default class CircleComponent extends Component<CircleComponentProps> {
  constructor(public properties: CircleComponentProps) {
    super(properties);
  }

  public get x(): number {
    return this.properties.x;
  }

  public set x(value: number) {
    this.properties.x = value;
  }

  public get y(): number {
    return this.properties.y;
  }

  public set y(value: number) {
    this.properties.y = value;
  }

  public get radius(): number {
    return this.properties.radius;
  }

  public set radius(value: number) {
    this.properties.radius = value;
  }

  public get fillColor(): string | undefined {
    return this.properties.fillColor;
  }

  public set fillColor(value: string | undefined) {
    this.properties.fillColor = value;
  }

  public get strokeColor(): string | undefined {
    return this.properties.strokeColor;
  }

  public set strokeColor(value: string | undefined) {
    this.properties.strokeColor = value;
  }

  public get strokeWidth(): number | undefined {
    return this.properties.strokeWidth;
  }

  public set strokeWidth(value: number | undefined) {
    this.properties.strokeWidth = value;
  }
}
