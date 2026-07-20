import { Component } from "@serbanghita-gamedev/ecs";

export interface MouseComponentProps {
  x: number;
  y: number;
}

export default class MouseComponent extends Component<MouseComponentProps> {
  // Press/release tracking recorded at DOM-event time. Systems compare the
  // counters against their own last-seen values to detect edges; unlike
  // frame-sampling the IsMousePressed tag, this catches a release+press pair
  // that lands between two frames.
  public pressCount: number = 0;
  public releaseCount: number = 0;
  // Position of the last mousedown, captured at event time (a frame-time
  // sample would drop any movement between the event and the next frame).
  public pressX: number = 0;
  public pressY: number = 0;
  // Last raw screen (CSS-pixel) position. x/y hold world coordinates; the
  // wheel handler re-derives them from these when the camera zooms/pans
  // without the mouse moving.
  public screenX: number = 0;
  public screenY: number = 0;
  // Double-click tracking, same event-time edge-counter idiom as press():
  // TextEditSystem compares dblClickCount against its own last-seen value.
  public dblClickCount: number = 0;
  public dblClickX: number = 0;
  public dblClickY: number = 0;

  constructor(public properties: MouseComponentProps) {
    super(properties);
  }

  public setXY(x: number, y: number): void {
    this.properties.x = x;
    this.properties.y = y;
  }

  public press(x: number, y: number): void {
    this.pressX = x;
    this.pressY = y;
    this.pressCount++;
  }

  public release(): void {
    this.releaseCount++;
  }

  public doubleClick(x: number, y: number): void {
    this.dblClickX = x;
    this.dblClickY = y;
    this.dblClickCount++;
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
}
