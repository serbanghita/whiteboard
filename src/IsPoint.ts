import { Component } from "@serbanghita-gamedev/ecs";
import { Point } from "@serbanghita-gamedev/geometry";

export interface IsPointProps {
  x: number;
  y: number;
  point: Point;
}

export default class IsPoint extends Component {
  constructor(public properties: IsPointProps) {
    super(properties);

    this.properties.point = new Point(properties.x, properties.y);
  }
}
