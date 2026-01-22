import Point from "./Point";

export default class Rectangle {
  constructor(
    public width: number,
    public height: number,
    public center: Point
  ) {}

  public get topLeftX(): number {
    return this.center.x - this.width / 2;
  }

  public get topLeftY(): number {
    return this.center.y - this.height / 2;
  }

  public get topRightX(): number {
    return this.center.x + this.width / 2;
  }

  public get topRightY(): number {
    return this.center.y - this.height / 2;
  }

  public get bottomLeftX(): number {
    return this.center.x - this.width / 2;
  }

  public get bottomLeftY(): number {
    return this.center.y + this.height / 2;
  }

  public get bottomRightX(): number {
    return this.center.x + this.width / 2;
  }

  public get bottomRightY(): number {
    return this.center.y + this.height / 2;
  }

  public intersectsWithPoint(point: Point): boolean {
    return (
      point.x >= this.topLeftX &&
      point.x <= this.topRightX &&
      point.y >= this.topLeftY &&
      point.y <= this.bottomLeftY
    );
  }

  public moveCenterBy(dx: number, dy: number): void {
    this.center.x += dx;
    this.center.y += dy;
  }
}
