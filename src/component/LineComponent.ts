import { Component } from "@serbanghita-gamedev/ecs";
import { StrokeStyle } from "../strokeStyle";

export type ArrowStyle = 'none' | 'arrow';

export interface LineComponentProps {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  strokeColor?: string;
  strokeWidth?: number;
  // undefined means solid; 'solid' is never stored (canonical absent key).
  strokeStyle?: StrokeStyle;
  // undefined means 'none'; 'none' is never stored so serialization stays
  // canonical (absent key) across toggles.
  arrowStart?: ArrowStyle;
  arrowEnd?: ArrowStyle;
}

export default class LineComponent extends Component<LineComponentProps> {
  constructor(public properties: LineComponentProps) {
    super(properties);
  }

  public get x1(): number {
    return this.properties.x1;
  }

  public set x1(value: number) {
    this.properties.x1 = value;
  }

  public get y1(): number {
    return this.properties.y1;
  }

  public set y1(value: number) {
    this.properties.y1 = value;
  }

  public get x2(): number {
    return this.properties.x2;
  }

  public set x2(value: number) {
    this.properties.x2 = value;
  }

  public get y2(): number {
    return this.properties.y2;
  }

  public set y2(value: number) {
    this.properties.y2 = value;
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

  public get arrowStart(): ArrowStyle | undefined {
    return this.properties.arrowStart;
  }

  public set arrowStart(value: ArrowStyle | undefined) {
    this.properties.arrowStart = value;
  }

  public get arrowEnd(): ArrowStyle | undefined {
    return this.properties.arrowEnd;
  }

  public set arrowEnd(value: ArrowStyle | undefined) {
    this.properties.arrowEnd = value;
  }

  public get length(): number {
    const dx = this.x2 - this.x1;
    const dy = this.y2 - this.y1;
    return Math.sqrt(dx * dx + dy * dy);
  }
}
