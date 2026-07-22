import { Component } from "@serbanghita-gamedev/ecs";
import { StrokeStyle } from "../strokeStyle";

export interface RectangleComponentProps {
  x: number;
  y: number;
  width: number;
  height: number;
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  // undefined means solid; 'solid' is never stored (canonical absent key).
  strokeStyle?: StrokeStyle;
  // Original system-design tool id (e.g. 'gw') for shapes drawn from the SYS
  // panel; absent on plain rectangles. The label text is user-editable, so
  // this is the only durable record of the semantic type.
  sysType?: string;
}

export default class RectangleComponent extends Component<RectangleComponentProps> {
  constructor(public properties: RectangleComponentProps) {
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

  public get width(): number {
    return this.properties.width;
  }

  public set width(value: number) {
    this.properties.width = value;
  }

  public get height(): number {
    return this.properties.height;
  }

  public set height(value: number) {
    this.properties.height = value;
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

  public get strokeStyle(): StrokeStyle | undefined {
    return this.properties.strokeStyle;
  }

  public set strokeStyle(value: StrokeStyle | undefined) {
    this.properties.strokeStyle = value;
  }

  public get sysType(): string | undefined {
    return this.properties.sysType;
  }

  public set sysType(value: string | undefined) {
    this.properties.sysType = value;
  }

  // Computed properties for convenience
  public get centerX(): number {
    return this.properties.x + this.properties.width / 2;
  }

  public get centerY(): number {
    return this.properties.y + this.properties.height / 2;
  }

  public get right(): number {
    return this.properties.x + this.properties.width;
  }

  public get bottom(): number {
    return this.properties.y + this.properties.height;
  }
}
