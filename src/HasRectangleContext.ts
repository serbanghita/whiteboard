import { Component } from "@serbanghita-gamedev/ecs";
import { Circle, Point, Rectangle } from "@serbanghita-gamedev/geometry";

type RectangleContextProps = {
  rectangle: Rectangle;
  leftConnCircle: Circle;
  rightConnCircle: Circle;
  topConnCircle: Circle;
  bottomConnCircle: Circle;
}

export default class HasRectangleContext extends Component {
  constructor(public properties: RectangleContextProps) {
    super(properties);
  }
}
