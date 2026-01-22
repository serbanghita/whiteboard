import Point from "./Point";

export default class Circle {
  constructor(
    public radius: number,
    public center: Point
  ) {}

  public intersectsWithPoint(point: Point): boolean {
    const dx = point.x - this.center.x;
    const dy = point.y - this.center.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
}
